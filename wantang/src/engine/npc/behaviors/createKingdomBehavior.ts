// ===== NPC 行为：称王 / 建镇 =====

import type { Character } from '@engine/character/types';
import type { NpcBehavior, NpcContext, BehaviorTaskResult } from '../types';
import { calcWeight } from '../types';
import { registerBehavior } from './index';
import { canCreatePost, calcRealmControlRatio, calcPostManageCost } from '@engine/official/postManageCalc';
import { executeCreateKingdom } from '@engine/decision';

interface CreateTitleData {
  territoryId: string;
  ratio: number;
}

export const createKingdomBehavior: NpcBehavior<CreateTitleData> = {
  id: 'createKingdom',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<CreateTitleData> | null {
    if (!actor.isRuler) return null;

    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    let bestWeight = 0;
    let bestData: CreateTitleData | null = null;

    for (const t of ctx.territories.values()) {
      if (t.tier !== 'guo' && t.tier !== 'dao') continue;

      // 品级门槛：guo 需 17+，dao 需 12+
      if (t.tier === 'guo' && rankLevel < 17) continue;
      if (t.tier === 'dao' && rankLevel < 12) continue;

      // 资源检查（金钱看 capital 国库，声望看私产）
      const cost = calcPostManageCost('create', t.tier);
      const capMoney = ctx.capitalTreasury.get(actor.id)?.money ?? actor.resources.money;
      if (capMoney < cost.money || actor.resources.prestige < cost.prestige) continue;

      // 先算 ratio 做早期剪枝
      const ratio = calcRealmControlRatio(t.id, actor.id, ctx.territories, ctx.characters);
      if (ratio < 0.5) continue;

      const result = canCreatePost(actor.id, t.id, ctx.territories, ctx.characters);
      if (!result.eligible) continue;

      const modifiers = [
        { label: '基础', add: t.tier === 'guo' ? 30 : 20 },
        { label: '野心', add: personality.greed * 15 },
        { label: '胆量', add: personality.boldness * 10 },
        { label: '控制比例', add: ratio >= 0.8 ? 20 : ratio >= 0.6 ? 10 : 0 },
        ...(t.tier === 'guo' ? [{ label: '国级', add: 15 }] : []),
        ...(rankLevel >= 25 ? [{ label: '品级高', add: 15 }] : []),
      ];

      const weight = calcWeight(modifiers);
      if (weight > bestWeight) {
        bestWeight = weight;
        bestData = { territoryId: t.id, ratio };
      }
    }

    if (!bestData || bestWeight <= 0) return null;
    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: CreateTitleData, _ctx: NpcContext) {
    executeCreateKingdom(actor.id, data.territoryId);
  },
};

registerBehavior(createKingdomBehavior);
