// ===== 领地完整类型定义 =====

import type { GameDate } from '../types';

/** 领地等级 */
export type TerritoryTier = 'zhou' | 'dao' | 'guo' | 'tianxia';

/** 领地类型 */
export type TerritoryType = 'civil' | 'military';

/** 赋税等级 1-4 */
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

  // ===== 继承法（Phase 4a）=====
  /** 继承法类型：'clan' = 宗法继承，'bureaucratic' = 流官继承 */
  successionLaw: 'clan' | 'bureaucratic';
  /** 辟署权：该岗位持有人对其辖区内所有岗位拥有绝对任命权 */
  hasAppointRight: boolean;
  /** 留后：预先指定的宗法继承人（仅 successionLaw==='clan' 时有效） */
  designatedHeirId?: string | null;
  /** 权知标记：true 表示当前持有人为降格代理任命 */
  isActing?: boolean;
  /** 品级覆盖：若存在，覆盖模板中的 minRank */
  minRankOverride?: number;

  // ===== 考课（三年一考）=====
  /** 上次考课时记录的基线值，用于计算三年增长 */
  reviewBaseline?: {
    population: number;
    virtue: number;
    /** 基线设置时间（任命时或上次考课时） */
    date: import('@engine/types').GameDate;
  };
  /** 上次考课获得的加成（上等 +20，中等 0） */
  reviewBonus?: number;

  // ===== 铨选辅助 =====
  /** vacateOnly 时记录前任持有人 ID，seatPost 时自动清除。
   *  用于铨选时判定哪些法理下级可跟随新任者转移。 */
  vacatedHolderId?: string | null;
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

  // 道级治所（仅 tier==='dao'）
  capitalZhouId?: string;

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

  // 关隘（可选，一州多关隘时取最高等级）
  passName?: string;   // 关隘名称，如 "潼关"
  passLevel?: number;  // 关隘等级 1-5（影响围城时长与通行限制）

  // 国库（仅州级有效）
  treasury?: { money: number; grain: number };
}
