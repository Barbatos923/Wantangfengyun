// ===== 退出战争交互 =====

import { useWarStore } from '@engine/military/WarStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { isWarParticipant, isWarLeader, getOwnLeaderId } from '@engine/military/warParticipantUtils';
import { positionMap } from '@data/positions';

/**
 * 解散角色在指定战争中的所有行营，军队移回己方领地。
 * 可被 withdrawWar 和死亡清理复用。
 */
export function disbandParticipantCampaigns(charId: string, warId: string): void {
  const warStore = useWarStore.getState();
  const milStore = useMilitaryStore.getState();
  const terrStore = useTerritoryStore.getState();

  // 找一个己方领地作为军队归还地
  let homeId: string | null = null;
  for (const t of terrStore.territories.values()) {
    if (t.tier !== 'zhou') continue;
    const mainPost = t.posts.find(p => positionMap.get(p.templateId)?.grantsControl === true);
    if (mainPost?.holderId === charId) {
      homeId = t.id;
      break;
    }
  }

  for (const campaign of warStore.campaigns.values()) {
    if (campaign.warId !== warId || campaign.ownerId !== charId) continue;

    // 结束该行营的围城
    for (const siege of warStore.sieges.values()) {
      if (siege.campaignId === campaign.id) {
        warStore.endSiege(siege.id);
        break;
      }
    }

    // 军队移回己方领地
    if (homeId) {
      for (const armyId of campaign.armyIds) {
        milStore.updateArmy(armyId, { locationId: homeId });
      }
    }

    useWarStore.getState().disbandCampaign(campaign.id);
  }
}

/**
 * 参战者退出战争。
 *
 * 校验：
 * - 角色是参战者（非领袖）
 * - 战争 active
 *
 * 效果：
 * 1. 从参战者列表中移除
 * 2. 解散该角色的所有行营
 * 3. 对己方领袖好感 -20
 */
export function executeWithdrawWar(charId: string, warId: string): boolean {
  const warStore = useWarStore.getState();
  const war = warStore.wars.get(warId);
  if (!war || war.status !== 'active') return false;

  if (!isWarParticipant(charId, war)) return false;
  if (isWarLeader(charId, war)) return false; // 领袖不能退出

  const leaderId = getOwnLeaderId(charId, war);

  // 移除参战状态
  warStore.removeParticipant(warId, charId);

  // 解散行营
  disbandParticipantCampaigns(charId, warId);

  // 好感惩罚
  if (leaderId) {
    useCharacterStore.getState().setOpinion(charId, leaderId, {
      reason: '退出战争',
      value: -20,
      decayable: true,
    });
  }

  return true;
}
