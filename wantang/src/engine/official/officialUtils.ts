// ===== 官职系统工具函数 =====

import type { Character } from '@engine/character/types';
import type { Territory, CentralizationLevel } from '@engine/territory/types';
import type { MonthlyLedger, RankLevel } from './types';
import { rankMap } from '@data/ranks';
import { positionMap } from '@data/positions';
import { calculateMonthlyIncome } from '@engine/territory/territoryUtils';
import { getEffectiveAbilities } from '@engine/character/characterUtils';

// ===== 内部辅助 =====

/** 将两个 {money, grain} 结构相加，返回新对象 */
function sumMG(
  a: { money: number; grain: number },
  b: { money: number; grain: number },
): { money: number; grain: number } {
  return { money: a.money + b.money, grain: a.grain + b.grain };
}

// ===== 公共工具函数 =====

/**
 * 检查角色是否满足晋升条件。
 * @returns 可晋升的下一品级，若不满足则返回 null
 */
export function checkRankPromotion(char: Character): RankLevel | null {
  if (!char.official) return null;

  const nextLevel = char.official.rankLevel + 1;
  const nextRank = rankMap.get(nextLevel);

  // 已是最高品或下一品不存在
  if (!nextRank) return null;

  // 贤能值达到晋升门槛
  if (char.official.virtue >= nextRank.virtueThreshold) {
    return nextLevel;
  }

  return null;
}

/**
 * 计算角色本月应增加的贤能值。
 * 贤能值代表官员在职位上积累的资历与声望，用于品位晋升。
 */
export function calculateMonthlyVirtue(char: Character): number {
  if (!char.official) return 0;

  let virtue = 0;

  // 基础：持有至少一个职位时 +1
  if (char.official.positions.length > 0) {
    virtue += 1;
  }

  // 管理能力加成：管理>10时，每1点 +0.1
  const abilities = getEffectiveAbilities(char);
  if (abilities.administration > 10) {
    virtue += (abilities.administration - 10) * 0.1;
  }

  // 中央职位加成：持有任意中枢职位 +1
  const hasCentralPosition = char.official.positions.some((holding) => {
    const def = positionMap.get(holding.positionId);
    return def?.scope === 'central';
  });
  if (hasCentralPosition) {
    virtue += 1;
  }

  // 贤能值不为负
  return Math.max(0, virtue);
}

/**
 * 获取角色当前品位的称号（文散官或武散官）。
 * @returns 称号字符串，若无官职或品位未找到则返回空字符串
 */
export function getRankTitle(char: Character): string {
  if (!char.official) return '';

  const rankDef = rankMap.get(char.official.rankLevel);
  if (!rankDef) return '';

  return char.official.isCivil ? rankDef.civilTitle : rankDef.militaryTitle;
}

/**
 * 根据角色能力判定文武：军事为最高属性则为武散官，否则为文散官。
 */
export function isCivilByAbilities(abilities: { military: number; administration: number; strategy: number; diplomacy: number; scholarship: number }): boolean {
  const { military, administration, strategy, diplomacy, scholarship } = abilities;
  const maxNonMilitary = Math.max(administration, strategy, diplomacy, scholarship);
  return military <= maxNonMilitary;
}

/**
 * 根据集权等级返回朝贡比例。
 * 集权等级越高，地方上缴给上级的比例越大。
 * @param centralization 1-4
 */
export function getTributeRatio(centralization: CentralizationLevel): number {
  switch (centralization) {
    case 1: return 0.25;
    case 2: return 0.45;
    case 3: return 0.65;
    case 4: return 0.85;
  }
}

/**
 * 返回所有由指定角色任命的、仍存活的下属角色列表。
 * 判断标准：某角色的 official.positions 中存在 appointedBy === charId 的条目。
 */
export function getSubordinates(
  charId: string,
  characters: Map<string, Character>,
): Character[] {
  const result: Character[] = [];

  for (const candidate of characters.values()) {
    if (!candidate.alive) continue;
    if (!candidate.official) continue;

    const isSubordinate = candidate.official.positions.some(
      (holding) => holding.appointedBy === charId,
    );
    if (isSubordinate) {
      result.push(candidate);
    }
  }

  return result;
}

