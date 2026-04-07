// ===== 经济计算（纯函数） =====

import type { Character } from '@engine/character/types';
import type { Territory, CentralizationLevel, TerritoryType, Post } from '@engine/territory/types';
import type { MonthlyLedger } from './types';
import { rankMap } from '@data/ranks';
import { positionMap } from '@data/positions';
import { calculateMonthlyIncome } from '@engine/territory/territoryUtils';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { getControlledZhou, getHeldPosts, getSubordinates, getVassals } from './postQueries';
import type { Army, Battalion } from '@engine/military/types';
import { getTotalMilitaryMaintenance } from '@engine/military/militaryCalc';
import { unitTypeMap } from '@data/unitTypes';

// ===== 内部辅助 =====

function sumMG(
  a: { money: number; grain: number },
  b: { money: number; grain: number },
): { money: number; grain: number } {
  return { money: a.money + b.money, grain: a.grain + b.grain };
}

// ===== 公共函数 =====

/**
 * 根据赋税等级和领地类型返回朝贡比例。
 */
export function getTributeRatio(centralization: CentralizationLevel, territoryType: TerritoryType): number {
  if (territoryType === 'military') {
    switch (centralization) {
      case 1: return 0.10;
      case 2: return 0.20;
      case 3: return 0.35;
      case 4: return 0.50;
    }
  } else {
    switch (centralization) {
      case 1: return 0.40;
      case 2: return 0.60;
      case 3: return 0.80;
      case 4: return 0.95;
    }
  }
}

/**
 * 判定角色控制某领地时的领地类型。
 */
export function getCharacterTerritoryType(
  char: Character,
  territory: Territory,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): TerritoryType {
  const heldPosts = getHeldPosts(char.id, territories, centralPosts);
  for (const post of heldPosts) {
    if (post.territoryId === territory.id || post.territoryId === territory.parentId) {
      const posDef = positionMap.get(post.templateId);
      if (posDef?.territoryType) return posDef.territoryType;
    }
  }
  return territory.territoryType;
}

/**
 * 计算角色每月应获得的薪俸。
 */
export function calculateSalary(
  char: Character,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): { money: number; grain: number } {
  if (!char.official) return { money: 0, grain: 0 };

  const rankDef = rankMap.get(char.official.rankLevel);
  let salary = rankDef
    ? { money: rankDef.monthlySalary.money, grain: rankDef.monthlySalary.grain }
    : { money: 0, grain: 0 };

  const heldPosts = getHeldPosts(char.id, territories, centralPosts);
  for (const post of heldPosts) {
    const posDef = positionMap.get(post.templateId);
    if (posDef) {
      salary = sumMG(salary, posDef.salary);
    }
  }

  return salary;
}

/**
 * 计算角色本月应增加的贤能值。
 */
export function calculateMonthlyVirtue(
  char: Character,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): number {
  if (!char.official) return 0;

  const heldPosts = getHeldPosts(char.id, territories, centralPosts);
  let virtue = 0;

  if (heldPosts.length > 0) {
    virtue += 1;
  }

  const abilities = getEffectiveAbilities(char);
  if (abilities.administration > 10) {
    virtue += (abilities.administration - 10) * 0.1;
  }

  const hasCentralPosition = heldPosts.some((post) => {
    const def = positionMap.get(post.templateId);
    return def?.scope === 'central';
  });
  if (hasCentralPosition) {
    virtue += 1;
  }

  return Math.max(0, virtue);
}

/**
 * 计算角色本月完整的收支明细。
 */
