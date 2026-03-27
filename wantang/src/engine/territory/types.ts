// ===== 领地完整类型定义 =====

import type { GameDate } from '../types';

/** 领地等级 */
export type TerritoryTier = 'zhou' | 'dao' | 'guo' | 'tianxia';

/** 领地类型 */
export type TerritoryType = 'civil' | 'military';

/** 集权等级 1-4 */
export type CentralizationLevel = 1 | 2 | 3 | 4;

/** 建筑槽位 */
export interface BuildingSlot {
  buildingId: string | null;
  level: number;
}

/** 施工进度 */
export interface Construction {
  slotIndex: number;
  buildingId: string;
  targetLevel: number;
  remainingMonths: number;
}

/** 岗位 — 职位模板 + 具体挂载位置，"一个萝卜一个坑"中的坑
 *  内联定义于此以避免与 official/types 的循环依赖；
 *  official/types 会从此处 re-export Post。
 */
export interface Post {
  id: string;
  templateId: string;          // 引用 PositionTemplate.id
  territoryId?: string;        // local 岗位绑定的领地 ID
  holderId: string | null;     // 当前在任者 ID，null = 空缺
  appointedBy?: string;        // 谁任命的
  appointedDate?: GameDate;
}

/** 领地完整数据 */
export interface Territory {
  // 基础
  id: string;
  name: string;
  tier: TerritoryTier;
  territoryType: TerritoryType;

  // 层级
  parentId?: string;
  childIds: string[];

  // 法理归属
  dejureControllerId: string;

  // 岗位列表
  posts: Post[];

  // 属性
  control: number;
  development: number;
  populace: number;

  // 战时占领（非永久，战争结束后结算）
  occupiedBy?: string; // 占领者角色ID，undefined=未被占领

  // 建筑
  buildings: BuildingSlot[];

  // 施工队列
  constructions: Construction[];

  // 基础人口（户数）
  basePopulation: number;

  // 兵役人口（当前可征兵数，每月恢复 上限/12）
  conscriptionPool: number;

  moneyRatio: number;
  grainRatio: number;
}
