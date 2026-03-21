// ===== 建筑定义 =====

import type { TerritoryType } from '@engine/territory/types';

/** 建筑定义 */
export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  maxLevel: number;

  // 每级造价
  costMoney: number;
  costGrain: number;
  // 每级工期（月）
  constructionMonths: number;

  // 每级效果
  moneyPerLevel: number;
  grainPerLevel: number;
  troopsPerLevel: number;
  defensePerLevel: number;         // 防御百分比加成
  controlPerMonthPerLevel: number; // 每月控制度加成
  developmentPerMonthPerLevel: number; // 每月发展度加成
  populacePerMonthPerLevel: number;   // 每月民心加成
  stressReductionPerLevel: number;    // 统治者每月压力减少
  grainStoragePerLevel: number;       // 粮储上限加成

  // 限制条件：通用/民政/军事
  allowedType: 'any' | TerritoryType;
}

export const ALL_BUILDINGS: BuildingDef[] = [
  {
    id: 'building-farm',
    name: '农田',
    description: '开垦农田，增加粮食产出',
    maxLevel: 3,
    costMoney: 100, costGrain: 50, constructionMonths: 3,
    moneyPerLevel: 0, grainPerLevel: 5, troopsPerLevel: 0,
    defensePerLevel: 0, controlPerMonthPerLevel: 0,
    developmentPerMonthPerLevel: 0, populacePerMonthPerLevel: 0,
    stressReductionPerLevel: 0, grainStoragePerLevel: 0,
    allowedType: 'any',
  },
  {
    id: 'building-market',
    name: '集市',
    description: '兴建集市，增加钱财收入',
    maxLevel: 3,
    costMoney: 150, costGrain: 30, constructionMonths: 3,
    moneyPerLevel: 8, grainPerLevel: 0, troopsPerLevel: 0,
    defensePerLevel: 0, controlPerMonthPerLevel: 0,
    developmentPerMonthPerLevel: 0, populacePerMonthPerLevel: 0,
    stressReductionPerLevel: 0, grainStoragePerLevel: 0,
    allowedType: 'civil',
  },
  {
    id: 'building-barracks',
    name: '兵营',
    description: '训练士兵，增加兵力产出',
    maxLevel: 3,
    costMoney: 120, costGrain: 80, constructionMonths: 4,
    moneyPerLevel: 0, grainPerLevel: 0, troopsPerLevel: 3,
    defensePerLevel: 0, controlPerMonthPerLevel: 0,
    developmentPerMonthPerLevel: 0, populacePerMonthPerLevel: 0,
    stressReductionPerLevel: 0, grainStoragePerLevel: 0,
    allowedType: 'military',
  },
  {
    id: 'building-walls',
    name: '城墙',
    description: '加固城墙，增加防御和控制',
    maxLevel: 3,
    costMoney: 200, costGrain: 100, constructionMonths: 6,
    moneyPerLevel: 0, grainPerLevel: 0, troopsPerLevel: 0,
    defensePerLevel: 20, controlPerMonthPerLevel: 0.3,
    developmentPerMonthPerLevel: 0, populacePerMonthPerLevel: 0,
    stressReductionPerLevel: 0, grainStoragePerLevel: 0,
    allowedType: 'any',
  },
  {
    id: 'building-granary',
    name: '粮仓',
    description: '扩建粮仓，增加粮储上限',
    maxLevel: 3,
    costMoney: 80, costGrain: 20, constructionMonths: 2,
    moneyPerLevel: 0, grainPerLevel: 0, troopsPerLevel: 0,
    defensePerLevel: 0, controlPerMonthPerLevel: 0,
    developmentPerMonthPerLevel: 0, populacePerMonthPerLevel: 0,
    stressReductionPerLevel: 0, grainStoragePerLevel: 500,
    allowedType: 'any',
  },
  {
    id: 'building-academy',
    name: '书院',
    description: '兴办教育，增加发展度',
    maxLevel: 3,
    costMoney: 180, costGrain: 40, constructionMonths: 4,
    moneyPerLevel: 0, grainPerLevel: 0, troopsPerLevel: 0,
    defensePerLevel: 0, controlPerMonthPerLevel: 0,
    developmentPerMonthPerLevel: 0.3, populacePerMonthPerLevel: 0,
    stressReductionPerLevel: 0, grainStoragePerLevel: 0,
    allowedType: 'civil',
  },
  {
    id: 'building-temple',
    name: '寺庙',
    description: '安抚民心，减轻统治者压力',
    maxLevel: 3,
    costMoney: 120, costGrain: 30, constructionMonths: 3,
    moneyPerLevel: 0, grainPerLevel: 0, troopsPerLevel: 0,
    defensePerLevel: 0, controlPerMonthPerLevel: 0,
    developmentPerMonthPerLevel: 0, populacePerMonthPerLevel: 0.5,
    stressReductionPerLevel: 1, grainStoragePerLevel: 0,
    allowedType: 'any',
  },
  {
    id: 'building-fortress',
    name: '要塞',
    description: '军事要塞，大幅增加防御和兵力',
    maxLevel: 3,
    costMoney: 250, costGrain: 150, constructionMonths: 6,
    moneyPerLevel: 0, grainPerLevel: 0, troopsPerLevel: 2,
    defensePerLevel: 40, controlPerMonthPerLevel: 0,
    developmentPerMonthPerLevel: 0, populacePerMonthPerLevel: 0,
    stressReductionPerLevel: 0, grainStoragePerLevel: 0,
    allowedType: 'military',
  },
  {
    id: 'building-smithy',
    name: '铁匠铺',
    description: '打造兵器，增加收入和兵力',
    maxLevel: 3,
    costMoney: 140, costGrain: 60, constructionMonths: 3,
    moneyPerLevel: 4, grainPerLevel: 0, troopsPerLevel: 1,
    defensePerLevel: 0, controlPerMonthPerLevel: 0,
    developmentPerMonthPerLevel: 0, populacePerMonthPerLevel: 0,
    stressReductionPerLevel: 0, grainStoragePerLevel: 0,
    allowedType: 'any',
  },
  {
    id: 'building-post',
    name: '驿站',
    description: '设置驿站，加强控制',
    maxLevel: 3,
    costMoney: 100, costGrain: 30, constructionMonths: 2,
    moneyPerLevel: 0, grainPerLevel: 0, troopsPerLevel: 0,
    defensePerLevel: 0, controlPerMonthPerLevel: 0.5,
    developmentPerMonthPerLevel: 0, populacePerMonthPerLevel: 0,
    stressReductionPerLevel: 0, grainStoragePerLevel: 0,
    allowedType: 'civil',
  },
];

/** 建筑查找表 */
export const buildingMap = new Map<string, BuildingDef>();
for (const b of ALL_BUILDINGS) {
  buildingMap.set(b.id, b);
}
