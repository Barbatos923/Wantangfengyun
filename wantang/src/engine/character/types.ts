// ===== 角色完整类型定义 =====

import type { OfficialData } from '../official/types';

/** 性别 */
export type Gender = '男' | '女';

/** 角色能力值 */
export interface Abilities {
  military: number;    // 军事 0-30
  administration: number; // 管理 0-30
  strategy: number;    // 谋略 0-30
  diplomacy: number;   // 外交 0-30
  scholarship: number; // 学识 0-30
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
  decayable: boolean; // 事件类好感度可衰减
}

/** 与某角色的关系 */
export interface Relationship {
  targetId: string;
  opinions: OpinionEntry[];
}

/** 建筑施工进度 */
export interface ConstructionProgress {
  buildingId: string;
  level: number;       // 正在建造的等级
  remainingMonths: number;
}

/** 角色完整数据 */
export interface Character {
  // 身份
  id: string;
  name: string;
  courtesy: string;    // 字
  gender: Gender;
  birthYear: number;
  deathYear?: number;
  clan: string;        // 家族
  family: FamilyRelations;

  // 能力
  abilities: Abilities;

  // 特质
  traitIds: string[];

  // 状态
  health: number;      // 0-100
  stress: number;      // 0-100
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

  // 标记
  isPlayer: boolean;
  isRuler: boolean;
  controlledTerritoryIds: string[];

  // 头衔
  title: string;

  // 官职 (Phase 2)
  official?: OfficialData;
}
