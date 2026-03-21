// ===== 领地完整类型定义 =====

/** 领地等级 */
export type TerritoryTier = 'zhou' | 'dao' | 'guo';

/** 领地类型 */
export type TerritoryType = 'civil' | 'military';

/** 集权等级 1-4 */
export type CentralizationLevel = 1 | 2 | 3 | 4;

/** 建筑槽位 */
export interface BuildingSlot {
  buildingId: string | null;  // null = 空槽
  level: number;              // 0 = 空
}

/** 施工进度 */
export interface Construction {
  slotIndex: number;
  buildingId: string;
  targetLevel: number;
  remainingMonths: number;
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

  // 归属
  dejureControllerId: string;   // 法理控制人
  actualControllerId: string;   // 实际控制人
  centralization: CentralizationLevel;

  // 属性
  control: number;      // 控制度 0-100
  development: number;  // 发展度 0-100
  populace: number;     // 民心 0-100

  // 建筑 (4个槽位, 发展度>80扩展为6个)
  buildings: BuildingSlot[];

  // 施工队列
  constructions: Construction[];

  // 驻军
  garrison: number;

  // 基础人口
  basePopulation: number;
}
