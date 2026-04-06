// ===== 角色完整类型定义 =====

import type { OfficialData } from '../official/types';
import type { CentralizationLevel } from '../territory/types';

/** 性别 */
export type Gender = '男' | '女';

/** 角色能力值 */
export interface Abilities {
  military: number;
  administration: number;
  strategy: number;
  diplomacy: number;
  scholarship: number;
}

/** 家族关系 */
export interface FamilyRelations {
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  childrenIds: string[];
}

/** 好感度条目 */
export interface OpinionEntry {
  reason: string;
  value: number;
  decayable: boolean;
}

/** 与某角色的关系 */
export interface Relationship {
  targetId: string;
  opinions: OpinionEntry[];
}

/** 建筑施工进度 */
export interface ConstructionProgress {
  buildingId: string;
  level: number;
  remainingMonths: number;
}

/** 角色完整数据 */
export interface Character {
  // 身份
  id: string;
  name: string;
  courtesy: string;
  gender: Gender;
  birthYear: number;
  deathYear?: number;
  clan: string;
  family: FamilyRelations;

  // 能力
  abilities: Abilities;

  // 特质
  traitIds: string[];

  // 状态
  health: number;
  stress: number;
  alive: boolean;

  // 资源
  resources: {
    money: number;
    grain: number;
    prestige: number;
    legitimacy: number;
  };

  // 关系
  relationships: Relationship[];

  // 效忠
  overlordId?: string;
  centralization?: CentralizationLevel;
  redistributionRate?: number;

  // 标记
  isPlayer: boolean;
  isRuler: boolean;

  // 头衔
  title: string;

  // 官职 (Phase 2)
  official?: OfficialData;

  // 交互冷却（absoluteDay）
  lastDemandFealtyDay?: number;
  lastDemandRightsDay?: number;
  lastNegotiateTaxDay?: number;
  lastPledgeAllegianceDay?: number;
}
