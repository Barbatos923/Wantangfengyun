// ===== NPC 离间行为 =====
//
// 月度低频自愿行为：找一个有负面好感的目标 + 一个与之有关系的次要目标 + 选最优方法。
// playerMode: 'skip' —— NPC 自主，玩家被离间不发启动通知（隐秘性本质）；
// 结算时由 schemeSystem 推 StoryEvent 通知玩家。
//
// **性能纪律**：
//   secondary 候选必须从 primary 的关系**直接展开**（领主/臣属/亲属），
//   禁止 `for (c of ctx.characters.values())` 全表扫描——后者在 ~160 角色的场景下
//   单次 generateTask 约 1.3M 步，全场 NPC 累加足以拖慢游戏速度。
//   primary 的关系通常 < 10 个，比 N=160 小一个数量级。

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
import { positionMap } from '@data/positions';
import { registerBehavior } from './index';

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
 * 包括：直接领主 / 直接臣属 / 父母 / 配偶 / 子女。
 *
 * **不包括**：同势力同僚（O(N) 展开太贵）和同盟（NPC 通常不会主动离间盟友间关系）。
 * 这两条玩家在 UI 路径里仍然能选——`getValidSecondaryAlienationTargets` 用完整的 hasRelationship。
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
  // 亲属
  add(primary.family.fatherId);
  add(primary.family.motherId);
  add(primary.family.spouseId);
  for (const cid of primary.family.childrenIds) add(cid);

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

    // 资源门槛：留出 2× 余量
    if (actor.resources.money < ALIENATION_COST * 2) return null;

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

    // 扫描有负面好感的目标作为 primaryTarget
    for (const primary of ctx.characters.values()) {
      if (primary.id === actor.id) continue;
      if (!primary.alive) continue;

      // actor 对 primary 的好感越负越想离间
      // 提高仇恨门槛 -10 → -25，只对深仇敌动手
      const opinionToPrimary = ctx.getOpinion(actor.id, primary.id);
      if (opinionToPrimary > -25) continue;

      // per-target CD：同一 primaryTarget 365 天内跳过（NpcContext 快照查询）
      if (ctx.hasRecentSchemeOnTarget(actor.id, primary.id, 'alienation')) continue;

      // 关键性能优化：从 primary 的关系直接展开候选，避免 N×N 全表扫描
      const relatedCandidates = collectRelatedSecondary(primary, ctx, actor.id);
      if (relatedCandidates.length === 0) continue;

      for (const secondary of relatedCandidates) {
        // 选 calcBonus 最高的方法
        let bestMethod: AlienationMethodDef | null = null;
        let bestBonus = -1;
        for (const method of methods) {
          const bonus = method.calcBonus(primary, secondary, actor, schemeCtxShim);
          if (bonus > bestBonus) {
            bestBonus = bonus;
            bestMethod = method;
          }
        }
        if (!bestMethod) continue;

        // 权重：压低各项数值后再 × 全局调速因子 0.3
        const modifiers: WeightModifier[] = [
          { label: '基础', add: 3 },                                    // 8 → 3
          { label: '仇恨', add: Math.abs(opinionToPrimary) * 0.2 },     // 0.4 → 0.2
          { label: '方法对症', add: bestBonus * 0.3 },                  // 0.5 → 0.3
          { label: '复仇心', add: personality.vengefulness * 8 },       // 12 → 8
          { label: '胆识', add: personality.boldness * 4 },             // 6 → 4
          { label: '荣誉(负向)', add: -personality.honor * 8 },
          // 全局调速因子：把整体触发概率打到约 1/3
          { label: '调速', factor: 0.3 },
        ];
        const weight = calcWeight(modifiers);

        if (weight > bestWeight) {
          bestWeight = weight;
          bestData = {
            primaryTargetId: primary.id,
            secondaryTargetId: secondary.id,
            methodId: bestMethod.id,
          };
        }
      }
    }

    // 提高最低触发门槛 12 → 6（因为 factor 拉低数值）
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
