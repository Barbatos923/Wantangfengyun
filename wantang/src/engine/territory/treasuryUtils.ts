/**
 * 国库纯函数工具集
 * - resolveCapital: NPC 治所自动选择
 * - getCapitalTreasury: 获取角色治所州国库
 * - getTotalTreasury: 角色所有州国库之和
 * - findNearestFriendlyZhou: 找最近友方州（用 findPath，关隘可阻断）
 */

import type { Territory } from './types';
import type { Character } from '@engine/character/types';
import { positionMap } from '@data/positions';
import { findPath } from '@engine/military/marchCalc';
import { useTerritoryStore } from './TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';

// ===== 治所选择 =====

/**
 * NPC 治所自动选择逻辑（纯函数）
 *
 * 优先级：
 * 1. 有道级主岗 → 该道的 capitalZhouId（多道取人口最多的道）
 * 2. 有多州 → 人口最多的州
 * 3. 无州 → undefined
 */
export function resolveCapital(
  charId: string,
  territories: Map<string, Territory>,
  controllerIndex: Map<string, Set<string>>,
  holderIndex: Map<string, string[]>,
): string | undefined {
  const controlledIds = controllerIndex.get(charId);
  if (!controlledIds || controlledIds.size === 0) return undefined;

  // 收集角色控制的所有州
  const controlledZhous: Territory[] = [];
  for (const tid of controlledIds) {
    const t = territories.get(tid);
    if (t && t.tier === 'zhou') controlledZhous.push(t);
  }
  if (controlledZhous.length === 0) return undefined;
  if (controlledZhous.length === 1) return controlledZhous[0].id;

  // 检查角色是否持有道级主岗
  const postIds = holderIndex.get(charId);
  if (postIds) {
    const daoCandidates: { capitalZhouId: string; pop: number }[] = [];
    for (const pid of postIds) {
      // 在领地中找到这个岗位所在的 territory
      for (const t of territories.values()) {
        if (t.tier !== 'dao') continue;
        const post = t.posts.find(p => p.id === pid && p.holderId === charId);
        if (!post) continue;
        const tpl = positionMap.get(post.templateId);
        if (!tpl?.grantsControl) continue;
        // 这是角色持有的道级主岗
        if (t.capitalZhouId) {
          const capitalZhou = territories.get(t.capitalZhouId);
          if (capitalZhou) {
            daoCandidates.push({
              capitalZhouId: t.capitalZhouId,
              pop: capitalZhou.basePopulation,
            });
          }
        }
      }
    }
    if (daoCandidates.length > 0) {
      // 多道取人口最多的道的治所州
      daoCandidates.sort((a, b) => b.pop - a.pop);
      return daoCandidates[0].capitalZhouId;
    }
  }

  // 无道级主岗，选人口最多的州
  controlledZhous.sort((a, b) => b.basePopulation - a.basePopulation);
  return controlledZhous[0].id;
}

// ===== 国库查询 =====

/**
 * 获取角色治所州的国库
 * 如果角色没有 capital 或 capital 州无国库，返回 null
 */
export function getCapitalTreasury(
  charId: string,
  characters: Map<string, Character>,
  territories: Map<string, Territory>,
): { money: number; grain: number } | null {
  const char = characters.get(charId);
  if (!char?.capital) return null;
  const t = territories.get(char.capital);
  return t?.treasury ?? null;
}

/**
 * 获取角色所有州国库之和（纯函数版本）
 */
export function getTotalTreasury(
  charId: string,
  territories: Map<string, Territory>,
  controllerIndex: Map<string, Set<string>>,
): { money: number; grain: number } {
  const terrIds = controllerIndex.get(charId);
  let money = 0;
  let grain = 0;
  if (terrIds) {
    for (const tid of terrIds) {
      const t = territories.get(tid);
      if (t?.treasury) {
        money += t.treasury.money;
        grain += t.treasury.grain;
      }
    }
  }
  return { money, grain };
}

// ===== 军费补给：最近友方州 =====

/**
 * 从 locationId 出发，用 findPath 找最近的角色控制的州。
 * findPath 会检查关隘通行，所以关隘阻断时可能找不到。
 *
 * @returns 最近友方州 ID，找不到返回 null
 */
export function findNearestFriendlyZhou(
  locationId: string,
  ownerId: string,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  controllerIndex: Map<string, Set<string>>,
): string | null {
  const controlledIds = controllerIndex.get(ownerId);
  if (!controlledIds || controlledIds.size === 0) return null;

  // 如果军队所在州就是自己的，直接返回
  if (controlledIds.has(locationId)) return locationId;

  // 对每个友方州计算路径，取最短的
  let bestZhou: string | null = null;
  let bestDist = Infinity;

  for (const tid of controlledIds) {
    const t = territories.get(tid);
    if (!t || t.tier !== 'zhou') continue;

    const path = findPath(locationId, tid, ownerId, territories, characters);
    if (path && path.length < bestDist) {
      bestDist = path.length;
      bestZhou = tid;
    }
  }

  return bestZhou;
}

// ===== Store 级别扣费辅助（交互/决议用） =====

/**
 * 从指定州国库扣费。无 treasury 时 fallback 到角色私产。
 */
export function debitTreasury(
  territoryId: string,
  charId: string,
  amount: { money?: number; grain?: number },
): void {
  const terrStore = useTerritoryStore.getState();
  const t = terrStore.territories.get(territoryId);
  if (t?.treasury) {
    terrStore.addTreasury(territoryId, {
      money: -(amount.money ?? 0),
      grain: -(amount.grain ?? 0),
    });
  } else {
    // fallback 到私产
    useCharacterStore.getState().addResources(charId, {
      money: amount.money ? -amount.money : undefined,
      grain: amount.grain ? -amount.grain : undefined,
    });
  }
}

/**
 * 从角色治所州国库扣费。无 capital 时 fallback 到私产。
 */
export function debitCapitalTreasury(
  charId: string,
  amount: { money?: number; grain?: number },
): void {
  const char = useCharacterStore.getState().characters.get(charId);
  if (char?.capital) {
    debitTreasury(char.capital, charId, amount);
  } else {
    // 无治所，从私产扣
    useCharacterStore.getState().addResources(charId, {
      money: amount.money ? -amount.money : undefined,
      grain: amount.grain ? -amount.grain : undefined,
    });
  }
}

/**
 * 获取角色治所州国库余额（Store 便捷版）。无 capital 返回私产余额。
 */
export function getCapitalBalance(charId: string): { money: number; grain: number } {
  const charStore = useCharacterStore.getState();
  const char = charStore.characters.get(charId);
  if (char?.capital) {
    const t = useTerritoryStore.getState().territories.get(char.capital);
    if (t?.treasury) return { ...t.treasury };
  }
  // fallback：返回私产
  return char ? { money: char.resources.money, grain: char.resources.grain } : { money: 0, grain: 0 };
}

/**
 * 获取指定州国库余额（Store 便捷版）。无 treasury 返回 {0,0}。
 */
export function getTerritoryBalance(territoryId: string): { money: number; grain: number } {
  const t = useTerritoryStore.getState().territories.get(territoryId);
  return t?.treasury ? { ...t.treasury } : { money: 0, grain: 0 };
}
