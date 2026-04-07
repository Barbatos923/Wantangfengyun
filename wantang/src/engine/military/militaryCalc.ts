// ===== 军事计算（纯函数） =====

import type { Territory } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import type { Battalion, Army, UnitTypeDef } from './types';

// ===== 兵役人口 =====

/**
 * 计算州的兵役人口上限（由户数决定）。
 * 军事型领地：basePopulation × 0.2（每户出0.2兵）
 * 民政型领地：basePopulation × 0.05（每户出0.05兵）
 */
export function getConscriptionCap(territory: Territory): number {
  const ratio = territory.territoryType === 'military' ? 0.2 : 0.05;
  return Math.floor(territory.basePopulation * ratio);
}

/**
 * 获取当前可征兵数（直接读取领地的 conscriptionPool）
 */
export function getAvailableRecruits(territory: Territory): number {
  return Math.floor(territory.conscriptionPool);
}

// ===== 军级聚合计算 =====

/** 获取军的总兵力 */
export function getArmyStrength(
  army: Army,
  battalions: Map<string, Battalion>,
): number {
  let total = 0;
  for (const batId of army.battalionIds) {
    const bat = battalions.get(batId);
    if (bat) total += bat.currentStrength;
  }
  return total;
}

/** 获取军的加权平均士气 */
export function getArmyMorale(
  army: Army,
  battalions: Map<string, Battalion>,
): number {
  let totalMorale = 0;
  let totalStrength = 0;
  for (const batId of army.battalionIds) {
    const bat = battalions.get(batId);
    if (bat && bat.currentStrength > 0) {
      totalMorale += bat.morale * bat.currentStrength;
      totalStrength += bat.currentStrength;
    }
  }
  return totalStrength > 0 ? totalMorale / totalStrength : 0;
}

/** 获取军的加权平均精锐度 */
export function getArmyElite(
  army: Army,
  battalions: Map<string, Battalion>,
): number {
  let totalElite = 0;
  let totalStrength = 0;
  for (const batId of army.battalionIds) {
    const bat = battalions.get(batId);
    if (bat && bat.currentStrength > 0) {
      totalElite += bat.elite * bat.currentStrength;
      totalStrength += bat.currentStrength;
    }
  }
  return totalStrength > 0 ? totalElite / totalStrength : 0;
}

/** 获取军的行军速度（木桶效应，取最慢的营的兵种速度） */
export function getArmyMarchSpeed(
  army: Army,
  battalions: Map<string, Battalion>,
  unitTypeDefs: Map<string, UnitTypeDef>,
): number {
  let minSpeed = Infinity;
  for (const batId of army.battalionIds) {
    const bat = battalions.get(batId);
    if (bat) {
      const def = unitTypeDefs.get(bat.unitType);
      if (def && def.marchSpeed < minSpeed) {
        minSpeed = def.marchSpeed;
      }
    }
  }
  return minSpeed === Infinity ? 0 : minSpeed;
}

/** 获取军的每月粮耗 */
export function getArmyMonthlyGrainCost(
  army: Army,
  battalions: Map<string, Battalion>,
  unitTypeDefs: Map<string, UnitTypeDef>,
): number {
  let total = 0;
  for (const batId of army.battalionIds) {
    const bat = battalions.get(batId);
    if (bat) {
      const def = unitTypeDefs.get(bat.unitType);
      if (def) {
        total += (bat.currentStrength / 1000) * def.grainCostPerThousand;
      }
    }
  }
  return Math.floor(total);
}

// ===== 军费总计 =====

/**
 * 计算某角色所有军队的月维护费。
 * 目前只计算粮耗，钱耗待定。
 */
export function getTotalMilitaryMaintenance(
  ownerId: string,
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
  unitTypeDefs: Map<string, UnitTypeDef>,
  ownerArmyIndex?: Map<string, Set<string>>,
): { money: number; grain: number } {
  let totalGrain = 0;
  // 优先用 ownerArmyIndex 局部遍历
  const armyIds = ownerArmyIndex?.get(ownerId);
  if (armyIds) {
    for (const armyId of armyIds) {
      const army = armies.get(armyId);
      if (army) totalGrain += getArmyMonthlyGrainCost(army, battalions, unitTypeDefs);
    }
  } else {
    for (const army of armies.values()) {
      if (army.ownerId === ownerId) {
        totalGrain += getArmyMonthlyGrainCost(army, battalions, unitTypeDefs);
      }
    }
  }
  return { money: 0, grain: totalGrain };
}

// ===== 军费分州计算（国库系统） =====

import type { MilitarySupplyResult } from '@engine/official/types';
import { findNearestFriendlyZhou } from '@engine/territory/treasuryUtils';

/**
 * 计算角色每支军队的军费供给来源（按军队驻地找最近友方州）。
 *
 * - 军队在己方州 → 该州国库扣粮
 * - findPath 找到最近友方州 → 该州国库扣粮
 * - findPath 被关隘阻断 → blocked=true，不扣粮（月结时扣士气）
 * - 角色无领地 → fromPrivate=true，从私产扣
 */
export function getMilitaryMaintenanceByTerritory(
  ownerId: string,
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
  unitTypeDefs: Map<string, UnitTypeDef>,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  controllerIndex: Map<string, Set<string>>,
  ownerArmyIndex?: Map<string, Set<string>>,
): MilitarySupplyResult[] {
  const results: MilitarySupplyResult[] = [];
  const controlledIds = controllerIndex.get(ownerId);
  const hasTerritory = controlledIds && controlledIds.size > 0;

  const armyIds = ownerArmyIndex?.get(ownerId);
  const armiesToProcess: Army[] = [];
  if (armyIds) {
    for (const aid of armyIds) {
      const a = armies.get(aid);
      if (a) armiesToProcess.push(a);
    }
  } else {
    for (const a of armies.values()) {
      if (a.ownerId === ownerId) armiesToProcess.push(a);
    }
  }

  for (const army of armiesToProcess) {
    const grainCost = getArmyMonthlyGrainCost(army, battalions, unitTypeDefs);
    if (grainCost === 0) {
      results.push({ armyId: army.id, supplyZhouId: null, grainCost: 0, blocked: false, fromPrivate: false });
      continue;
    }

    if (!hasTerritory) {
      // 无领地，从私产扣
      results.push({ armyId: army.id, supplyZhouId: null, grainCost, blocked: false, fromPrivate: true });
      continue;
    }

    const nearestZhou = findNearestFriendlyZhou(
      army.locationId, ownerId, territories, characters, controllerIndex,
    );

    if (nearestZhou) {
      results.push({ armyId: army.id, supplyZhouId: nearestZhou, grainCost, blocked: false, fromPrivate: false });
    } else {
      // 有领地但被关隘阻断
      results.push({ armyId: army.id, supplyZhouId: null, grainCost, blocked: true, fromPrivate: false });
    }
  }

  return results;
}

