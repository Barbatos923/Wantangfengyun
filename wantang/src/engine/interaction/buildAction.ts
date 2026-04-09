// ===== 建造建筑 =====

import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { debitTreasury } from '@engine/territory/treasuryUtils';

/**
 * 执行建造/升级建筑：从本州国库扣费 + 开始施工。
 *
 * 引擎层硬约束（玩家 UI 与 NPC 行为统一走这里）：
 * 1) 一州同时只能有一个工程在施工（NPC behavior 已经按这条假设设计）。
 * 2) 同一建筑不得重复排队：施工列表里已有的 buildingId 不可再次排（避免唯一建筑被并行点出）。
 * 3) slotIndex 必须空槽或当前 buildingId 一致（升级路径）。
 *
 * 校验失败 → 返回 false，不扣资源、不写状态。
 */
export function executeBuild(
  playerId: string,
  territoryId: string,
  slotIndex: number,
  buildingId: string,
  targetLevel: number,
  moneyCost: number,
  grainCost: number,
  duration: number,
): boolean {
  const terrStore = useTerritoryStore.getState();
  const territory = terrStore.territories.get(territoryId);
  if (!territory) return false;

  // 1) 一州同时只能有一个工程
  if (territory.constructions.length > 0) return false;

  // 2) 同一建筑不得在施工列表里出现两次（防御：constructions.length>0 已覆盖，但保留显式语义）
  if (territory.constructions.some((c) => c.buildingId === buildingId)) return false;

  // 3) 槽位合法性
  const slot = territory.buildings[slotIndex];
  if (!slot) return false;
  if (slot.buildingId !== null && slot.buildingId !== buildingId) return false;
  // 升级路径：targetLevel 必须严格 = 当前 +1
  if (slot.buildingId !== null && targetLevel !== slot.level + 1) return false;
  // 新建路径：targetLevel 必须 = 1
  if (slot.buildingId === null && targetLevel !== 1) return false;

  debitTreasury(territoryId, playerId, { money: moneyCost, grain: grainCost });
  terrStore.startConstruction(territoryId, {
    slotIndex,
    buildingId,
    targetLevel,
    remainingMonths: duration,
  });
  return true;
}