/**
 * 计算角色每月应获得的薪俸（散官品位薪 + 各职位薪俸之和）。
 */
export function calculateSalary(
  char: Character,
): { money: number; grain: number } {
  if (!char.official) return { money: 0, grain: 0 };

  // 散官品位薪
  const rankDef = rankMap.get(char.official.rankLevel);
  let salary = rankDef
    ? { money: rankDef.monthlySalary.money, grain: rankDef.monthlySalary.grain }
    : { money: 0, grain: 0 };

  // 职位薪俸（可兼多职）
  for (const holding of char.official.positions) {
    const posDef = positionMap.get(holding.positionId);
    if (posDef) {
      salary = sumMG(salary, posDef.salary);
    }
  }

  return salary;
}

/**
 * 检验 appointer 是否有权将 appointee 任命至指定职位。
 * 依次校验：任命权、被任命者存活、被任命者资格、职位存在、品位要求、是否重复持有。
 */
export function canAppoint(
  appointer: Character,
  appointee: Character,
  positionId: string,
  characters?: Map<string, Character>,
  territoryId?: string,
): { ok: boolean; reason?: string } {
  // 1. 任命者是否拥有对该职位的任命权
  const hasAuthority =
    appointer.official?.positions.some((holding) => {
      const def = positionMap.get(holding.positionId);
      return def?.canAppoint.includes(positionId);
    }) ?? false;

  if (!hasAuthority) {
    return { ok: false, reason: '无权任命此职位' };
  }

  // 2. 被任命者是否存活
  if (!appointee.alive) {
    return { ok: false, reason: '目标已死亡' };
  }

  // 3. 被任命者是否具备官员资格
  if (!appointee.official) {
    return { ok: false, reason: '目标无官职资格' };
  }

  // 4. 职位是否存在
  const posDef = positionMap.get(positionId);
  if (!posDef) {
    return { ok: false, reason: '职位不存在' };
  }

  // 5. 被任命者品位是否达到该职位最低要求
  if (appointee.official.rankLevel < posDef.minRank) {
    return { ok: false, reason: '品位不足' };
  }

  // 6. 被任命者是否已持有此职位
  const alreadyHolds = appointee.official.positions.some(
    (holding) => holding.positionId === positionId,
  );
  if (alreadyHolds) {
    return { ok: false, reason: '已担任此职位' };
  }

  // 7. 同一职位+同一领地是否已有他人在任（一个萝卜一个坑）
  if (characters) {
    for (const c of characters.values()) {
      if (!c.alive || !c.official || c.id === appointee.id) continue;
      const conflict = c.official.positions.some((h) => {
        if (h.positionId !== positionId) return false;
        // 中央职位（无territoryId）：全局唯一
        // 地方职位：同territoryId唯一
        if (!territoryId) return !h.territoryId;
        return h.territoryId === territoryId;
      });
      if (conflict) {
        return { ok: false, reason: '已有人在任' };
      }
    }
  }

  return { ok: true };
}

/**
 * 获取角色的动态头衔：优先显示最高职位名（刺史附带领地名），
 * 无职位则显示品位名，无品位则显示"庶人"。
 */
export function getDynamicTitle(
  char: Character,
  territories?: Map<string, Territory>,
): string {
  if (!char.official) return '庶人';

  // 有职位：取第一个（最重要的）职位
  if (char.official.positions.length > 0) {
    // 优先取非刺史职位（刺史是基础绑定，更高职位更有代表性）
    const nonCishi = char.official.positions.find((p) => p.positionId !== 'pos-cishi');
    const primary = nonCishi ?? char.official.positions[0];
    const posDef = positionMap.get(primary.positionId);
    const posName = posDef?.name ?? primary.positionId;

    // 地方职位附带领地名
    if (primary.territoryId && territories) {
      const terr = territories.get(primary.territoryId);
      if (terr) return `${terr.name}${posName}`;
    }
    return posName;
  }

  // 无职位但有品位
  const rankDef = rankMap.get(char.official.rankLevel);
  if (rankDef) {
    return char.official.isCivil ? rankDef.civilTitle : rankDef.militaryTitle;
  }

  return '庶人';
}

