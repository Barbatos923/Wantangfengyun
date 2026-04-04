// ===== NpcContext 工厂：月结快照构建 =====

import type { NpcContext } from './types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { calcPersonality } from '@engine/character/personalityUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { getArmyStrength } from '@engine/military/militaryCalc';

/**
 * 一次性从所有 Store 读取快照，构建 NpcContext。
 * 此后 behavior 模块的 generateTask 只使用 context 参数，不直接调 getState()。
 */
export function buildNpcContext(): NpcContext {
  const charState = useCharacterStore.getState();
  const terrState = useTerritoryStore.getState();
  const turnState = useTurnManager.getState();
  const milState = useMilitaryStore.getState();
  const warState = useWarStore.getState();

  const { characters } = charState;
  const { territories, centralPosts, expectedLegitimacy, controllerIndex } = terrState;
  const { armies, battalions } = milState;

  // ── 预计算缓存 ──

  const personalityCache = new Map<string, import('@data/traits').Personality>();
  const rankLevelCache = new Map<string, number>();

  for (const char of characters.values()) {
    if (!char.alive) continue;
    personalityCache.set(char.id, calcPersonality(char));
    rankLevelCache.set(char.id, char.official?.rankLevel ?? 0);
  }

  // ── lazy-cached 好感度 ──

  const opinionCacheMap = new Map<string, Map<string, number>>();

  function getOpinion(aId: string, bId: string): number {
    let innerMap = opinionCacheMap.get(aId);
    if (innerMap) {
      const cached = innerMap.get(bId);
      if (cached !== undefined) return cached;
    } else {
      innerMap = new Map();
      opinionCacheMap.set(aId, innerMap);
    }
    const a = characters.get(aId);
    const b = characters.get(bId);
    if (!a || !b) {
      innerMap.set(bId, 0);
      return 0;
    }
    const bExpectedLeg = expectedLegitimacy.get(bId) ?? null;
    const value = calculateBaseOpinion(a, b, bExpectedLeg);
    innerMap.set(bId, value);
    return value;
  }

  // ── lazy-cached 兵力 ──

  const militaryCache = new Map<string, number>();

  function getMilitaryStrength(charId: string): number {
    const cached = militaryCache.get(charId);
    if (cached !== undefined) return cached;
    const armies = milState.getArmiesByOwner(charId);
    let total = 0;
    for (const army of armies) {
      total += getArmyStrength(army, milState.battalions);
    }
    militaryCache.set(charId, total);
    return total;
  }

  // ── 活跃战争 ──

  const activeWars = warState.getActiveWars();

  return {
    date: { ...turnState.currentDate },
    era: turnState.era,
    characters,
    territories,
    centralPosts,
    playerId: charState.playerId,
    personalityCache,
    rankLevelCache,
    expectedLegitimacyCache: expectedLegitimacy,
    getOpinion,
    getMilitaryStrength,
    armies,
    battalions,
    controllerIndex,
    activeWars,
    appointedThisRound: new Set(),
  };
}
