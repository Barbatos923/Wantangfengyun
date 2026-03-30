// ===== 初始军队数据（867年）=====
// 数据存储在 armies.json / battalions.json

import type { Army, Battalion } from '@engine/military/types';
import armiesData from './armies.json';
import battalionsData from './battalions.json';

export function createAllArmies(): Army[] {
  return armiesData as Army[];
}

export function createAllBattalions(): Battalion[] {
  return battalionsData as Battalion[];
}
