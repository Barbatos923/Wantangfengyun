// ===== NPC 拉拢行为 =====
//
// 月度低频自愿行为：从 actor 的"已知人际"池子里挑一个最值得拉拢的目标。
// playerMode: 'skip' —— NPC 自主，target 是玩家时**不**通知（拉拢是善意行为，
// 在结算时如果成功了再通过 schemeSystem 的 notifySchemeResolved 弹一次 StoryEvent）。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { executeInitiateScheme } from '@engine/interaction/schemeAction';
import { calcSchemeLimit } from '@engine/scheme';
import { resolveSpymaster } from '@engine/scheme/spymasterCalc';
import { CURRY_FAVOR_COST } from '@engine/scheme/types/curryFavor';
import { positionMap } from '@data/positions';
import { registerBehavior } from './index';

/** 拉拢的岗位门槛：刺史级别（minRank 12）以上 */
const CURRY_FAVOR_MIN_RANK = 12;

/** 计算 actor 持有的所有岗位中 minRank 最高的那个（无岗位 = 0） */
function getActorMaxMinRank(actor: Character, ctx: NpcContext): number {
  const postIds = ctx.holderIndex.get(actor.id) ?? [];
  let maxRank = 0;
  for (const pid of postIds) {
    const post = ctx.postIndex.get(pid);
    if (!post) continue;
    const tmpl = positionMap.get(post.templateId);
    if (tmpl && tmpl.minRank > maxRank) maxRank = tmpl.minRank;
  }
  return maxRank;
}

interface CurryFavorData {
  targetId: string;
}

/**
 * 拉拢候选池：从 actor 的"已知人际"展开，避免全场扫描。
 *
 * 包括：
 *   1. 直接领主
 *   2. 直接臣属
 *   3. 家庭（父母 / 配偶 / 子女）
 *   4. 同朝为官（actor 在中央任职时，所有中央同僚）
 *   5. 邻居（同一州的其他角色，用 locationIndex O(1) 查）
 *
 * 这些都是"叙事上有真实交集"的关系，比扫全场 ~160 角色既快又合理。
 * 典型候选数 ~10-30，远小于全场。
 */
function collectCurryFavorCandidates(actor: Character, ctx: NpcContext): Character[] {
  const result: Character[] = [];
  const seen = new Set<string>();

  function add(id: string | undefined): void {
    if (!id || id === actor.id || seen.has(id)) return;
    const c = ctx.characters.get(id);
    if (!c?.alive) return;
    seen.add(id);
    result.push(c);
  }

  // 1. 直接领主
  add(actor.overlordId);

  // 2. 直接臣属
  const vassals = ctx.vassalIndex.get(actor.id);
  if (vassals) {
    for (const vId of vassals) add(vId);
  }

  // 3. 家庭
  add(actor.family.fatherId);
  add(actor.family.motherId);
  add(actor.family.spouseId);
  for (const cid of actor.family.childrenIds) add(cid);

  // 4. 同朝为官：actor 持有任何 central post → 所有 central post 持有人都算同僚
  const actorPostIds = ctx.holderIndex.get(actor.id) ?? [];
  const actorIsCentral = actorPostIds.some(pid =>
    ctx.centralPosts.some(p => p.id === pid)
  );
  if (actorIsCentral) {
    for (const post of ctx.centralPosts) {
      if (post.holderId) add(post.holderId);
    }
  }

  // 5. 邻居：同 locationId 的其他角色（locationIndex O(1) 查）
  if (actor.locationId) {
    const sameZhou = ctx.locationIndex.get(actor.locationId);
    if (sameZhou) {
      for (const cid of sameZhou) add(cid);
    }
  }

  return result;
}

