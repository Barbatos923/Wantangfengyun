// ===== 军事操作 Action（从 MilitaryPanel UI 抽离） =====
//
// 执行层瞬时重校验原则（与决议/审批一致）：
// UI 按钮的 canXxx 是快照，executeXxx 在真正扣资源/写状态前必须再跑一次校验，失败 → 返回 false
// 不写任何状态。这样面板打开期间世界状态变化（资源被花掉、领地易主、兵源池被消耗）也不会
// 把州库扣到不该扣的地方。
//
// 为什么不在 debitTreasury / addTreasury 加非负数保护：月结结算允许州库负值（债务机制，
// 破产阈值 -50000），低层助手必须保持透明，瞬时校验放在交互命令层。

import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { MAX_BATTALION_STRENGTH } from '@engine/military/types';
import type { UnitType } from '@engine/military/types';
import { debitTreasury, debitCapitalTreasury, getCapitalBalance } from '@engine/territory/treasuryUtils';
import { getAvailableRecruits } from '@engine/military/militaryCalc';
import { canAssignArmyCommander } from '@engine/military/commandRules';

/** 每兵征募费用（贯） */
export const RECRUIT_COST_PER_SOLDIER = 20;

/** 征兵：创建一个新营，扣减领地人口、征兵池和金钱 */
export function executeRecruit(
  armyId: string,
  territoryId: string,
  unitType: UnitType,
  name: string,
): boolean {
  const army = useMilitaryStore.getState().armies.get(armyId);
  if (!army) return false;

  const terrStore = useTerritoryStore.getState();
  const territory = terrStore.territories.get(territoryId);
  if (!territory) return false;

  // 瞬时重校验：领地控制权 + 兵源池 + 州库金钱 + 人口（与 MilitaryPanel canRecruit 对齐）
  // controllerIndex 是预计算索引，O(1)；面板打开期间州被转让/攻陷会立即反映出来。
  if (!terrStore.controllerIndex.get(army.ownerId)?.has(territoryId)) return false;
  const moneyCost = MAX_BATTALION_STRENGTH * RECRUIT_COST_PER_SOLDIER;
  if (getAvailableRecruits(territory) < MAX_BATTALION_STRENGTH) return false;
  const treasuryMoney = territory.treasury?.money ?? 0;
  if (treasuryMoney < moneyCost) return false;
  if (territory.populace < 1) return false;

  useMilitaryStore.getState().recruitBattalion(armyId, territoryId, unitType, name);
  const householdsLost = Math.floor(MAX_BATTALION_STRENGTH / 5);
  // 征兵费从 homeTerritory（兵源州）国库扣
  debitTreasury(territoryId, army.ownerId, { money: moneyCost });
  // territory 引用前面已经拿过；用最新快照写回，避免被中间 mutation 覆盖
  const fresh = useTerritoryStore.getState().territories.get(territoryId);
  if (fresh) {
    useTerritoryStore.getState().updateTerritory(territoryId, {
      basePopulation: Math.max(0, fresh.basePopulation - householdsLost),
      populace: Math.max(0, fresh.populace - 1),
      conscriptionPool: Math.max(0, fresh.conscriptionPool - MAX_BATTALION_STRENGTH),
    });
  }
  return true;
}

/** 赏赐：扣 capital 州国库，提升全军士气 */
export function executeReward(
  playerId: string,
  armyId: string,
  amount: number,
  moraleGain: number,
): boolean {
  const army = useMilitaryStore.getState().armies.get(armyId);
  if (!army) return false;

  // 瞬时重校验：金额 > 0 + capital 国库余额（与 MilitaryPanel canReward 对齐）
  if (amount <= 0) return false;
  if (getCapitalBalance(playerId).money < amount) return false;

  // 赏赐从 capital 国库扣
  debitCapitalTreasury(playerId, { money: amount });
  useMilitaryStore.getState().batchMutateBattalions((batsMap) => {
    for (const batId of army.battalionIds) {
      const bat = batsMap.get(batId);
      if (bat) {
        batsMap.set(batId, {
          ...bat,
          morale: Math.min(100, bat.morale + moraleGain),
        });
      }
    }
  });
  return true;
}

/**
 * 建军：执行层瞬时校验同样适用——领地控制权 + 绑定岗位归属 + postId 唯一性。
 */
