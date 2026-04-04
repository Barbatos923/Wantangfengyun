// ===== NPC 征兵补员行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { MAX_BATTALION_STRENGTH } from '@engine/military/types';
import { executeReplenish } from '@engine/interaction/militaryAction';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { registerBehavior } from './index';

// ── 辅助 ────────────────────────────────────────────────

/** 计算角色总兵力和兵力上限 */
function getMilitaryStatus(actorId: string): {
  current: number;
  max: number;
  lowMoraleCount: number;
  weakBattalions: Array<{ battalionId: string; territoryId: string; deficit: number }>;
} {
  const milStore = useMilitaryStore.getState();
  const armies = milStore.getArmiesByOwner(actorId);
  let current = 0;
  let max = 0;
  let lowMoraleCount = 0;
  const weakBattalions: Array<{ battalionId: string; territoryId: string; deficit: number }> = [];

  for (const army of armies) {
    for (const batId of army.battalionIds) {
      const bat = milStore.battalions.get(batId);
      if (!bat) continue;
      current += bat.currentStrength;
      max += MAX_BATTALION_STRENGTH;
      if (bat.morale < 50) lowMoraleCount++;
      const deficit = MAX_BATTALION_STRENGTH - bat.currentStrength;
      if (deficit > 100) {
        weakBattalions.push({
          battalionId: batId,
          territoryId: bat.homeTerritory,
          deficit,
        });
      }
    }
  }

  return { current, max, lowMoraleCount, weakBattalions };
}

// ── 行为定义 ────────────────────────────────────────────

interface RecruitData {
  weakBattalions: Array<{ battalionId: string; territoryId: string; deficit: number }>;
}

export const recruitBehavior: NpcBehavior<RecruitData> = {
  id: 'recruit',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<RecruitData> | null {
    if (!actor.isRuler) return null;

    const { current, max, weakBattalions } = getMilitaryStatus(actor.id);
    if (max === 0 || weakBattalions.length === 0) return null;

    const fillRate = current / max;
    if (fillRate >= 0.9) return null; // 兵力充足不补

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const isAtWar = ctx.activeWars.some(w => isWarParticipant(actor.id, w));

    const modifiers: WeightModifier[] = [
      // 基础：和平补兵
      { label: '基础', add: 15 },

      // 状态驱动
      ...(isAtWar ? [{ label: '战时紧急', add: 25 }] : []),
      ...(fillRate < 0.5 ? [{ label: '兵力不足', add: 15 }] : []),

      // 人格驱动
      { label: '贪财', add: -personality.greed * 20 },
      { label: '尚武', add: personality.boldness * 10 },

      // 硬切：没钱不补
      ...(actor.resources.money < 50 ? [{ label: '资金不足', factor: 0 }] : []),
    ];

    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    return { data: { weakBattalions }, weight };
  },

  executeAsNpc(actor: Character, data: RecruitData, _ctx: NpcContext) {
    const sorted = [...data.weakBattalions].sort((a, b) => b.deficit - a.deficit);
    let count = 0;
    for (const bat of sorted) {
      if (count >= 3) break;
      if (actor.resources.money < 50) break;
      executeReplenish(bat.battalionId, bat.territoryId, bat.deficit, actor.id);
      count++;
    }
  },
};

registerBehavior(recruitBehavior);