/**
 * 获取所有效忠于指定角色的存活角色（overlordId === charId）。
 */
export function getVassals(charId: string, characters: Map<string, Character>): Character[] {
  const result: Character[] = [];
  for (const c of characters.values()) {
    if (c.alive && c.overlordId === charId) result.push(c);
  }
  return result;
}

// ===== 州级职位-领地绑定 =====

/** 角色直辖州上限 = ceil(管理/5) */
export function getDirectControlLimit(char: Character): number {
  const abilities = getEffectiveAbilities(char);
  return Math.ceil(abilities.administration / 5);
}

/** 获取角色直辖的所有zhou级领地 */
export function getDirectControlledZhou(
  char: Character,
  territories: Map<string, Territory>,
): Territory[] {
  const result: Territory[] = [];
  for (const tid of char.controlledTerritoryIds) {
    const t = territories.get(tid);
    if (t && t.tier === 'zhou') result.push(t);
  }
  return result;
}

/** 角色直辖州数是否超过上限 */
export function isOverDirectControlLimit(
  char: Character,
  territories: Map<string, Territory>,
): boolean {
  return getDirectControlledZhou(char, territories).length > getDirectControlLimit(char);
}

/** 直辖超额时的产出折扣系数 min(1, limit/actual) */
export function getDirectControlPenalty(
  char: Character,
  territories: Map<string, Territory>,
): number {
  const directCount = getDirectControlledZhou(char, territories).length;
  if (directCount === 0) return 1;
  const limit = getDirectControlLimit(char);
  return Math.min(1, limit / directCount);
}

/**
 * 校验是否可以将某个州授出（任命刺史）。
 * 条件：领地为zhou、granter为实际控制人、granter至少保留一个直辖州。
 */
export function canGrantTerritory(
  granter: Character,
  territoryId: string,
  territories: Map<string, Territory>,
): { ok: boolean; reason?: string } {
  const territory = territories.get(territoryId);
  if (!territory) return { ok: false, reason: '领地不存在' };
  if (territory.tier !== 'zhou') return { ok: false, reason: '只能授出州级领地' };
  if (territory.actualControllerId !== granter.id) return { ok: false, reason: '非直辖领地' };

  // 保底：至少保留一个直辖州
  const directZhou = getDirectControlledZhou(granter, territories);
  if (directZhou.length <= 1) return { ok: false, reason: '不能授出最后一个直辖州' };

  return { ok: true };
}

/**
 * 罢免刺史后需要执行的操作描述。
 * 返回操作列表供调用侧执行store方法。
 */
export interface DismissCishiAction {
  /** 被罢免者ID */
  dismissedCharId: string;
  /** 回收的领地ID */
  territoryId: string;
  /** 领地回归的角色ID（任命者） */
  returnToCharId: string;
}

export function planDismissCishi(
  charId: string,
  territoryId: string,
  characters: Map<string, Character>,
): DismissCishiAction | null {
  const char = characters.get(charId);
  if (!char?.official) return null;

  const holding = char.official.positions.find(
    (p) => p.positionId === 'pos-cishi' && p.territoryId === territoryId,
  );
  if (!holding) return null;

  return {
    dismissedCharId: charId,
    territoryId,
    returnToCharId: holding.appointedBy,
  };
}

/**
 * 计算角色本月完整的收支明细。
 *
 * 收入来源：
 *   - territoryIncome：自身直辖州（zhou）的月产出之和
 *   - positionSalary：本角色的薪俸（品位薪 + 职位薪俸）
 *   - vassalTribute：下属贡奉（下属领地产出 × 集权朝贡比例）
 *
 * 支出来源：
 *   - subordinateSalaries：向下属支付的薪俸之和
 *   - militaryMaintenance：军队维护（Phase 3 占位，暂为 0）
 *   - constructionCost：建筑费用（开工时一次性扣除，月度为 0）
 *   - overlordTribute：向上级缴纳的贡奉（自身领地产出 × 集权朝贡比例）
 */
