// ===== 经济计算（纯函数） =====

import type { Character } from '@engine/character/types';
import type { Territory, CentralizationLevel, TerritoryType, Post } from '@engine/territory/types';
import type { MonthlyLedger, MilitarySupplyResult } from './types';
import { rankMap } from '@data/ranks';
import { positionMap } from '@data/positions';
import { calculateMonthlyIncome } from '@engine/territory/territoryUtils';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { getControlledZhou, getHeldPosts, getSubordinates, getVassals } from './postQueries';
import type { Army, Battalion } from '@engine/military/types';
import { getTotalMilitaryMaintenance, getMilitaryMaintenanceByTerritory } from '@engine/military/militaryCalc';
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
 * 计算角色本月完整的收支明细（国库版）。
 *
 * 核心变化：所有收支路由到具体州的国库，俸禄进角色私产。
 * 保留旧的汇总字段供 UI 向后兼容。
 *
 * @param capitals  charId → capitalZhouId 映射
 * @param controllerIndex  charId → Set<territoryId> 索引
 */
export function calculateMonthlyLedger(
  char: Character,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  centralPosts: Post[],
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
  capitals?: Map<string, string>,
  controllerIndex?: Map<string, Set<string>>,
  ownerArmyIndex?: Map<string, Set<string>>,
): MonthlyLedger {
  const zero = { money: 0, grain: 0 };
  const tc = new Map<string, { money: number; grain: number }>(); // treasuryChanges

  /** 向某州国库累加变动 */
  function addTC(zhouId: string, delta: { money?: number; grain?: number }) {
    const existing = tc.get(zhouId) ?? { money: 0, grain: 0 };
    tc.set(zhouId, {
      money: existing.money + (delta.money ?? 0),
      grain: existing.grain + (delta.grain ?? 0),
    });
  }

  const myCapital = capitals?.get(char.id) ?? char.capital;
  const abilities = getEffectiveAbilities(char);

  // ── 自身领地产出 → 各州国库 ──
  let territoryIncome = { ...zero };
  const controlledZhou = getControlledZhou(char.id, territories);

  for (const territory of controlledZhou) {
    const inc = calculateMonthlyIncome(territory, abilities);
    territoryIncome = sumMG(territoryIncome, { money: inc.money, grain: inc.grain });
    // 产出进入该州国库
    addTC(territory.id, { money: inc.money, grain: inc.grain });
  }

  // ── 薪俸 → 角色私产 ──
  const positionSalary = calculateSalary(char, territories, centralPosts);
  // 私产变动追踪：俸禄始终进私产，无capital时其他收支也fallback到私产
  const privateChange = { money: positionSalary.money, grain: positionSalary.grain };

  // ── 臣属贡奉：各臣属各州按产出×tributeRatio → 我的 capital 州 ──
  const vassals = getVassals(char.id, characters);
  let vassalTribute = { ...zero };

  for (const vassal of vassals) {
    const vassalAbilities = getEffectiveAbilities(vassal);
    const vassalZhou = getControlledZhou(vassal.id, territories);

    const centralization = vassal.centralization ?? 2;
    let vassalTerritoryType: TerritoryType = 'civil';
    if (vassalZhou.length > 0) {
      vassalTerritoryType = getCharacterTerritoryType(vassal, vassalZhou[0], territories, centralPosts);
    }
    const ratio = getTributeRatio(centralization, vassalTerritoryType);

    for (const territory of vassalZhou) {
      const inc = calculateMonthlyIncome(territory, vassalAbilities);
      const contribution = { money: inc.money * ratio, grain: inc.grain * ratio };
      vassalTribute = sumMG(vassalTribute, contribution);
      // 贡奉进入我的 capital 州国库，无capital则进私产
      if (myCapital) {
        addTC(myCapital, contribution);
      } else {
        privateChange.money += contribution.money;
        privateChange.grain += contribution.grain;
      }
    }
  }

  // ── 回拨：我的 capital → 各臣属 capital ──
  let redistributionPaid = { ...zero };
  const redistributionRate = char.redistributionRate / 100;

  if (redistributionRate > 0 && (vassalTribute.money > 0 || vassalTribute.grain > 0)) {
    redistributionPaid = {
      money: vassalTribute.money * redistributionRate,
      grain: vassalTribute.grain * redistributionRate,
    };
    // 从我的 capital 扣，无capital则从私产
    if (myCapital) {
      addTC(myCapital, { money: -redistributionPaid.money, grain: -redistributionPaid.grain });
    } else {
      privateChange.money -= redistributionPaid.money;
      privateChange.grain -= redistributionPaid.grain;
    }

    // 向各臣属 capital 分配（按贡献比例）
    if (vassals.length > 0) {
      // 计算各臣属贡献
      const vassalContribs: { vassalId: string; money: number; grain: number }[] = [];
      for (const vassal of vassals) {
        const vAbilities = getEffectiveAbilities(vassal);
        const vZhou = getControlledZhou(vassal.id, territories);
        const centralization = vassal.centralization ?? 2;
        let vType: TerritoryType = 'civil';
        if (vZhou.length > 0) vType = getCharacterTerritoryType(vassal, vZhou[0], territories, centralPosts);
        const ratio = getTributeRatio(centralization, vType);
        let vMoney = 0, vGrain = 0;
        for (const t of vZhou) {
          const inc = calculateMonthlyIncome(t, vAbilities);
          vMoney += inc.money * ratio;
          vGrain += inc.grain * ratio;
        }
        vassalContribs.push({ vassalId: vassal.id, money: vMoney, grain: vGrain });
      }
      const totalContribMoney = vassalContribs.reduce((s, v) => s + v.money, 0);
      const totalContribGrain = vassalContribs.reduce((s, v) => s + v.grain, 0);

      for (const vc of vassalContribs) {
        const vassalCapital = capitals?.get(vc.vassalId) ?? characters.get(vc.vassalId)?.capital;
        if (!vassalCapital) continue;
        const moneyShare = totalContribMoney > 0 ? vc.money / totalContribMoney : 0;
        const grainShare = totalContribGrain > 0 ? vc.grain / totalContribGrain : 0;
        addTC(vassalCapital, {
          money: redistributionPaid.money * moneyShare,
          grain: redistributionPaid.grain * grainShare,
        });
      }
    }
  }

  // ── 收到上级的回拨：overlord capital → 我的 capital ──
  let redistributionReceived = { ...zero };

  if (char.overlordId) {
    const overlord = characters.get(char.overlordId);
    if (overlord) {
      const overlordVassals = getVassals(overlord.id, characters);
      let totalTributeToOverlord = { ...zero };
      let myContribution = { ...zero };

      for (const sib of overlordVassals) {
        const sibAbilities = getEffectiveAbilities(sib);
        const sibZhou = getControlledZhou(sib.id, territories);
        const sibCentralization = sib.centralization ?? 2;
        let sibTerritoryType: TerritoryType = 'civil';
        if (sibZhou.length > 0) {
          sibTerritoryType = getCharacterTerritoryType(sib, sibZhou[0], territories, centralPosts);
        }
        const sibRatio = getTributeRatio(sibCentralization, sibTerritoryType);
        let sibContrib = { ...zero };
        for (const t of sibZhou) {
          const inc = calculateMonthlyIncome(t, sibAbilities);
          sibContrib = sumMG(sibContrib, { money: inc.money * sibRatio, grain: inc.grain * sibRatio });
        }
        totalTributeToOverlord = sumMG(totalTributeToOverlord, sibContrib);
        if (sib.id === char.id) myContribution = sibContrib;
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
        // 进入我的 capital 国库，无capital则进私产
        if (myCapital) {
          addTC(myCapital, redistributionReceived);
        } else {
          privateChange.money += redistributionReceived.money;
          privateChange.grain += redistributionReceived.grain;
        }
      }
    }
  }

  // ── 支出：下属薪俸 → 从我的 capital 扣 ──
  const subordinates = getSubordinates(char.id, characters, territories, centralPosts);
  let subordinateSalaries = { ...zero };
  for (const sub of subordinates) {
    subordinateSalaries = sumMG(subordinateSalaries, calculateSalary(sub, territories, centralPosts));
  }
  // 属官俸禄从capital扣，无capital则从私产
  if (myCapital) {
    addTC(myCapital, { money: -subordinateSalaries.money, grain: -subordinateSalaries.grain });
  } else {
    privateChange.money -= subordinateSalaries.money;
    privateChange.grain -= subordinateSalaries.grain;
  }

  // ── 支出：军费维护 → 各军队最近友方州 ──
  let militarySupply: MilitarySupplyResult[] = [];
  let militaryMaintenance = { ...zero };

  if (controllerIndex) {
    militarySupply = getMilitaryMaintenanceByTerritory(
      char.id, armies, battalions, unitTypeMap,
      territories, characters, controllerIndex, ownerArmyIndex,
    );
    for (const ms of militarySupply) {
      if (ms.grainCost === 0 || ms.blocked) continue; // blocked 不扣粮（月结时只扣士气）
      militaryMaintenance.grain += ms.grainCost;
      if (ms.fromPrivate) {
        privateChange.grain -= ms.grainCost;
      } else if (ms.supplyZhouId) {
        addTC(ms.supplyZhouId, { grain: -ms.grainCost });
      }
    }
  } else {
    // 兜底：无 controllerIndex 时用旧逻辑（向后兼容 UI 预览等场景）
    militaryMaintenance = getTotalMilitaryMaintenance(char.id, armies, battalions, unitTypeMap);
    if (myCapital) {
      addTC(myCapital, { grain: -militaryMaintenance.grain });
    } else {
      privateChange.grain -= militaryMaintenance.grain;
    }
  }

  const constructionCost = { ...zero };

  // ── 支出：向上级缴纳贡奉 → 从各州单独扣 ──
  let overlordTribute = { ...zero };

  if (char.overlordId) {
    const centralization = char.centralization ?? 2;
    let myTerritoryType: TerritoryType = 'civil';
    if (controlledZhou.length > 0) {
      myTerritoryType = getCharacterTerritoryType(char, controlledZhou[0], territories, centralPosts);
    }
    const ratio = getTributeRatio(centralization, myTerritoryType);

    for (const territory of controlledZhou) {
      const inc = calculateMonthlyIncome(territory, abilities);
      const tribute = { money: inc.money * ratio, grain: inc.grain * ratio };
      overlordTribute = sumMG(overlordTribute, tribute);
      // 从该州国库扣
      addTC(territory.id, { money: -tribute.money, grain: -tribute.grain });
    }
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
    // 国库系统新增
    privateChange,
    treasuryChanges: tc,
    militarySupply,
  };
}
