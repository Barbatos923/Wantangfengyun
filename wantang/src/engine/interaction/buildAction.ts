// ===== 建造建筑 =====

import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';

/** 执行建造/升级建筑：扣除资源 + 开始施工 */
export function executeBuild(
  playerId: string,
  territoryId: string,
  slotIndex: number,
  buildingId: string,
  targetLevel: number,
  moneyCost: number,
  grainCost: number,
  duration: number,
): void {
  useCharacterStore.getState().addResources(playerId, { money: -moneyCost, grain: -grainCost });
  useTerritoryStore.getState().startConstruction(territoryId, {
    slotIndex,
    buildingId,
    targetLevel,
    remainingMonths: duration,
  });
}
