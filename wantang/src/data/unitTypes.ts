// ===== 兵种定义 =====

import type { UnitTypeDef, UnitType } from '@engine/military/types';

/** 全部兵种定义 */
export const ALL_UNIT_TYPES: UnitTypeDef[] = [
  {
    id: 'heavyInfantry',
    name: '重步兵',
    charge: 6,
    breach: 8,
    pursuit: 2,
    siege: 4,
    marchSpeed: 0.8,
    grainCostPerThousand: 2000,
  },
  {
    id: 'lightInfantry',
    name: '轻步兵',
    charge: 4,
    breach: 5,
    pursuit: 5,
    siege: 3,
    marchSpeed: 1.2,
    grainCostPerThousand: 2000,
  },
  {
    id: 'heavyCavalry',
    name: '重骑兵',
    charge: 10,
    breach: 3,
    pursuit: 6,
    siege: 1,
    marchSpeed: 1.0,
    grainCostPerThousand: 2500,
  },
  {
    id: 'lightCavalry',
    name: '轻骑兵',
    charge: 6,
    breach: 2,
    pursuit: 9,
    siege: 1,
    marchSpeed: 1.5,
    grainCostPerThousand: 2200,
  },
  {
    id: 'archer',
    name: '弓箭手',
    charge: 3,
    breach: 7,
    pursuit: 3,
    siege: 5,
    marchSpeed: 1.0,
    grainCostPerThousand: 2000,
  },
];

/** 兵种查找表 */
export const unitTypeMap = new Map<UnitType, UnitTypeDef>();
for (const u of ALL_UNIT_TYPES) {
  unitTypeMap.set(u.id, u);
}
