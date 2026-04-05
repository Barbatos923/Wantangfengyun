// ===== 军事计算（纯函数） =====

import type { Territory } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import type { Battalion, Army, UnitTypeDef } from './types';
import { unitTypeMap } from '@data/unitTypes';
import { calculateMonthlyIncome } from '@engine/territory/territoryUtils';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { getTributeRatio } from '@engine/official/economyCalc';

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

// ===== 粮草估算 =====

/**
 * 轻量估算角色月粮草净收入：领地粮产出 + 臣属贡奉 - 向上级缴纳 - 军费粮耗。
 * 传入 tributeCtx 时计算贡奉收支，否则仅算领地产出（向后兼容）。
 */
export function estimateNetGrain(
  actor: Character,
  controlledZhou: Territory[],
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
  ownerArmyIndex?: Map<string, Set<string>>,
  tributeCtx?: {
    characters: Map<string, Character>;
    territories: Map<string, Territory>;
    getControlledZhou: (charId: string) => Territory[];
  },
): number {
  const abilities = getEffectiveAbilities(actor);
  let grainIncome = 0;
  for (const t of controlledZhou) {
    grainIncome += calculateMonthlyIncome(t, abilities).grain;
  }

  // 臣属贡奉收入 + 向上级缴纳支出
  let tributeNet = 0;
  if (tributeCtx) {
    // 臣属贡奉收入
    for (const vassal of tributeCtx.characters.values()) {
      if (!vassal.alive || vassal.overlordId !== actor.id) continue;
      const vassalAbilities = getEffectiveAbilities(vassal);
      const vassalZhou = tributeCtx.getControlledZhou(vassal.id);
      let vassalGrain = 0;
      for (const t of vassalZhou) {
        vassalGrain += calculateMonthlyIncome(t, vassalAbilities).grain;
      }
      const ratio = getTributeRatio(vassal.centralization ?? 2, vassalZhou[0]?.territoryType ?? 'civil');
      tributeNet += vassalGrain * ratio;
    }

    // 向上级缴纳
    if (actor.overlordId) {
      const myRatio = getTributeRatio(actor.centralization ?? 2, controlledZhou[0]?.territoryType ?? 'civil');
      tributeNet -= grainIncome * myRatio;
    }
  }

  const { grain: grainCost } = getTotalMilitaryMaintenance(
    actor.id, armies, battalions, unitTypeMap, ownerArmyIndex,
  );
  return grainIncome + tributeNet - grainCost;
}
