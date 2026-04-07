// ===== 军事操作 Action（从 MilitaryPanel UI 抽离） =====

import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { MAX_BATTALION_STRENGTH } from '@engine/military/types';
import type { UnitType } from '@engine/military/types';
import { debitTreasury, debitCapitalTreasury } from '@engine/territory/treasuryUtils';

/** 每兵征募费用（贯） */
export const RECRUIT_COST_PER_SOLDIER = 20;

/** 征兵：创建一个新营，扣减领地人口、征兵池和金钱 */
export function executeRecruit(
  armyId: string,
  territoryId: string,
  unitType: UnitType,
  name: string,
): void {
  const army = useMilitaryStore.getState().armies.get(armyId);
  if (!army) return;
  useMilitaryStore.getState().recruitBattalion(armyId, territoryId, unitType, name);
  const householdsLost = Math.floor(MAX_BATTALION_STRENGTH / 5);
  const moneyCost = MAX_BATTALION_STRENGTH * RECRUIT_COST_PER_SOLDIER;
  // 征兵费从 homeTerritory（兵源州）国库扣
  debitTreasury(territoryId, army.ownerId, { money: moneyCost });
  const territory = useTerritoryStore.getState().territories.get(territoryId);
  if (territory) {
    useTerritoryStore.getState().updateTerritory(territoryId, {
      basePopulation: Math.max(0, territory.basePopulation - householdsLost),
      populace: Math.max(0, territory.populace - 1),
      conscriptionPool: Math.max(0, territory.conscriptionPool - MAX_BATTALION_STRENGTH),
    });
  }
}

/** 赏赐：扣玩家钱，提升全军士气 */
export function executeReward(
  playerId: string,
  armyId: string,
  amount: number,
  moraleGain: number,
): void {
  const army = useMilitaryStore.getState().armies.get(armyId);
  if (!army) return;
  // 赏赐从 capital 国库扣
  debitCapitalTreasury(playerId, { money: amount });
  useMilitaryStore.getState().batchMutateBattalions((batsMap) => {
    for (const batId of army.battalionIds) {
      const bat = batsMap.get(batId);
      if (bat) {
        batsMap.set(batId, {
          ...bat,
          morale: Math.min(100, bat.morale + moraleGain),
        });
      }
    }
  });
}

/** 建军 */
export function executeCreateArmy(
  name: string,
  ownerId: string,
  locationId: string,
  postId: string | null,
): void {
  useMilitaryStore.getState().createArmy(name, ownerId, locationId, undefined, postId);
}

/** 换将（设置兵马使） */
export function executeSetCommander(
  armyId: string,
  commanderId: string | null,
): void {
  useMilitaryStore.getState().updateArmy(armyId, { commanderId });
}

/** 调营（转移营到另一个军） */
export function executeTransferBattalion(
  battalionId: string,
  targetArmyId: string,
): void {
  useMilitaryStore.getState().transferBattalion(battalionId, targetArmyId);
}

/** 裁营（解散营） */
export function executeDisbandBattalion(battalionId: string): void {
  useMilitaryStore.getState().disbandBattalion(battalionId);
}

/** 补员：补满营兵力，扣减籍贯地人口和金钱 */
export function executeReplenish(
  battalionId: string,
  territoryId: string,
  deficit: number,
  payerId: string,
): void {
  const moneyCost = deficit * RECRUIT_COST_PER_SOLDIER;
  // 补员费从 homeTerritory（兵源州）国库扣
  debitTreasury(territoryId, payerId, { money: moneyCost });
  useMilitaryStore.getState().updateBattalion(battalionId, { currentStrength: MAX_BATTALION_STRENGTH });
  const territory = useTerritoryStore.getState().territories.get(territoryId);
  if (territory) {
    const householdsLost = Math.floor(deficit / 5);
    useTerritoryStore.getState().updateTerritory(territoryId, {
      basePopulation: Math.max(0, territory.basePopulation - householdsLost),
      populace: Math.max(0, territory.populace - Math.ceil(deficit / 1000)),
      conscriptionPool: Math.max(0, territory.conscriptionPool - deficit),
    });
  }
}
