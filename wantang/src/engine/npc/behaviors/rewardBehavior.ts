// ===== NPC 赏赐行为（防止兵变） =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { executeReward } from '@engine/interaction/militaryAction';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { registerBehavior } from './index';

// ── 辅助 ────────────────────────────────────────────────

/** 找到角色士气最低的军队 */
function findLowestMoraleArmy(actorId: string): {
  armyId: string;
  avgMorale: number;
} | null {
  const milStore = useMilitaryStore.getState();
  const armies = milStore.getArmiesByOwner(actorId);
  let worst: { armyId: string; avgMorale: number } | null = null;

  for (const army of armies) {
    if (army.battalionIds.length === 0) continue;
    let sum = 0;
    let count = 0;
    for (const batId of army.battalionIds) {
      const bat = milStore.battalions.get(batId);
      if (bat) { sum += bat.morale; count++; }
    }
    if (count === 0) continue;
    const avg = sum / count;
    if (!worst || avg < worst.avgMorale) {
      worst = { armyId: army.id, avgMorale: avg };
    }
  }

  return worst;
}

// ── 行为定义 ────────────────────────────────────────────

interface RewardData {
  armyId: string;
  avgMorale: number;
}

export const rewardBehavior: NpcBehavior<RewardData> = {
  id: 'reward',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<RewardData> | null {
    if (!actor.isRuler) return null;

    const worst = findLowestMoraleArmy(actor.id);
    if (!worst) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const isAtWar = ctx.activeWars.some(w => isWarParticipant(actor.id, w));

    // 士气危险（< 30）→ 强制赏赐
    if (worst.avgMorale < 30 && actor.resources.money > 0) {
      return { data: { armyId: worst.armyId, avgMorale: worst.avgMorale }, weight: 100, forced: true };
    }

    // 正常情况：低 weight 使大约一年赏赐一次（~8%/月）
    const modifiers: WeightModifier[] = [
      { label: '基础', add: 5 },

      // 状态驱动
      ...(worst.avgMorale < 40 ? [{ label: '士气偏低', add: 5 }] : []),
      ...(isAtWar ? [{ label: '战时', add: 20 }] : []),

      // 人格驱动
      { label: '体恤', add: personality.compassion * 5 },
      { label: '贪财', add: -personality.greed * 10 },

      // 硬切
      ...(actor.resources.money <= 0 ? [{ label: '资金不足', factor: 0 }] : []),
    ];

    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    return { data: { armyId: worst.armyId, avgMorale: worst.avgMorale }, weight };
  },

  executeAsNpc(actor: Character, data: RewardData, _ctx: NpcContext) {
    const milStore = useMilitaryStore.getState();
    const army = milStore.armies.get(data.armyId);
    if (!army) return;

    // 计算军队总兵力
    let totalStrength = 0;
    for (const batId of army.battalionIds) {
      const bat = milStore.battalions.get(batId);
      if (bat) totalStrength += bat.currentStrength;
    }
    if (totalStrength === 0) return;

    const fresh = useCharacterStore.getState().getCharacter(actor.id);
    if (!fresh) return;
    const money = fresh.resources.money;
    if (money <= 0) return;

    // 基准 10 万贯；钱多时多赏一点（超出部分的 5%）
    const BASE = 100000;
    const budget = money <= BASE
      ? money  // 钱不够就全给
      : Math.floor(BASE + (money - BASE) * 0.05);

    // 公式与 UI 一致：moraleGain = amount × 6 / (totalStrength × 5)
    const moraleGain = budget * 6 / (totalStrength * 5);
    executeReward(actor.id, data.armyId, budget, moraleGain);
  },
};

registerBehavior(rewardBehavior);
