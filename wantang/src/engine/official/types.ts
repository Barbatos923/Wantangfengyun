// ===== 官职系统类型定义 =====

import type { TerritoryTier, TerritoryType } from '../territory/types';

/** 品位等级，1=从九品下, 29=从一品 */
export type RankLevel = number;

/** 品位定义 */
export interface RankDef {
  level: RankLevel;
  name: string;
  civilTitle: string;
  militaryTitle: string;
  virtueThreshold: number;
  monthlySalary: { money: number; grain: number };
}

/** 机构 */
export type Institution =
  | '中书门下' | '翰林院' | '枢密院' | '神策军'
  | '三司' | '中书省' | '门下省' | '尚书省'
  | '御史台' | '秘书省' | '三公'
  | '藩镇' | '州府' | '皇室';

/** 职位作用域 */
export type PositionScope = 'central' | 'local';

/** 职位模板 — 职位的"种类定义" */
export interface PositionTemplate {
  id: string;
  name: string;
  institution: Institution;
  scope: PositionScope;
  tier?: TerritoryTier;        // local 职位绑定的领地层级
  territoryType?: TerritoryType; // 有地职位的领地类型标记
  minRank: RankLevel;
  salary: { money: number; grain: number };
  description: string;
  grantsControl: boolean;      // 任命此职位时是否转移领地控制权
}

// Post 定义在 territory/types 以避免循环依赖，此处 re-export
export type { Post } from '../territory/types';

/** 角色官职数据 */
export interface OfficialData {
  rankLevel: RankLevel;
  virtue: number;
  isCivil: boolean;
}

/** 月度收支明细（计算值，非持久化） */
export interface MonthlyLedger {
  territoryIncome: { money: number; grain: number };
  positionSalary: { money: number; grain: number };
  vassalTribute: { money: number; grain: number };
  redistributionReceived: { money: number; grain: number };
  redistributionPaid: { money: number; grain: number };
  totalIncome: { money: number; grain: number };

  subordinateSalaries: { money: number; grain: number };
  militaryMaintenance: { money: number; grain: number };
  constructionCost: { money: number; grain: number };
  overlordTribute: { money: number; grain: number };
  totalExpense: { money: number; grain: number };

  net: { money: number; grain: number };
}
