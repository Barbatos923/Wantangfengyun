// ===== 领地工具函数 =====

import type { Territory } from './types';
import type { Abilities } from '@engine/character/types';
import { buildingMap } from '@data/buildings';

/** 限制值在min~max之间 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ===== 建筑加成汇总 =====

export interface BuildingBonuses {
  money: number;
  grain: number;
  troops: number;
  defense: number;
  controlPerMonth: number;
  developmentPerMonth: number;
  populacePerMonth: number;
  stressReduction: number;
  grainStorage: number;
}

/** 计算领地所有建筑的加成总和 */
export function getBuildingBonuses(territory: Territory): BuildingBonuses {
  const bonuses: BuildingBonuses = {
    money: 0, grain: 0, troops: 0, defense: 0,
    controlPerMonth: 0, developmentPerMonth: 0,
    populacePerMonth: 0, stressReduction: 0, grainStorage: 0,
  };

  for (const slot of territory.buildings) {
    if (!slot.buildingId || slot.level <= 0) continue;
    const def = buildingMap.get(slot.buildingId);
    if (!def) continue;
    bonuses.money += def.moneyPerLevel * slot.level;
    bonuses.grain += def.grainPerLevel * slot.level;
    bonuses.troops += def.troopsPerLevel * slot.level;
    bonuses.defense += def.defensePerLevel * slot.level;
    bonuses.controlPerMonth += def.controlPerMonthPerLevel * slot.level;
    bonuses.developmentPerMonth += def.developmentPerMonthPerLevel * slot.level;
    bonuses.populacePerMonth += def.populacePerMonthPerLevel * slot.level;
    bonuses.stressReduction += def.stressReductionPerLevel * slot.level;
    bonuses.grainStorage += def.grainStoragePerLevel * slot.level;
  }

  return bonuses;
}

// ===== 月产出计算 =====

export interface MonthlyIncome {
  money: number;
  grain: number;
  troops: number;
}

/** 计算领地每月产出 */
export function calculateMonthlyIncome(
  territory: Territory,
  rulerAbilities: Abilities,
): MonthlyIncome {
  if (territory.tier !== 'zhou') return { money: 0, grain: 0, troops: 0 };
  const bonuses = getBuildingBonuses(territory);
  const { basePopulation, development, control, populace } = territory;

  const money =
    basePopulation * 0.01 * (development / 100) * (control / 100)
    * (1 + rulerAbilities.administration * 0.02)
    + bonuses.money;

  const grain =
    basePopulation * 0.02 * (development / 100) * (control / 100)
    * (1 + rulerAbilities.administration * 0.015)
    + bonuses.grain;

  const troops =
    basePopulation * 0.001 * (control / 100) * (populace / 100)
    * (1 + rulerAbilities.military * 0.02)
    + bonuses.troops;

  return { money, grain, troops };
}

// ===== 属性漂移 =====

export interface AttributeDrift {
  control: number;
  development: number;
  populace: number;
}

/** 计算领地每月属性漂移 */
export function calculateAttributeDrift(
  territory: Territory,
  rulerTraitIds: string[],
): AttributeDrift {
  if (territory.tier !== 'zhou') return { control: 0, development: 0, populace: 0 };
  const bonuses = getBuildingBonuses(territory);

  // 控制度：向目标值漂移，每月最多±2
  const dejureMatch = territory.dejureControllerId === territory.actualControllerId;
  const controlTarget = dejureMatch ? 80 : 40;
  let controlDrift = 0;
  if (territory.control < controlTarget) {
    controlDrift = Math.min(2, controlTarget - territory.control);
  } else if (territory.control > controlTarget) {
    controlDrift = Math.max(-2, controlTarget - territory.control);
  }
  controlDrift += bonuses.controlPerMonth;

  // 发展度
  let devDrift = territory.control > 50 ? 0.2 : -0.1;
  devDrift += bonuses.developmentPerMonth;

  // 民心
  let populaceDrift = -0.5; // 基础衰减
  // 公正特质 +0.5
  if (rulerTraitIds.includes('trait-just')) populaceDrift += 0.5;
  // 残暴特质 -1.0
  if (rulerTraitIds.includes('trait-cruel')) populaceDrift -= 1.0;
  populaceDrift += bonuses.populacePerMonth;

  return { control: controlDrift, development: devDrift, populace: populaceDrift };
}

/** 应用属性漂移到领地 */
export function applyAttributeDrift(territory: Territory, drift: AttributeDrift): Partial<Territory> {
  if (territory.tier !== 'zhou') return {};
  return {
    control: clamp(territory.control + drift.control, 0, 100),
    development: clamp(territory.development + drift.development, 0, 100),
    populace: clamp(territory.populace + drift.populace, 0, 100),
  };
}
