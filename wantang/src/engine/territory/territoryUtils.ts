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
  const { basePopulation, development, control, populace, moneyRatio, grainRatio } = territory;

  const K = 0.9;
  const totalOutput = basePopulation * K * (development / 100) * (control / 100)
    * (1 + rulerAbilities.administration * 0.02);

  const ratioSum = moneyRatio + grainRatio;
  const money = totalOutput * (moneyRatio / ratioSum) + bonuses.money;
  const grain = totalOutput * (grainRatio / ratioSum) + bonuses.grain;

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
  rulerAbilities?: Abilities,
): AttributeDrift {
  if (territory.tier !== 'zhou') return { control: 0, development: 0, populace: 0 };
  const bonuses = getBuildingBonuses(territory);
  const military = rulerAbilities?.military ?? 10;
  const administration = rulerAbilities?.administration ?? 10;

  // 控制度：向目标值收敛，目标 = military × 5（封顶100）
  const controlTarget = Math.min(100, military * 5);
  let controlDrift = (controlTarget - territory.control) * 0.08;
  controlDrift += bonuses.controlPerMonth;

  // 发展度：向目标值收敛，目标 = administration × 5（封顶100）
  const devTarget = Math.min(100, administration * 5);
  let devDrift = (devTarget - territory.development) * 0.08;
  devDrift += bonuses.developmentPerMonth;

  // 民心：由控制度和发展度驱动
  // 均值100→+1/月，均值20→-1/月，均值60→0
  const avg = (territory.control + territory.development) / 2;
  let populaceDrift = (avg - 60) / 40;
  if (rulerTraitIds.includes('trait-just')) populaceDrift += 0.5;
  if (rulerTraitIds.includes('trait-cruel')) populaceDrift -= 1.0;
  populaceDrift += bonuses.populacePerMonth;

  return { control: controlDrift, development: devDrift, populace: populaceDrift };
}

/** 应用属性漂移到领地 */
export function applyAttributeDrift(territory: Territory, drift: AttributeDrift): Partial<Territory> {
  if (territory.tier !== 'zhou') return {};
  return {
    control: clamp(territory.control + drift.control, 20, 100),
    development: clamp(territory.development + drift.development, 20, 100),
    populace: clamp(territory.populace + drift.populace, 0, 100),
  };
}
