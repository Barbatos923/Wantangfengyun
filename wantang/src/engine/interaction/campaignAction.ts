// ===== 行营操作 Action（从 CampaignPopup / MilitaryPanel UI 抽离） =====

import { useWarStore } from '@engine/military/WarStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getMusteringTime } from '@engine/military/marchCalc';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';

/** 设定行军目标 */
export function executeSetCampaignTarget(
  campaignId: string,
  targetId: string,
  path: string[],
): void {
  useWarStore.getState().setCampaignTarget(campaignId, targetId, path);
}

/** 添加军队到行营 */
export function executeAddArmyToCampaign(
  campaignId: string,
  armyId: string,
): void {
  const warStore = useWarStore.getState();
  const campaign = warStore.campaigns.get(campaignId);
  if (!campaign) return;

  const army = useMilitaryStore.getState().armies.get(armyId);
  if (!army) return;

  const territories = useTerritoryStore.getState().territories;
  const turnsLeft = getMusteringTime(army.locationId, campaign.locationId, territories);

  if (turnsLeft === 0) {
    warStore.updateCampaign(campaignId, {
      armyIds: [...campaign.armyIds, armyId],
    });
  } else {
    warStore.updateCampaign(campaignId, {
      incomingArmies: [...campaign.incomingArmies, { armyId, turnsLeft }],
    });
  }
}

/** 移除军队 */
export function executeRemoveArmyFromCampaign(
  campaignId: string,
  armyId: string,
): void {
  const campaign = useWarStore.getState().campaigns.get(campaignId);
  if (!campaign) return;
  useWarStore.getState().updateCampaign(campaignId, {
    armyIds: campaign.armyIds.filter((id) => id !== armyId),
  });
}

/** 解散行营 */
export function executeDisbandCampaign(campaignId: string): void {
  useWarStore.getState().disbandCampaign(campaignId);
}

/** 设定战术策略 */
export function executeSetStrategy(
  campaignId: string,
  phase: string,
  strategyId: string | undefined,
): void {
  const campaign = useWarStore.getState().campaigns.get(campaignId);
  if (!campaign) return;
  useWarStore.getState().updateCampaign(campaignId, {
    phaseStrategies: { ...campaign.phaseStrategies, [phase]: strategyId },
  });
}

/** 设定行营统帅 */
export function executeSetCampaignCommander(
  campaignId: string,
  commanderId: string,
): void {
  useWarStore.getState().updateCampaign(campaignId, { commanderId });
}

/** 组建行营（战争行营 or 独立行营） */
export function executeCreateCampaign(
  warId: string,
  ownerId: string,
  armyIds: string[],
  locationId: string,
): void {
  const armies = useMilitaryStore.getState().armies;
  const characters = useCharacterStore.getState().characters;
  const territories = useTerritoryStore.getState().territories;

  // 选最佳统帅：各军兵马使中军事能力最高者
  let bestCommander = '';
  let bestMil = -1;
  for (const armyId of armyIds) {
    const army = armies.get(armyId);
    if (army?.commanderId) {
      const cmd = characters.get(army.commanderId);
      if (cmd && cmd.abilities.military > bestMil) {
        bestMil = cmd.abilities.military;
        bestCommander = army.commanderId;
      }
    }
  }

  // 计算最大集结时间
  let maxMustering = 0;
  for (const armyId of armyIds) {
    const army = armies.get(armyId);
    if (army) {
      const time = getMusteringTime(army.locationId, locationId, territories);
      if (time > maxMustering) maxMustering = time;
    }
  }

  const newCampaign = useWarStore.getState().createCampaign(
    warId,
    ownerId,
    bestCommander || ownerId,
    armyIds,
    locationId,
  );

  if (maxMustering > 0) {
    useWarStore.getState().updateCampaign(newCampaign.id, {
      status: 'mustering',
      musteringTurnsLeft: maxMustering,
    });
  }
}
