// ===== NPC 要求效忠行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { canDemandFealtyPure, calcFealtyChance, executeDemandFealty } from '@engine/interaction';
import { registerBehavior } from './index';

// ── 辅助：获取角色持有的岗位（从 Context 快照） ─────────

function getPostsByHolderFromCtx(
  holderId: string,
  ctx: NpcContext,
): Post[] {
  const posts: Post[] = [];
  for (const t of ctx.territories.values()) {
    for (const p of t.posts) {
      if (p.holderId === holderId) posts.push(p);
    }
  }
  for (const p of ctx.centralPosts) {
    if (p.holderId === holderId) posts.push(p);
  }
  return posts;
}

// ── 行为定义 ────────────────────────────────────────────

interface DemandFealtyData {
  targetId: string;
  chance: number;
}

export const demandFealtyBehavior: NpcBehavior<DemandFealtyData> = {
  id: 'demandFealty',
  playerMode: 'skip', // 玩家自己从交互菜单发起

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<DemandFealtyData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    if (rankLevel < 9) return null; // 七品以下不主动要求效忠

    let bestWeight = 0;
    let bestData: DemandFealtyData | null = null;

    for (const target of ctx.characters.values()) {
      if (!target.alive || target.id === actor.id) continue;
      if (target.overlordId === actor.id) continue; // 已效忠

      // 纯函数版检查
      const targetPosts = getPostsByHolderFromCtx(target.id, ctx);
      const actorPosts = getPostsByHolderFromCtx(actor.id, ctx);
      if (!canDemandFealtyPure(actor, target, ctx.territories, targetPosts, actorPosts)) continue;

      // 计算成功率
      const opinion = ctx.getOpinion(target.id, actor.id);
      const myStr = ctx.getMilitaryStrength(actor.id);
      const theirStr = ctx.getMilitaryStrength(target.id);
      const targetPersonality = ctx.personalityCache.get(target.id);
      if (!targetPersonality) continue;

      const { chance } = calcFealtyChance(opinion, myStr, theirStr, targetPersonality);

      // ── 权重计算：Base(0) + Add + Factor（CK3 模式） ──
      const modifiers: WeightModifier[] = [
        // 人格驱动
        { label: '荣誉感', add: -personality.honor * 8 },
        { label: '贪婪', add: personality.greed * 6 },
        { label: '胆量', add: personality.boldness * 4 },

        // 成功率评估
        { label: '成功率', add: chance >= 70 ? 10 : chance >= 50 ? 5 : chance >= 30 ? 2 : -5 },

        // 品级修正
        ...(rankLevel < 17 ? [{ label: '低品级', factor: 0.5 }] : []),
      ];

      const weight = calcWeight(modifiers);

      if (weight > bestWeight) {
        bestWeight = weight;
        bestData = { targetId: target.id, chance };
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: DemandFealtyData, _ctx: NpcContext) {
    executeDemandFealty(actor.id, data.targetId);
  },
};

registerBehavior(demandFealtyBehavior);