export function calculateMonthlyLedger(
  char: Character,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  centralPosts: Post[],
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
): MonthlyLedger {
  const zero = { money: 0, grain: 0 };

  // ── 自身领地产出 ──
  const abilities = getEffectiveAbilities(char);
  let territoryIncome = { ...zero };

  const controlledZhou = getControlledZhou(char.id, territories);
  for (const territory of controlledZhou) {
    const inc = calculateMonthlyIncome(territory, abilities);
    territoryIncome = sumMG(territoryIncome, { money: inc.money, grain: inc.grain });
  }

  // ── 薪俸 ──
  const positionSalary = calculateSalary(char, territories, centralPosts);

  // ── 下属列表 ──
  const vassals = getVassals(char.id, characters);

  // ── 下属贡奉 ──
  let vassalTribute = { ...zero };

  for (const vassal of vassals) {
    const vassalAbilities = getEffectiveAbilities(vassal);
    let vassalIncome = { ...zero };

    const vassalZhou = getControlledZhou(vassal.id, territories);
    for (const territory of vassalZhou) {
      const inc = calculateMonthlyIncome(territory, vassalAbilities);
      vassalIncome = sumMG(vassalIncome, { money: inc.money, grain: inc.grain });
    }

    const centralization = vassal.centralization ?? 2;
    let vassalTerritoryType: TerritoryType = 'civil';
    if (vassalZhou.length > 0) {
      vassalTerritoryType = getCharacterTerritoryType(vassal, vassalZhou[0], territories, centralPosts);
    }

    const ratio = getTributeRatio(centralization, vassalTerritoryType);
    const contribution = {
      money: vassalIncome.money * ratio,
      grain: vassalIncome.grain * ratio,
    };
    vassalTribute = sumMG(vassalTribute, contribution);
  }

  // ── 回拨 ──
  let redistributionPaid = { ...zero };
  const redistributionRate = char.redistributionRate / 100;

  if (redistributionRate > 0 && (vassalTribute.money > 0 || vassalTribute.grain > 0)) {
    redistributionPaid = {
      money: vassalTribute.money * redistributionRate,
      grain: vassalTribute.grain * redistributionRate,
    };
  }

  // ── 收到上级的回拨 ──
  let redistributionReceived = { ...zero };

  if (char.overlordId) {
    const overlord = characters.get(char.overlordId);
    if (overlord) {
      const overlordVassals = getVassals(overlord.id, characters);
      let totalTributeToOverlord = { ...zero };
      let myContribution = { ...zero };

      for (const sib of overlordVassals) {
        const sibAbilities = getEffectiveAbilities(sib);
        let sibIncome = { ...zero };
        const sibZhou = getControlledZhou(sib.id, territories);
        for (const territory of sibZhou) {
          const inc = calculateMonthlyIncome(territory, sibAbilities);
          sibIncome = sumMG(sibIncome, { money: inc.money, grain: inc.grain });
        }

        const sibCentralization = sib.centralization ?? 2;
        let sibTerritoryType: TerritoryType = 'civil';
        if (sibZhou.length > 0) {
          sibTerritoryType = getCharacterTerritoryType(sib, sibZhou[0], territories, centralPosts);
        }

        const sibRatio = getTributeRatio(sibCentralization, sibTerritoryType);
        const sibContrib = {
          money: sibIncome.money * sibRatio,
          grain: sibIncome.grain * sibRatio,
        };
        totalTributeToOverlord = sumMG(totalTributeToOverlord, sibContrib);
        if (sib.id === char.id) {
          myContribution = sibContrib;
        }
      }

      const overlordRedistRate = overlord.redistributionRate / 100;
      if (overlordRedistRate > 0) {
        const totalMoney = totalTributeToOverlord.money;
        const totalGrain = totalTributeToOverlord.grain;
        const moneyShare = totalMoney > 0 ? myContribution.money / totalMoney : 0;
        const grainShare = totalGrain > 0 ? myContribution.grain / totalGrain : 0;
        redistributionReceived = {
          money: totalMoney * overlordRedistRate * moneyShare,
          grain: totalGrain * overlordRedistRate * grainShare,
        };
      }
    }
  }

  // ── 支出：下属薪俸 ──
  const subordinates = getSubordinates(char.id, characters, territories, centralPosts);
  let subordinateSalaries = { ...zero };
  for (const sub of subordinates) {
    subordinateSalaries = sumMG(subordinateSalaries, calculateSalary(sub, territories, centralPosts));
  }

  const militaryMaintenance = getTotalMilitaryMaintenance(char.id, armies, battalions, unitTypeMap);
  const constructionCost = { ...zero };

  // ── 支出：向上级缴纳的贡奉 ──
  let overlordTribute = { ...zero };

  if (char.overlordId) {
    const centralization = char.centralization ?? 2;
    let myTerritoryType: TerritoryType = 'civil';
    if (controlledZhou.length > 0) {
      myTerritoryType = getCharacterTerritoryType(char, controlledZhou[0], territories, centralPosts);
    }

    const ratio = getTributeRatio(centralization, myTerritoryType);
    overlordTribute = {
      money: territoryIncome.money * ratio,
      grain: territoryIncome.grain * ratio,
    };
  }

  // ── 汇总 ──
  const totalIncome = sumMG(
    sumMG(territoryIncome, positionSalary),
    sumMG(vassalTribute, redistributionReceived),
  );

  const totalExpense = sumMG(
    sumMG(subordinateSalaries, militaryMaintenance),
    sumMG(sumMG(constructionCost, overlordTribute), redistributionPaid),
  );

  const net = {
    money: totalIncome.money - totalExpense.money,
    grain: totalIncome.grain - totalExpense.grain,
  };

  return {
    territoryIncome,
    positionSalary,
    vassalTribute,
    redistributionReceived,
    redistributionPaid,
    totalIncome,
    subordinateSalaries,
    militaryMaintenance,
    constructionCost,
    overlordTribute,
    totalExpense,
    net,
  };
}
