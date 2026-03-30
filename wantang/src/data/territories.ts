// ===== 领地数据（867年）=====
// 数据存储在 territories.json，可用编辑器直接修改

import type { Territory } from '@engine/territory/types';
import territoriesData from './territories.json';

export function createAllTerritories(): Territory[] {
  return territoriesData as Territory[];
}
