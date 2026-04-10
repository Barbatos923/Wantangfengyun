// ===== 指挥任命唯一性规则 =====
//
// 兵马使（Army.commanderId）全局唯一：一人不能同时担任两支军的兵马使。
// 都统（Campaign.commanderId）全局唯一：一人不能同时担任两个行营的都统。
// 允许兼任：同一人可以同时是某军的兵马使 + 某行营的都统。

import { useMilitaryStore } from './MilitaryStore';
import { useWarStore } from './WarStore';
import type { Army, Campaign } from './types';

/** 查找该角色当前担任兵马使的军（全局唯一） */
export function findArmyCommandedBy(commanderId: string): Army | undefined {
  for (const army of useMilitaryStore.getState().armies.values()) {
    if (army.commanderId === commanderId) return army;
  }
  return undefined;
}

/** 查找该角色当前担任都统的行营（全局唯一） */
export function findCampaignCommandedBy(commanderId: string): Campaign | undefined {
  for (const campaign of useWarStore.getState().campaigns.values()) {
    if (campaign.commanderId === commanderId) return campaign;
  }
  return undefined;
}

/**
 * 能否任命为兵马使？
 * - null 总是允许（撤换）
 * - 排除已在其他军担任兵马使的角色（全局唯一）
 * - 不检查身份归属（调用方自行检查 owner/vassal 关系）
 */
export function canAssignArmyCommander(
  armyId: string,
  commanderId: string | null,
): boolean {
  if (commanderId === null) return true;
  const existing = findArmyCommandedBy(commanderId);
  // 没有在任何军当兵马使，或者就是当前军（重复任命自己 = noop）
  return !existing || existing.id === armyId;
}

/**
 * 能否任命为都统？
 * - 排除已在其他行营担任都统的角色（全局唯一）
 */
export function canAssignCampaignCommander(
  campaignId: string,
  commanderId: string,
): boolean {
  const existing = findCampaignCommandedBy(commanderId);
  return !existing || existing.id === campaignId;
}
