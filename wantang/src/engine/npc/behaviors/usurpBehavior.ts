// ===== NPC 行为：篡夺头衔 =====

import type { Character } from '@engine/character/types';
import type { NpcBehavior, NpcContext, BehaviorTaskResult } from '../types';
import { calcWeight } from '../types';
import { registerBehavior } from './index';
import { canUsurpPost, calcRealmControlRatio, calcPostManageCost } from '@engine/official/postManageCalc';
import { executeUsurp } from '@engine/interaction';
import { positionMap } from '@data/positions';

interface UsurpData {
  postId: string;
  holderId: string;
  territoryId: string;
}

export const usurpBehavior: NpcBehavior<UsurpData> = {
  id: 'usurp',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<UsurpData> | null {
    if (!actor.isRuler) return null;

    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    if (rankLevel < 12) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    let bestWeight = 0;
    let bestData: UsurpData | null = null;

    // 扫描所有 guo/dao 级领地的 grantsControl 岗位
    for (const t of ctx.territories.values()) {
      if (t.tier !== 'guo' && t.tier !== 'dao') continue;

      for (const post of t.posts) {
        const tpl = positionMap.get(post.templateId);
        if (!tpl?.grantsControl || !post.holderId) continue;
        if (post.holderId === actor.id) continue;

        const result = canUsurpPost(actor.id, post, t, ctx.territories, ctx.characters, ctx.activeWars);
        if (!result.eligible) continue;

        // 资源检查
        const cost = calcPostManageCost('usurp', t.tier);
        if (actor.resources.money < cost.money || actor.resources.prestige < cost.prestige) continue;

        const ratio = calcRealmControlRatio(t.id, actor.id, ctx.territories, ctx.characters);
        const opinion = ctx.getOpinion(actor.id, post.holderId);

        const modifiers = [
          { label: '基础', add: 20 },
          { label: '野心', add: personality.greed * 12 },
          { label: '胆量', add: personality.boldness * 8 },
          { label: '控制比例', add: ratio >= 0.8 ? 15 : ratio >= 0.6 ? 5 : 0 },
          { label: '厌恶持有者', add: opinion < -30 ? 10 : 0 },
          // guo 级篡夺权重更高
          ...(t.tier === 'guo' ? [{ label: '国级', add: 10 }] : []),
        ];

        const weight = calcWeight(modifiers);
        if (weight > bestWeight) {
          bestWeight = weight;
          bestData = { postId: post.id, holderId: post.holderId, territoryId: t.id };
        }
      }
    }

    if (!bestData || bestWeight <= 0) return null;
    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: UsurpData, _ctx: NpcContext) {
    executeUsurp(data.postId, actor.id);
  },
};

registerBehavior(usurpBehavior);
