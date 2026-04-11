// ===== NPC 离间行为 =====
//
// 月度低频自愿行为：找一个"结构上值得动手"的 primaryTarget + 一个与之有关系的 secondaryTarget
// + 选最优方法。playerMode: 'skip' —— NPC 自主，玩家被离间不发启动通知（隐秘性本质）；
// 结算时由 schemeSystem 推 StoryEvent 通知玩家。
//
// **候选池设计（CK3 风格，窄而聚焦）**：
//   primary 只有三类：
//     1. 直属上级（削弱自己的领主）
//     2. 直接臣属（分化自己的下属）
//     3. 相邻的同级统治者（跨势力 sabotage，比如河北 vs 河南的节度使）
//   secondary 从 primary 的关系直接展开：
//     - primary 的直接领主 / 直接臣属 / 盟友
//     - 故意去掉父母/配偶/子女（叙事上家庭离间太私密，不适合政治计谋）
//
//   两层候选都是从已知关系直接展开，避免 O(N) 全表扫描。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { executeInitiateScheme } from '@engine/interaction/schemeAction';
import { calcSchemeLimit } from '@engine/scheme';
import {
  ALIENATION_COST,
  getAvailableAlienationMethods,
  type AlienationMethodDef,
} from '@engine/scheme/types/alienation';
import { random } from '@engine/random';
import { positionMap } from '@data/positions';
import { registerBehavior } from './index';

/** 能稳定选择最优方法的谋略门槛（低于此值 NPC 在三种方法中随机选） */
const ALIENATE_STRATEGY_GATE_FOR_BEST_METHOD = 12;

/** 离间的岗位门槛：节度使级别（minRank 17）以上 */
const ALIENATE_MIN_RANK = 17;

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

interface AlienateData {
  primaryTargetId: string;
  secondaryTargetId: string;
  methodId: string;
}

/**
 * 从 primary 的关系直接展开 secondary 候选集（避免全表扫描）。
 * 包括：直接领主 / 直接臣属 / 盟友。
 *
 * **故意不包含**：
 *   - 父母 / 配偶 / 子女（家庭离间叙事太私密，不适合政治型计谋）
 *   - 同势力同僚（O(N) 展开太贵）
 * 玩家 UI 路径（`getValidSecondaryAlienationTargets`）用完整 `hasRelationship`，比 NPC 宽。
 */
function collectRelatedSecondary(
  primary: Character,
  ctx: NpcContext,
  excludeId: string,  // 排除发起人自己
): Character[] {
  const result: Character[] = [];
  const seen = new Set<string>();

  function add(id: string | undefined): void {
    if (!id || id === primary.id || id === excludeId || seen.has(id)) return;
    const c = ctx.characters.get(id);
    if (!c?.alive) return;
    seen.add(id);
    result.push(c);
  }

  // 直接领主
  add(primary.overlordId);
  // 直接臣属（vassalIndex 是预聚合 O(1) 查询）
  const vassals = ctx.vassalIndex.get(primary.id);
  if (vassals) {
    for (const vId of vassals) add(vId);
  }
  // 盟友（用 NpcContext 快照查询）
  for (const allyId of ctx.getAllies(primary.id)) add(allyId);

  return result;
}

/**
 * 收集 actor 的 primary 目标候选池。三类：
 *   1. 直属上级
 *   2. 直接臣属
 *   3. 相邻同级或更高级统治者（跨势力 sabotage，走 NpcContext.getPeerNeighbors 快照缓存）
 *
 * 性能：~50-100 ops / 次（peerNeighbors 已在 NpcContext 中 lazy 缓存，同 tick 内多个 behavior
 * 共享同一视图），比全表扫 ctx.characters (~8000+ ops with getOpinion) 便宜两个数量级。
 */
