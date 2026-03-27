// ===== 军事计算（纯函数） =====

import type { Territory } from '@engine/territory/types';
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
): { money: number; grain: number } {
  let totalGrain = 0;
  for (const army of armies.values()) {
    if (army.ownerId === ownerId) {
      totalGrain += getArmyMonthlyGrainCost(army, battalions, unitTypeDefs);
    }
  }
  return { money: 0, grain: totalGrain };
}
