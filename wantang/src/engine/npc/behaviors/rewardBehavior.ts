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

/** 找到角色所有需要赏赐的军队（士气 < 阈值），按士气升序 */
function findArmiesNeedingReward(actorId: string, threshold: number): {
  armyId: string;
  avgMorale: number;
}[] {
  const milStore = useMilitaryStore.getState();
  const armies = milStore.getArmiesByOwner(actorId);
  const result: { armyId: string; avgMorale: number }[] = [];

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
    if (avg < threshold) {
      result.push({ armyId: army.id, avgMorale: avg });
    }
  }

  result.sort((a, b) => a.avgMorale - b.avgMorale);
  return result;
}

// ── 行为定义 ────────────────────────────────────────────

interface RewardData {
  armies: { armyId: string; avgMorale: number }[];
  lowestMorale: number;
}

export const rewardBehavior: NpcBehavior<RewardData> = {
  id: 'reward',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<RewardData> | null {
    if (actor.resources.money <= 0) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const isAtWar = ctx.activeWars.some(w => isWarParticipant(actor.id, w));

    // 危险军队（< 30）→ 强制赏赐全部
    const critical = findArmiesNeedingReward(actor.id, 30);
    if (critical.length > 0) {
      return { data: { armies: critical, lowestMorale: critical[0].avgMorale }, weight: 100, forced: true };
    }

    // 正常情况：收集士气 < 50 的军队，低 weight 使大约一年赏赐一次
    const needReward = findArmiesNeedingReward(actor.id, 50);
    if (needReward.length === 0) return null;

    const modifiers: WeightModifier[] = [
      { label: '基础', add: 5 },
      ...(needReward[0].avgMorale < 40 ? [{ label: '士气偏低', add: 5 }] : []),
      ...(isAtWar ? [{ label: '战时', add: 20 }] : []),
      { label: '体恤', add: personality.compassion * 5 },
      { label: '贪财', add: -personality.greed * 10 },
    ];

    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    return { data: { armies: needReward, lowestMorale: needReward[0].avgMorale }, weight };
  },

  executeAsNpc(actor: Character, data: RewardData, _ctx: NpcContext) {
    // 逐支赏赐，直到钱花完
    for (const entry of data.armies) {
      const fresh = useCharacterStore.getState().getCharacter(actor.id);
      if (!fresh || fresh.resources.money <= 0) break;

      const milStore = useMilitaryStore.getState();
      const army = milStore.armies.get(entry.armyId);
      if (!army) continue;

      let totalStrength = 0;
      for (const batId of army.battalionIds) {
        const bat = milStore.battalions.get(batId);
        if (bat) totalStrength += bat.currentStrength;
      }
      if (totalStrength === 0) continue;

      const money = fresh.resources.money;
      // 按军队数量均分预算：基准 10 万贯 / 剩余军队数
      const remaining = data.armies.indexOf(entry);
      const armiesLeft = data.armies.length - remaining;
      const BASE = 100000;
      const totalBudget = money <= BASE
        ? money
        : Math.floor(BASE + (money - BASE) * 0.05);
      const budget = Math.floor(totalBudget / armiesLeft);
      if (budget <= 0) break;

      const moraleGain = budget * 6 / (totalStrength * 5);
      executeReward(actor.id, entry.armyId, budget, moraleGain);
    }
  },
};

registerBehavior(rewardBehavior);
