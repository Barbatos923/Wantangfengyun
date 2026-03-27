// ===== 官职系统工具函数（小工具 + 兼容层 re-export） =====
//
// 核心逻辑已拆分至：
//   postQueries.ts      — 岗位查询（纯函数）
//   appointValidation.ts — 任命校验（纯函数）
//   economyCalc.ts       — 经济计算（纯函数）
//
// 本文件保留不依赖岗位查询的小工具，并提供向后兼容的 re-export。
// 需要 Store 注入的函数在此包装，底层纯函数通过 postQueries 等直接引用。

import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import type { RankLevel } from './types';
import { rankMap } from '@data/ranks';
import { positionMap } from '@data/positions';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';

// ── 从拆分模块 re-export 纯函数 ─────────────────────────

export {
  getActualController,
  getControlledZhou,
  getDirectControlLimit,
  getDirectControlledZhou,
  isOverDirectControlLimit,
  getDirectControlPenalty,
  getVassals,
} from './postQueries';

export {
  getHeldPosts as getHeldPostsPure,
  getSubordinates as getSubordinatesPure,
} from './postQueries';

export {
  canGrantTerritory,
} from './appointValidation';

export {
  canAppointToPost as canAppointToPostPure,
} from './appointValidation';

export {
  getTributeRatio,
  getCharacterTerritoryType as getCharacterTerritoryTypePure,
  calculateMonthlyVirtue as calculateMonthlyVirtuePure,
  calculateSalary as calculateSalaryPure,
  calculateMonthlyLedger as calculateMonthlyLedgerPure,
} from './economyCalc';

// ── 便捷包装：自动注入 Store 的版本（向后兼容） ─────────

import {
  getHeldPosts as _getHeldPostsPure,
  getSubordinates as _getSubordinatesPure,
} from './postQueries';

import {
  canAppointToPost as _canAppointToPostPure,
} from './appointValidation';

import {
  calculateMonthlyVirtue as _calculateMonthlyVirtuePure,
  calculateSalary as _calculateSalaryPure,
  calculateMonthlyLedger as _calculateMonthlyLedgerPure,
  getCharacterTerritoryType as _getCharacterTerritoryTypePure,
} from './economyCalc';

/** 获取角色持有的所有岗位（便捷版，自动从 Store 取数据） */
export function getHeldPosts(charId: string): Post[] {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return _getHeldPostsPure(charId, territories, centralPosts);
}

/** 获取下属列表（便捷版） */
export function getSubordinates(
  charId: string,
  characters: Map<string, Character>,
): Character[] {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return _getSubordinatesPure(charId, characters, territories, centralPosts);
}

/** 任命校验（便捷版） */
export function canAppointToPost(
  appointer: Character,
  appointee: Character,
  post: Post,
): { ok: boolean; reason?: string } {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return _canAppointToPostPure(appointer, appointee, post, territories, centralPosts);
}

/** 贤能值计算（便捷版） */
export function calculateMonthlyVirtue(char: Character): number {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return _calculateMonthlyVirtuePure(char, territories, centralPosts);
}

/** 薪俸计算（便捷版） */
export function calculateSalary(char: Character): { money: number; grain: number } {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return _calculateSalaryPure(char, territories, centralPosts);
}

/** 月度收支（便捷版） */
export function calculateMonthlyLedger(
  char: Character,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
) {
  const { centralPosts } = useTerritoryStore.getState();
  const { armies, battalions } = useMilitaryStore.getState();
  return _calculateMonthlyLedgerPure(char, territories, characters, centralPosts, armies, battalions);
}

/** 角色领地类型判定（便捷版） */
export function getCharacterTerritoryType(
  char: Character,
  territory: Territory,
) {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return _getCharacterTerritoryTypePure(char, territory, territories, centralPosts);
}

// ── 本文件自有的小工具（不依赖岗位查询） ────────────────

/**
 * 获取角色的动态头衔。
 */
export function getDynamicTitle(
  char: Character,
  territories?: Map<string, Territory>,
): string {
  if (!char.official) return '庶人';

  const heldPosts = getHeldPosts(char.id);

  if (heldPosts.length > 0) {
    const nonBasic = heldPosts.find(p =>
      p.templateId !== 'pos-cishi' && p.templateId !== 'pos-fangyu-shi'
    );
    const primary = nonBasic ?? heldPosts[0];
    const posDef = positionMap.get(primary.templateId);
    const posName = posDef?.name ?? primary.templateId;

    if (primary.territoryId && territories) {
      const terr = territories.get(primary.territoryId);
      if (terr) return `${terr.name}${posName}`;
    }
    return posName;
  }

  const rankDef = rankMap.get(char.official.rankLevel);
  if (rankDef) {
    return char.official.isCivil ? rankDef.civilTitle : rankDef.militaryTitle;
  }

  return '庶人';
}

/**
 * 检查角色是否满足晋升条件。
 */
export function checkRankPromotion(char: Character): RankLevel | null {
  if (!char.official) return null;

  const nextLevel = char.official.rankLevel + 1;
  const nextRank = rankMap.get(nextLevel);
  if (!nextRank) return null;

  if (char.official.virtue >= nextRank.virtueThreshold) {
    return nextLevel;
  }
  return null;
}

/**
 * 获取角色当前品位的称号。
 */
export function getRankTitle(char: Character): string {
  if (!char.official) return '';
  const rankDef = rankMap.get(char.official.rankLevel);
  if (!rankDef) return '';
  return char.official.isCivil ? rankDef.civilTitle : rankDef.militaryTitle;
}

/**
 * 根据角色能力判定文武。
 */
export function isCivilByAbilities(abilities: { military: number; administration: number; strategy: number; diplomacy: number; scholarship: number }): boolean {
  const { military, administration, strategy, diplomacy, scholarship } = abilities;
  const maxNonMilitary = Math.max(administration, strategy, diplomacy, scholarship);
  return military <= maxNonMilitary;
}
