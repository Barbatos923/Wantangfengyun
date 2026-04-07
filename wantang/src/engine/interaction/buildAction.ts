// ===== 建造建筑 =====

import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { debitTreasury } from '@engine/territory/treasuryUtils';

/** 执行建造/升级建筑：从本州国库扣费 + 开始施工 */
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
  debitTreasury(territoryId, playerId, { money: moneyCost, grain: grainCost });
  useTerritoryStore.getState().startConstruction(territoryId, {
    slotIndex,
    buildingId,
    targetLevel,
    remainingMonths: duration,
  });
}