function collectAlienationPrimaryCandidates(
  actor: Character,
  ctx: NpcContext,
): Character[] {
  const result: Character[] = [];
  const seen = new Set<string>();

  function add(id: string | undefined): void {
    if (!id || id === actor.id || seen.has(id)) return;
    const c = ctx.characters.get(id);
    if (!c?.alive) return;
    seen.add(id);
    result.push(c);
  }

  // 1. 直属上级
  add(actor.overlordId);

  // 2. 直接臣属
  const vassals = ctx.vassalIndex.get(actor.id);
  if (vassals) {
    for (const vId of vassals) add(vId);
  }

  // 3. 相邻同级或更高级统治者（NpcContext 快照，多 behavior 共享；rank ≥ 17 硬过滤）
  // seen 集自然去重：如果相邻 peer 恰好就是 actor 的直接上级或臣属，已在步骤 1/2 加入
  for (const peerId of ctx.getPeerNeighbors(actor.id)) {
    add(peerId);
  }

  return result;
}

const alienateBehavior: NpcBehavior<AlienateData> = {
  id: 'alienate',
  playerMode: 'skip',           // NPC 自主
  schedule: 'monthly-slot',     // 低频

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<AlienateData> | null {
    if (!actor.alive) return null;

    // 岗位门槛：节度使级别（minRank ≥ 17）以上才会主动用离间
    // 用 actor 持有所有岗位中最高的 minRank 判定
    if (getActorMaxMinRank(actor, ctx) < ALIENATE_MIN_RANK) return null;

    // 资源门槛：留出 1.5× 余量
    if (actor.resources.money < ALIENATION_COST * 1.5) return null;

    // 并发上限：高谋略角色（如顶级谋士 strategy ≥ 16）可同时跑多个计谋
    // calcSchemeLimit(10)=1, (16)=2, (24)=3, (32)=4
    const limit = calcSchemeLimit(actor.abilities.strategy);
    if ((ctx.schemeCounts.get(actor.id) ?? 0) >= limit) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    // 注：personality 范围 [-1, 1]，默认 0。不做硬门槛——
    // honor / vengefulness 直接通过 weight 公式里的乘数体现倾向性。
    // （旧版本写 sociability < 0.4 / vengefulness < 0.5 是错误用法，
    //  会砍掉 ~95% NPC，因为大部分 NPC 的 personality 都接近 0）

    const methods = getAvailableAlienationMethods();

    // 构造一个 SchemeContext shim 复用 NpcContext 的预聚合（避免每次 calcBonus 都重建闭包）。
    // 三种方法的 calcBonus 只用到 getOpinion / characters / territories，桥接到 NpcContext 已有字段。
    const schemeCtxShim = {
      characters: ctx.characters,
      territories: ctx.territories,
      currentDate: ctx.date,
      getOpinion: ctx.getOpinion,
      hasAlliance: ctx.hasAlliance,
      vassalIndex: ctx.vassalIndex,
    };

    let bestWeight = 0;
    let bestData: AlienateData | null = null;

    // actor 是否带"阴险"类特质（乐于离间）
    const isViciousActor =
      actor.traitIds.includes('trait-deceitful') ||
      actor.traitIds.includes('trait-cruel');

    // primary 候选池：直属上级 + 直接臣属 + 相邻同级统治者（窄而聚焦）
    const primaryCandidates = collectAlienationPrimaryCandidates(actor, ctx);
    if (primaryCandidates.length === 0) return null;

    for (const primary of primaryCandidates) {
      // 仇恨门槛：-15（早期放宽，从候选池收窄后，只有真带结构价值的目标进入）
      const opinionToPrimary = ctx.getOpinion(actor.id, primary.id);
      if (opinionToPrimary > -15) continue;

      // per-target CD：同一 primaryTarget 365 天内跳过（NpcContext 快照查询）
      if (ctx.hasRecentSchemeOnTarget(actor.id, primary.id, 'alienation')) continue;

      // secondary 从 primary 关系直接展开（领主/臣属/盟友）
      const relatedCandidates = collectRelatedSecondary(primary, ctx, actor.id);
      if (relatedCandidates.length === 0) continue;

      // primary 级结构判定（循环外算，所有 secondary 共享）
      const primaryIsMyAlly = ctx.hasAlliance(actor.id, primary.id);
      // primary 对 actor 的反向好感（primary 很讨厌 actor 时触发"目标敌视"加成）
      const reverseOpinion = ctx.getOpinion(primary.id, actor.id);

      for (const secondary of relatedCandidates) {
        // 选方法：谋略 ≥ 12 的 actor 稳定挑 bonus 最高的（"知道对方弱点"）；
        // 谋略 < 12 的 actor 在三种方法中随机选（"看运气瞎蒙"）。
        // 注意：bestBonus **不**计入 weight，只影响后续的初始成功率。
        let chosenMethod: AlienationMethodDef | null = null;
        if (actor.abilities.strategy >= ALIENATE_STRATEGY_GATE_FOR_BEST_METHOD) {
          let bestBonus = -1;
          for (const method of methods) {
            const bonus = method.calcBonus(primary, secondary, actor, schemeCtxShim);
            if (bonus > bestBonus) {
              bestBonus = bonus;
              chosenMethod = method;
            }
          }
        } else {
          const idx = Math.floor(random() * methods.length);
          chosenMethod = methods[idx] ?? methods[0] ?? null;
        }
        if (!chosenMethod) continue;

        // ── 加法修正：基础 + 基础惩罚 + 仇恨 + 性格 ──
        // 参考 curryFavor CK3 改造：加法负偏置压低 mean，保留 tail；
        // NpcEngine 槽位系统已按品级分档，这里不做全局 factor 调速。
        // 方法对症**不**进 weight——方法只决定成功率。
        const modifiers: WeightModifier[] = [
          { label: '基础', add: 3 },
          { label: '基础惩罚', add: -6 },
          // 仇恨：op=-15 给 0，op=-30 给 4.5，op=-60 给 13.5，op=-100 给 25.5
          { label: '仇恨', add: Math.max(0, (-opinionToPrimary - 15) * 0.3) },
          // 性格（加法软修正）
          { label: '复仇心', add: personality.vengefulness * 6 },
          { label: '胆识', add: personality.boldness * 3 },
          { label: '荣誉(负向)', add: -personality.honor * 6 },
        ];

        // ── 乘法修正：CK3 ai_will_do 风格 ──

        // primary 对 actor 很敌视 → ×1.5（先下手为强，防御性计谋）
        if (reverseOpinion < -15) {
          modifiers.push({ label: '目标敌视', factor: 1.5 });
        }

        // secondary 是 primary 的直接盟友 → ×1.8（切断盟友关系是经典离间操作）
        if (ctx.hasAlliance(primary.id, secondary.id)) {
          modifiers.push({ label: '切断盟约', factor: 1.8 });
        }

        // secondary 是 primary 的强力直接臣属 → ×1.8（打击对方武力资产）
        if (
          secondary.overlordId === primary.id
          && ctx.getMilitaryStrength(secondary.id) > 1000
        ) {
          modifiers.push({ label: '打击强臣', factor: 1.8 });
        }

        // actor 阴险特质 ×1.5（deceitful / cruel 任一即可）
        if (isViciousActor) {
          modifiers.push({ label: '阴险特质', factor: 1.5 });
        }

        // 盟友豁免 ×0（硬禁：不对直接盟友发动离间，哪怕深仇也忍住）
        if (primaryIsMyAlly) {
          modifiers.push({ label: '盟友豁免', factor: 0 });
        }

        const weight = calcWeight(modifiers);

        if (weight > bestWeight) {
          bestWeight = weight;
          bestData = {
            primaryTargetId: primary.id,
            secondaryTargetId: secondary.id,
            methodId: chosenMethod.id,
          };
        }
      }
    }

    // 最低触发门槛：6% 作为"值得动手"底线。weight 本身已通过加法负偏置 + 乘法 tail 拉开分布，
    // 普通低烈度目标自然落在 minWeight 之下被筛掉
    if (!bestData || bestWeight < 6) return null;

    return {
      data: bestData,
      weight: bestWeight,
    };
  },

  executeAsNpc(actor, data, _ctx) {
    // 离间是隐秘行为，发起时不通知任何人；结算时 schemeSystem 推 StoryEvent
    executeInitiateScheme(actor.id, 'alienation', {
      primaryTargetId: data.primaryTargetId,
      secondaryTargetId: data.secondaryTargetId,
      methodId: data.methodId,
    });
  },
};

registerBehavior(alienateBehavior);

export { alienateBehavior };
