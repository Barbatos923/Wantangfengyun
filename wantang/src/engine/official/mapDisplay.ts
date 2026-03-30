// ===== 地图着色计算（纯函数） =====

import type { Territory } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import { getActualController } from './postQueries';
import { findTopLord } from '@engine/character/characterUtils';

export interface MapDisplayResult {
  /** 每个州应该用谁的颜色 (zhouId → charId) */
  zhouColorMap: Map<string, string>;
  /** 每个州的顶级领主 (zhouId → topLordId) */
  zhouTopLordMap: Map<string, string>;
}

/**
 * 沿 overlordId 链上溯，找到某个角色在指定顶级领主下的一级封臣身份。
 * 即：controllerId 的 overlord 链中，直接附庸于 topLordId 的那个角色。
 * 如果 controllerId 本身就是 topLord，返回 topLord（直辖）。
 */
function findFirstVassal(
  controllerId: string,
  topLordId: string,
  characters: Map<string, Character>,
): string {
  let current = controllerId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) return current;
    visited.add(current);
    const char = characters.get(current);
    if (!char) return current;
    // 到达顶级领主本人 → 直辖
    if (current === topLordId) return topLordId;
    // 上级就是顶级领主 → 当前角色是一级封臣
    if (char.overlordId === topLordId) return current;
    if (!char.overlordId) return current;
    current = char.overlordId;
  }
}

/**
 * 判断 charId 是否在 ancestorId 的效忠链上（charId 的上级链中包含 ancestorId）。
 */
function isUnder(
  charId: string,
  ancestorId: string,
  characters: Map<string, Character>,
): boolean {
  if (charId === ancestorId) return true;
  let current = charId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) return false;
    visited.add(current);
    const char = characters.get(current);
    if (!char?.overlordId) return false;
    if (char.overlordId === ancestorId) return true;
    current = char.overlordId;
  }
}

/**
 * 计算地图着色。
 *
 * 展开逻辑：
 * 1. 玩家势力始终按一级封臣展开
 * 2. mapFocusCharId 指向某角色时，该角色的领地进一步按其一级封臣展开
 *    （如：玩家=皇帝，mapFocus=郑从傥 → 郑的领地拆为直辖+李国昌+昭义使）
 */
export function computeMapDisplay(
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  playerId: string,
  mapFocusCharId: string | null,
): MapDisplayResult {
  const zhouColorMap = new Map<string, string>();
  const zhouTopLordMap = new Map<string, string>();

  // 第一遍：计算每个州的顶级领主
  territories.forEach((t) => {
    if (t.tier !== 'zhou') return;
    const controllerId = getActualController(t);
    if (!controllerId) return;
    const topLord = findTopLord(controllerId, characters);
    zhouTopLordMap.set(t.id, topLord);
  });

  const playerTopLord = findTopLord(playerId, characters);

  // 第二遍：计算着色
  territories.forEach((t) => {
    if (t.tier !== 'zhou') return;
    const controllerId = getActualController(t);
    if (!controllerId) return;
    const topLord = zhouTopLordMap.get(t.id);
    if (!topLord) return;

    // 判断是否属于玩家势力（需要展开一级封臣）
    const isPlayerRealm = topLord === playerTopLord;

    if (isPlayerRealm) {
      // 第一层：按玩家的一级封臣着色
      const firstVassal = findFirstVassal(controllerId, playerTopLord, characters);

      // 第二层：如果 mapFocus 指向某个一级封臣，进一步展开该封臣的领地
      if (mapFocusCharId && isUnder(controllerId, mapFocusCharId, characters)) {
        // 该州在 mapFocus 角色的管辖下 → 按 mapFocus 的一级封臣着色
        zhouColorMap.set(t.id, findFirstVassal(controllerId, mapFocusCharId, characters));
      } else {
        zhouColorMap.set(t.id, firstVassal);
      }
    } else if (mapFocusCharId && topLord === mapFocusCharId) {
      // 非玩家势力的顶级领主被聚焦 → 按其一级封臣着色
      zhouColorMap.set(t.id, findFirstVassal(controllerId, topLord, characters));
    } else {
      // 聚合：按顶级领主着色
      zhouColorMap.set(t.id, topLord);
    }
  });

  return { zhouColorMap, zhouTopLordMap };
}