export function calculateMonthlyLedger(
  char: Character,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
): MonthlyLedger {
  const zero = { money: 0, grain: 0 };

  // ── 自身领地产出 ──────────────────────────────────────────────
  const abilities = getEffectiveAbilities(char);
  let territoryIncome = { ...zero };

  for (const tid of char.controlledTerritoryIds) {
    const territory = territories.get(tid);
    // calculateMonthlyIncome 内部已过滤非 zhou 层级
    if (territory) {
      const inc = calculateMonthlyIncome(territory, abilities);
      territoryIncome = sumMG(territoryIncome, { money: inc.money, grain: inc.grain });
    }
  }

  // ── 薪俸 ──────────────────────────────────────────────────────
  const positionSalary = calculateSalary(char);

  // ── 下属列表 ──────────────────────────────────────────────────
  const subordinates = getSubordinates(char.id, characters);

  // ── 下属贡奉 ──────────────────────────────────────────────────
  // 对每个下属：计算其所有 zhou 领地的月产出，取辖区集权等级均值决定朝贡比例。
  let vassalTribute = { ...zero };

  for (const sub of subordinates) {
    const subAbilities = getEffectiveAbilities(sub);
    let subTerritoryIncome = { ...zero };
    const ratios: number[] = [];

    for (const tid of sub.controlledTerritoryIds) {
      const territory = territories.get(tid);
      if (!territory) continue;
      const inc = calculateMonthlyIncome(territory, subAbilities);
      subTerritoryIncome = sumMG(subTerritoryIncome, { money: inc.money, grain: inc.grain });
      ratios.push(getTributeRatio(territory.centralization));
    }

    if (ratios.length === 0) continue;

    // 平均集权朝贡比例
    const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;

    vassalTribute = sumMG(vassalTribute, {
      money: subTerritoryIncome.money * avgRatio,
      grain: subTerritoryIncome.grain * avgRatio,
    });
  }

  // ── 支出：下属薪俸 ────────────────────────────────────────────
  let subordinateSalaries = { ...zero };
  for (const sub of subordinates) {
    subordinateSalaries = sumMG(subordinateSalaries, calculateSalary(sub));
  }

  // ── 支出：军队维护（Phase 3 占位）────────────────────────────
  const militaryMaintenance = { ...zero };

  // ── 支出：建筑费用（开工时扣，月度为 0）──────────────────────
  const constructionCost = { ...zero };

  // ── 支出：向上级缴纳的贡奉 ───────────────────────────────────
  let overlordTribute = { ...zero };

  if (char.overlordId) {
    const ratios: number[] = [];
    for (const tid of char.controlledTerritoryIds) {
      const territory = territories.get(tid);
      if (territory) {
        ratios.push(getTributeRatio(territory.centralization));
      }
    }

    if (ratios.length > 0) {
      const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
      overlordTribute = {
        money: territoryIncome.money * avgRatio,
        grain: territoryIncome.grain * avgRatio,
      };
    }
  }

  // ── 汇总 ─────────────────────────────────────────────────────
  const totalIncome = sumMG(sumMG(territoryIncome, positionSalary), vassalTribute);

  const totalExpense = sumMG(
    sumMG(subordinateSalaries, militaryMaintenance),
    sumMG(constructionCost, overlordTribute),
  );

  const net = {
    money: totalIncome.money - totalExpense.money,
    grain: totalIncome.grain - totalExpense.grain,
  };

  return {
    territoryIncome,
    positionSalary,
    vassalTribute,
    totalIncome,
    subordinateSalaries,
    militaryMaintenance,
    constructionCost,
    overlordTribute,
    totalExpense,
    net,
  };
}
