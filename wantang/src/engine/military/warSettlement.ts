// ===== 战争结算（结束战争时调用） =====

import { useWarStore } from './WarStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useMilitaryStore } from './MilitaryStore';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority } from '@engine/types';
import { positionMap } from '@data/positions';
import type { War } from './types';
import { findEmperorId, collectRulerIds } from '@engine/official/postQueries';
import { addCollapseProgress } from '@engine/systems/eraSystem';

/**
 * 结束战争并按宣战理由分派结算。
 *
 * 流程：
 * 1. 按 casusBelli × result 分派到具体结算函数
 * 2. 通用收尾：清除占领、结束战争、解散行营
 */
export function settleWar(warId: string, result: War['result']): void {
  const warStore = useWarStore.getState();
  const war = warStore.wars.get(warId);
  if (!war || !result) return;

  // ── 按理由分派结算 ──────────────────────────────────────────────────────
  switch (war.casusBelli) {
    case 'annexation':
    case 'deJureClaim':
      settleTerritorialWar(war, result);
      break;
    case 'independence':
      settleIndependenceWar(war, result);
      break;
    default:
      // 其他理由暂用领地战争的通用逻辑
      settleTerritorialWar(war, result);
      break;
  }

  // ── 战争结束事件通知 ────────────────────────────────────────────────────
  emitWarEndEvent(war, result);

  // ── 通用收尾 ──────────────────────────────────────────────────────────
  clearOccupation(war);
  warStore.endWar(warId, result);
  disbandCampaigns(warId);
}

// ── 战争结束事件（无条件记录，UI 层筛选显示） ─────────────────────────────

function emitWarEndEvent(war: War, result: War['result']): void {
  const charStore = useCharacterStore.getState();
  const turnMgr = useTurnManager.getState();
  const date = turnMgr.currentDate;

  const attackerName = charStore.getCharacter(war.attackerId)?.name ?? '???';
  const defenderName = charStore.getCharacter(war.defenderId)?.name ?? '???';

  const resultText = result === 'attackerWin' ? `${attackerName}获胜`
    : result === 'defenderWin' ? `${defenderName}获胜`
    : '双方和谈';

  turnMgr.addEvent({
    id: crypto.randomUUID(),
    date: { year: date.year, month: date.month, day: date.day },
    type: '战争结束',
    actors: [war.attackerId, war.defenderId],
    territories: war.targetTerritoryIds,
    description: `${attackerName}与${defenderName}的战争结束：${resultText}`,
    priority: EventPriority.Normal,
  });
}

// ── 领地战争结算（武力兼并 / 法理宣称） ────────────────────────────────────

function settleTerritorialWar(war: War, result: War['result']): void {
  if (result !== 'attackerWin') return; // 和谈/防方胜：无领地变动

  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const milStore = useMilitaryStore.getState();
  const territories = terrStore.territories;

  for (const targetId of war.targetTerritoryIds) {
    const terr = territories.get(targetId);
    if (!terr) continue;

    // 转移主岗
    const mainPost = terr.posts.find((p) => positionMap.get(p.templateId)?.grantsControl === true);
    if (mainPost) {
      terrStore.updatePost(mainPost.id, {
        holderId: war.attackerId,
        appointedBy: war.attackerId,
      });
      milStore.syncArmyOwnersByPost(mainPost.id, war.attackerId);
    }

    // 副岗持有人效忠关系转给攻方
    for (const post of terr.posts) {
      if (post === mainPost) continue; // 主岗已处理
      if (!post.holderId) continue;
      const holder = charStore.characters.get(post.holderId);
      if (!holder || !holder.alive) continue;
      if (holder.overlordId === war.attackerId) continue; // 已效忠攻方
      charStore.updateCharacter(post.holderId, { overlordId: war.attackerId });
    }
  }

  // 领地转手后刷新缓存
  useTerritoryStore.getState().refreshExpectedLegitimacy();
  const rulerIds = collectRulerIds(useTerritoryStore.getState().territories);
  useCharacterStore.getState().refreshIsRuler(rulerIds);
}

// ── 独立战争结算 ────────────────────────────────────────────────────────

function settleIndependenceWar(war: War, result: War['result']): void {
  const charStore = useCharacterStore.getState();

  switch (result) {
    case 'attackerWin': {
      // 攻方已在宣战时脱离效忠，无需再次操作
      // 针对皇帝的独立战争胜利 → 崩溃进度 +10
      const terrStore = useTerritoryStore.getState();
      const emperorId = findEmperorId(terrStore.territories, terrStore.centralPosts);
      if (emperorId && war.defenderId === emperorId) {
        addCollapseProgress(10);
      }
      break;
    }
    case 'defenderWin':
      // 叛乱失败：恢复效忠关系 + 好感 -30
      if (war.previousOverlordId) {
        charStore.updateCharacter(war.attackerId, { overlordId: war.previousOverlordId });
      }
      charStore.setOpinion(war.attackerId, war.defenderId, {
        reason: '叛乱失败',
        value: -30,
        decayable: true,
      });
      break;
    case 'whitePeace':
      // 和谈：独立成功（已在宣战时脱离，不恢复）
      break;
  }
}

// ── 通用辅助 ────────────────────────────────────────────────────────────

/** 清除该战争相关的所有领地占领状态 */
function clearOccupation(war: War): void {
  const terrStore = useTerritoryStore.getState();
  const territories = terrStore.territories;

  for (const terr of territories.values()) {
    if (!terr.occupiedBy) continue;
    if (terr.occupiedBy !== war.attackerId && terr.occupiedBy !== war.defenderId) continue;
    terrStore.updateTerritory(terr.id, { occupiedBy: undefined });
  }
}

/** 解散该战争下的所有行营和围城，军队移回所有者领地 */
function disbandCampaigns(warId: string): void {
  const warStore = useWarStore.getState();
  const terrStore = useTerritoryStore.getState();
  const milStore = useMilitaryStore.getState();

  // 先结束所有该战争的围城
  for (const siege of warStore.sieges.values()) {
    if (siege.warId === warId) {
      warStore.endSiege(siege.id);
    }
  }

  // 再解散所有该战争的行营，军队移回所有者领地
  for (const campaign of useWarStore.getState().campaigns.values()) {
    if (campaign.warId !== warId) continue;

    // 找所有者的一个己方领地
    let homeId: string | null = null;
    for (const t of terrStore.territories.values()) {
      if (t.tier !== 'zhou') continue;
      const mainPost = t.posts.find(p => {
        const tpl = positionMap.get(p.templateId);
        return tpl?.grantsControl === true;
      });
      if (mainPost?.holderId === campaign.ownerId) {
        homeId = t.id;
        break;
      }
    }

    // 移动军队回家
    if (homeId) {
      for (const armyId of campaign.armyIds) {
        milStore.updateArmy(armyId, { locationId: homeId });
      }
    }

    useWarStore.getState().disbandCampaign(campaign.id);
  }
}
