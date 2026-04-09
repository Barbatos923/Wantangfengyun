// ===== 行营操作 Action（从 CampaignPopup / MilitaryPanel UI 抽离） =====

import { useWarStore } from '@engine/military/WarStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getMusteringTime } from '@engine/military/marchCalc';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';

/** 检查军队是否已在任意行营中（含 incomingArmies） */
function isArmyInAnyCampaign(armyId: string): boolean {
  for (const c of useWarStore.getState().campaigns.values()) {
    if (c.armyIds.includes(armyId)) return true;
    if (c.incomingArmies.some(ia => ia.armyId === armyId)) return true;
  }
  return false;
}

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

  // 行军中禁止增援：getMusteringTime 用 campaign.locationId 算，但 marching 行营每天换位置，
  // 算出的 ETA 既不是"追上移动中的行营"也不是"先到旧驻地再跟进"，会出现增援军在到位日凭空
  // 落到新位置的语义漂移。等行营停下（idle/sieging）再增援。
  if (campaign.status === 'marching') return;

  const army = useMilitaryStore.getState().armies.get(armyId);
  if (!army) return;

  // 军队已在其他行营中，不可重复编入
  if (isArmyInAnyCampaign(armyId)) return;

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
  // 过滤掉已在其他行营中的军队
  const validArmyIds = armyIds.filter(id => !isArmyInAnyCampaign(id));
  if (validArmyIds.length === 0) return;

  const armies = useMilitaryStore.getState().armies;
  const characters = useCharacterStore.getState().characters;
  const territories = useTerritoryStore.getState().territories;

  // 选最佳统帅：各军兵马使中军事能力最高者
  let bestCommander = '';
  let bestMil = -1;
  for (const aid of validArmyIds) {
    const army = armies.get(aid);
    if (army?.commanderId) {
      const cmd = characters.get(army.commanderId);
      if (cmd && cmd.abilities.military > bestMil) {
        bestMil = cmd.abilities.military;
        bestCommander = army.commanderId;
      }
    }
  }

  // 按集结时间拆分：0 → 立即编入 armyIds；>0 → incomingArmies 通道
  // （warSystem 每日 drain incomingArmies，归零时编入 armyIds 并移动 army.locationId）
  const arrivedIds: string[] = [];
  const incoming: { armyId: string; turnsLeft: number }[] = [];
  for (const aid of validArmyIds) {
    const army = armies.get(aid);
    if (!army) continue;
    const time = getMusteringTime(army.locationId, locationId, territories);
    if (time === 0) arrivedIds.push(aid);
    else incoming.push({ armyId: aid, turnsLeft: time });
  }

  const newCampaign = useWarStore.getState().createCampaign(
    warId,
    ownerId,
    bestCommander || ownerId,
    arrivedIds,
    locationId,
  );

  if (incoming.length > 0) {
    useWarStore.getState().updateCampaign(newCampaign.id, {
      incomingArmies: incoming,
    });
  }
}