export function executeCreateArmy(
  name: string,
  ownerId: string,
  locationId: string,
  postId: string | null,
): boolean {
  const terrStore = useTerritoryStore.getState();
  const territory = terrStore.territories.get(locationId);
  if (!territory) return false;
  // ownerId 必须仍控制 locationId（面板打开后该州可能被转让/攻陷）
  if (!terrStore.controllerIndex.get(ownerId)?.has(locationId)) return false;

  if (postId !== null) {
    // 绑定岗位：必须仍存在、仍归 ownerId、且尚未被其他军绑定
    const post = terrStore.findPost(postId);
    if (!post || post.holderId !== ownerId) return false;
    const existingBound = Array.from(useMilitaryStore.getState().armies.values())
      .some((a) => a.postId === postId);
    if (existingBound) return false;
  }

  useMilitaryStore.getState().createArmy(name, ownerId, locationId, undefined, postId);
  return true;
}

/**
 * 换将（设置兵马使）：候选必须存活、全局唯一（不得在任何其他军已任兵马使）；clear（null）总是允许。
 */
export function executeSetCommander(
  armyId: string,
  commanderId: string | null,
): boolean {
  const milStore = useMilitaryStore.getState();
  const army = milStore.armies.get(armyId);
  if (!army) return false;

  if (commanderId !== null) {
    const candidate = useCharacterStore.getState().characters.get(commanderId);
    if (!candidate?.alive) return false;
    // 候选必须是 army.ownerId 自己或其臣属（与 MilitaryPanel 候选集对齐：getVassals(ownerId)）
    if (commanderId !== army.ownerId && candidate.overlordId !== army.ownerId) return false;
    // 全局唯一：不得在任何其他军已任兵马使
    if (!canAssignArmyCommander(armyId, commanderId)) return false;
  }

  milStore.updateArmy(armyId, { commanderId });
  return true;
}

/**
 * 调营（转移营到另一个军）：源军 / 目标军必须 owner 一致，避免跨势力转营。
 */
export function executeTransferBattalion(
  battalionId: string,
  targetArmyId: string,
): boolean {
  const milStore = useMilitaryStore.getState();
  const bat = milStore.battalions.get(battalionId);
  if (!bat) return false;
  const sourceArmy = milStore.armies.get(bat.armyId);
  if (!sourceArmy) return false;
  const targetArmy = milStore.armies.get(targetArmyId);
  if (!targetArmy) return false;
  if (sourceArmy.id === targetArmy.id) return false;
  // 跨势力转营禁止：必须同 owner
  if (sourceArmy.ownerId !== targetArmy.ownerId) return false;

  milStore.transferBattalion(battalionId, targetArmyId);
  return true;
}

/** 裁营（解散营） */
export function executeDisbandBattalion(battalionId: string): void {
  useMilitaryStore.getState().disbandBattalion(battalionId);
}

/** 补员：补满营兵力，扣减籍贯地人口和金钱 */
export function executeReplenish(
  battalionId: string,
  territoryId: string,
  deficit: number,
  payerId: string,
): boolean {
  if (deficit <= 0) return false;

  // 瞬时重校验：营仍存在且未满员、领地仍存在且州库够、兵源池够
  const bat = useMilitaryStore.getState().battalions.get(battalionId);
  if (!bat || bat.currentStrength >= MAX_BATTALION_STRENGTH) return false;
  // 实际缺口可能比 UI 传入的小（中间被部分补过），按当前快照取最大补足量
  const actualDeficit = MAX_BATTALION_STRENGTH - bat.currentStrength;
  const effectiveDeficit = Math.min(deficit, actualDeficit);

  const terrStore = useTerritoryStore.getState();
  const territory = terrStore.territories.get(territoryId);
  if (!territory) return false;
  // 领地控制权重校验：补员费从兵源州扣，兵源州必须仍由 payerId 控制
  if (!terrStore.controllerIndex.get(payerId)?.has(territoryId)) return false;
  const moneyCost = effectiveDeficit * RECRUIT_COST_PER_SOLDIER;
  const treasuryMoney = territory.treasury?.money ?? 0;
  if (treasuryMoney < moneyCost) return false;
  if (getAvailableRecruits(territory) < effectiveDeficit) return false;

  // 补员费从 homeTerritory（兵源州）国库扣
  debitTreasury(territoryId, payerId, { money: moneyCost });
  useMilitaryStore.getState().updateBattalion(battalionId, {
    currentStrength: bat.currentStrength + effectiveDeficit,
  });
  const fresh = useTerritoryStore.getState().territories.get(territoryId);
  if (fresh) {
    const householdsLost = Math.floor(effectiveDeficit / 5);
    useTerritoryStore.getState().updateTerritory(territoryId, {
      basePopulation: Math.max(0, fresh.basePopulation - householdsLost),
      populace: Math.max(0, fresh.populace - Math.ceil(effectiveDeficit / 1000)),
      conscriptionPool: Math.max(0, fresh.conscriptionPool - effectiveDeficit),
    });
  }
  return true;
}