const curryFavorBehavior: NpcBehavior<CurryFavorData> = {
  id: 'curryFavor',
  playerMode: 'skip',           // NPC 自主，玩家拉拢走 UI
  schedule: 'monthly-slot',     // 低频自愿行为

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<CurryFavorData> | null {
    if (!actor.alive) return null;

    // 岗位门槛：刺史级别（minRank ≥ 12）以上才会主动用拉拢
    // 用 actor 持有所有岗位中最高的 minRank 判定
    if (getActorMaxMinRank(actor, ctx) < CURRY_FAVOR_MIN_RANK) return null;

    // 资源门槛：留出 3× 余量，避免拉拢把 NPC 国库拖垮
    if (actor.resources.money < CURRY_FAVOR_COST * 3) return null;

    // 并发上限：使用谋主 strategy（NPC 月结自动选最优臣属）
    const sm = resolveSpymaster(actor.id, ctx.spymasters, ctx.characters, ctx.vassalIndex);
    const limit = calcSchemeLimit(sm.abilities.strategy);
    if ((ctx.schemeCounts.get(actor.id) ?? 0) >= limit) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    // 注：personality.sociability 范围 [-1, 1]，默认 0。
    // 不做硬门槛——直接乘进 weight 即可（参考其他 behavior 的统一做法）。

    // 从"已知人际"展开候选池（远小于全场 160）
    const candidates = collectCurryFavorCandidates(actor, ctx);
    if (candidates.length === 0) return null;

    // CK3 ai_will_do 风格：基础分低 + 加法凸显"战略关系" + 乘法凸显"特别值得"。
    // NpcEngine 槽位系统已按品级分档（王公 2/月、节度使 1/月、刺史 0.5/月），
    // 这里不再做 rank 二次调速，由 weight 本身的离散度（mean 低 / tail 高）
    // 完成降频。weight=chance%，所以只有"真值得拉"的目标 weight 才会进入 20-60 区间。
    let bestWeight = 0;
    let bestTarget: string | null = null;

    for (const target of candidates) {
      // per-target CD 过滤（365 天内重复拉拢同一目标直接跳过，走 NpcContext 快照）
      if (ctx.hasRecentSchemeOnTarget(actor.id, target.id, 'curryFavor')) continue;

      const targetToActor = ctx.getOpinion(target.id, actor.id);
      // 底线：好感 < -80 成功率太低，纯亏钱
      if (targetToActor < -80) continue;

      const isOverlord = target.id === actor.overlordId;
      const isVassal = target.overlordId === actor.id;
      const targetMil = isVassal ? ctx.getMilitaryStrength(target.id) : 0;
      const isStrongVassal = isVassal && targetMil > 1000;

      // ── 加法修正：基础分 + "有没有战略关系" ──
      // 故意**不**给"政治地位 targetRank * 0.6"这种均质化加分——
      // 它会让每个高品 NPC 对所有高品目标都 +17，拉拢退化成随机社交。
      //
      // 基础惩罚 -8：我们 NPC 的 slot 频率比 CK3 高一个数量级（emperor 2/月 vs CK3 半年/次），
      // 但按比例缩 factor 会把"真值得"和"凑数"的 weight 差距压扁。
      // 用加法负偏置可以直接把 mean 往 0 推，保留 tail 的大小关系——
      // strategic 候选 sum ~20-25 → 减 8 后 12-17，仍有显著概率；
      // 非 strategic sum ~5-10 → 减 8 后 0（被 Math.max(0,sum) 截断）→ filtered。
      const modifiers: WeightModifier[] = [
        { label: '基础', add: 2 },
        { label: '基础惩罚', add: -8 },
      ];

      // 关系修复：对我负面才加分（正面就不用拉）。系数和 cap 都压小，
      // 让这一项只是"锦上添花"而非"拉拢主驱动"——主驱动是下面的乘法修正。
      if (targetToActor < 20) {
        modifiers.push({
          label: '关系修复',
          add: Math.min(10, (20 - targetToActor) * 0.2),
        });
      }

      // 结构关系加分
      if (isOverlord) modifiers.push({ label: '直接领主', add: 6 });
      if (isVassal) modifiers.push({ label: '直接臣属', add: 4 });

      // ── 乘法修正：凸显"特别值得"的场景 ──

      // 负好感的直属臣属 → 反叛风险，必须笼络（×3）
      if (isVassal && targetToActor < -10) {
        modifiers.push({ label: '反叛风险', factor: 3 });
      }

      // 强力负好感臣属 → 再 ×1.5（叠加上面总 ×4.5）
      if (isStrongVassal && targetToActor < -10) {
        modifiers.push({ label: '强力臣属', factor: 1.5 });
      }

      // 直接领主对我负面 → 修复向上关系（×2.5）
      if (isOverlord && targetToActor < 0) {
        modifiers.push({ label: '修复上级', factor: 2.5 });
      }

      // 已经高好感 → 不必再拉（×0.3）
      if (targetToActor > 50) {
        modifiers.push({ label: '已亲近', factor: 0.3 });
      }

      // ── 性格乘法（CK3 风格） ──
      // sociability: [-1, 1] → factor [0.5, 1.5]
      modifiers.push({
        label: '社交性格',
        factor: 1 + personality.sociability * 0.5,
      });
      // 复仇心高的不爱拉拢：vengefulness>0 时 factor [1.0, 0.7]
      if (personality.vengefulness > 0) {
        modifiers.push({
          label: '复仇心',
          factor: 1 - personality.vengefulness * 0.3,
        });
      }

      const weight = calcWeight(modifiers);

      if (weight > bestWeight) {
        bestWeight = weight;
        bestTarget = target.id;
      }
    }

    // 最低触发门槛：10% 作为"值得动手"的底线。
    // 配合 CK3 风格的乘法修正（反叛风险 ×3 / 修复上级 ×2.5 / 强臣 ×1.5），
    // 有战略价值的候选轻松过 10，无价值的候选天然被筛掉。
    if (!bestTarget || bestWeight < 10) return null;

    return {
      data: { targetId: bestTarget },
      weight: bestWeight,
    };
  },

  executeAsNpc(actor, data, _ctx) {
    // 拉拢是非敌对行为，目标是玩家时也直接执行（不需要玩家批准）
    // 结算时若成功 schemeSystem 会推送 StoryEvent 通知玩家
    executeInitiateScheme(actor.id, 'curryFavor', { primaryTargetId: data.targetId });
  },
};

registerBehavior(curryFavorBehavior);

export { curryFavorBehavior };
