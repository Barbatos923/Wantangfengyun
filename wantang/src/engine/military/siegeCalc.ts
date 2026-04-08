// ===== 围城计算（纯函数） =====

import type { Territory } from '@engine/territory/types';
import type { Battalion, Army } from './types';
import type { UnitTypeDef } from './types';
import { unitTypeMap } from '@data/unitTypes';
import { positionMap } from '@data/positions';

/**
 * 计算每月围城进度（0-100）。
 * 防守方兵力越多，分母越大，进度越慢。
 *
 * 非关隘：progress = attackerTroops / ((households / 500) + defenderTroops / 10)
 * 关隘：progress = totalSiegeValue / (passLevel × 2 + defenderTroops / 500)
 */
export function calcMonthlyProgress(
  attackerTroops: number,
  totalSiegeValue: number,
  territory: Territory,
  defenderTroops: number,
): number {
  const passLevel = territory.passLevel ?? 0;

  if (passLevel > 0) {
    // 关隘围城：靠攻城属性 + 守军增加难度
    return totalSiegeValue / (passLevel * 2 + defenderTroops / 500);
  }

  // 非关隘：大军压境，守军增加阻力
  const households = Math.max(1000, territory.basePopulation);
  return attackerTroops / (households / 500 + defenderTroops / 10);
}

/**
 * 计算守军每月损耗率。
 * 基础15%，精锐度和士气各可减少最多5%。
 * 范围：5% ~ 15%。
 */
export function calcDefenderAttritionRate(
  avgElite: number,  // 0-100
  avgMorale: number, // 0-100
): number {
  return 0.15 - (avgElite / 100) * 0.05 - (avgMorale / 100) * 0.05;
}

/**
 * 计算某州内防守方的总兵力。
 * 防守方 = 属于守方阵营、驻扎在该州的所有军队。
 */
export function calcDefenderTroops(
  territoryId: string,
  defenderIds: ReadonlySet<string>,
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
): number {
  let total = 0;
  for (const army of armies.values()) {
    if (!defenderIds.has(army.ownerId) || army.locationId !== territoryId) continue;
    for (const batId of army.battalionIds) {
      const bat = battalions.get(batId);
      if (bat) total += bat.currentStrength;
    }
  }
  return total;
}

/**
 * 计算防守方守军的加权平均精锐度和士气。
 */
export function calcDefenderStats(
  territoryId: string,
  defenderIds: ReadonlySet<string>,
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
): { avgElite: number; avgMorale: number } {
  let totalElite = 0;
  let totalMorale = 0;
  let totalStrength = 0;
  for (const army of armies.values()) {
    if (!defenderIds.has(army.ownerId) || army.locationId !== territoryId) continue;
    for (const batId of army.battalionIds) {
      const bat = battalions.get(batId);
      if (bat && bat.currentStrength > 0) {
        totalElite += bat.elite * bat.currentStrength;
        totalMorale += bat.morale * bat.currentStrength;
        totalStrength += bat.currentStrength;
      }
    }
  }
  if (totalStrength === 0) return { avgElite: 0, avgMorale: 0 };
  return {
    avgElite: totalElite / totalStrength,
    avgMorale: totalMorale / totalStrength,
  };
}

/**
 * 对围城中的防守方守军施加月度损耗。
 * 减少各营的 currentStrength。
 */
export function applyDefenderAttrition(
  territoryId: string,
  defenderIds: ReadonlySet<string>,
  attritionRate: number,
  armies: Map<string, Army>,
  _battalions: Map<string, Battalion>,
  mutateBattalions: (mutator: (bats: Map<string, Battalion>) => void) => void,
): void {
  const batIdsToAttrit: string[] = [];
  for (const army of armies.values()) {
    if (!defenderIds.has(army.ownerId) || army.locationId !== territoryId) continue;
    for (const batId of army.battalionIds) {
      batIdsToAttrit.push(batId);
    }
  }
  if (batIdsToAttrit.length === 0) return;

  mutateBattalions((bats) => {
    for (const batId of batIdsToAttrit) {
      const bat = bats.get(batId);
      if (!bat || bat.currentStrength <= 0) continue;
      const loss = Math.ceil(bat.currentStrength * attritionRate);
      const newStrength = Math.max(0, bat.currentStrength - loss);
      bats.set(batId, { ...bat, currentStrength: newStrength });
    }
  });
}

/**
 * 计算行营的总攻城属性值。
 */
export function calcTotalSiegeValue(
  armyIds: string[],
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
): number {
  let total = 0;
  for (const armyId of armyIds) {
    const army = armies.get(armyId);
    if (!army) continue;
    for (const batId of army.battalionIds) {
      const bat = battalions.get(batId);
      if (!bat) continue;
      const def: UnitTypeDef | undefined = unitTypeMap.get(bat.unitType);
      if (def) {
        total += (bat.currentStrength / 1000) * def.siege;
      }
    }
  }
  return total;
}

/**
 * 计算行营的总兵力。
 */
export function calcCampaignTroops(
  armyIds: string[],
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
): number {
  let total = 0;
  for (const armyId of armyIds) {
    const army = armies.get(armyId);
    if (!army) continue;
    for (const batId of army.battalionIds) {
      const bat = battalions.get(batId);
      if (bat) total += bat.currentStrength;
    }
  }
  return total;
}

/**
 * 获取州的控制者ID。
 */
export function getTerritoryController(territory: Territory): string | null {
  const mainPost = territory.posts.find((p) => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.grantsControl === true;
  });
  return mainPost?.holderId ?? null;
}
