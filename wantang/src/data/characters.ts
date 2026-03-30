// ===== 初始角色数据（867年）=====
// 数据存储在 characters.json，可用 Excel/编辑器直接修改

import type { Character } from '@engine/character/types';
import charactersData from './characters.json';

export function createAllCharacters(): Character[] {
  return charactersData as Character[];
}
