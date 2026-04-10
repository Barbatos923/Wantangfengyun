// ===== 战争结算（结束战争时调用） =====

import { useWarStore } from './WarStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority } from '@engine/types';
import { positionMap } from '@data/positions';
import type { War } from './types';
import { TRUCE_DURATION_DAYS } from './types';
import { debugLog } from '@engine/debugLog';
import { isWarParticipant } from './warParticipantUtils';
import { getWarPrestigeReward } from './warCalc';
import { toAbsoluteDay, diffMonths } from '@engine/dateUtils';
import { findEmperorId } from '@engine/official/postQueries';
import { addCollapseProgress } from '@engine/systems/eraSystem';
import {
  seatPost,
  syncArmyForPost,
  cascadeSecondaryOverlord,
  checkCapitalZhouLost,
  refreshPostCaches,
  promoteOverlordIfNeeded,
  ensureAppointRight,
  revokeAppointRight,
} from '@engine/official/postTransfer';

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

  // ── 名望奖惩 ──────────────────────────────────────────────────────────
  if (result !== 'whitePeace') {
    const era = useTurnManager.getState().era;
    const { winnerGain, loserLoss } = getWarPrestigeReward(war.casusBelli, era);
    const charStore = useCharacterStore.getState();
    const winnerId = result === 'attackerWin' ? war.attackerId : war.defenderId;
    const loserId = result === 'attackerWin' ? war.defenderId : war.attackerId;
    charStore.addResources(winnerId, { prestige: winnerGain });
    charStore.addResources(loserId, { prestige: loserLoss });
  }

  // ── 战争结束事件通知 ────────────────────────────────────────────────────
  emitWarEndEvent(war, result);

  // ── 停战协议（双方领袖间） ──────────────────────────────────────────
  const date = useTurnManager.getState().currentDate;
  const expiryDay = toAbsoluteDay(date) + TRUCE_DURATION_DAYS;
  warStore.addTruce(war.attackerId, war.defenderId, expiryDay);

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
  const durationMonths = Math.max(1, diffMonths(war.startDate, date));
  const CB_LABELS: Record<string, string> = { annexation: '武力兼并', deJureClaim: '法理宣称', independence: '独立' };
  const cbLabel = CB_LABELS[war.casusBelli] ?? war.casusBelli;
  debugLog('war', `[战争] 结束：${attackerName} vs ${defenderName}（${cbLabel}）→ ${result}`);

  // 目标领地名称（用于兼并/法理描述）
  const terrStore = useTerritoryStore.getState();
  const targetNames = war.targetTerritoryIds
    .map((id) => terrStore.territories.get(id)?.name)
    .filter(Boolean);
  const targetStr = targetNames.length <= 3
    ? targetNames.join('、')
    : `${targetNames.slice(0, 3).join('、')}等${targetNames.length}州`;

  // 按 CB + 结果差异化描述
  let desc: string;
  if (result === 'whitePeace') {
    desc = `${attackerName}与${defenderName}交战${durationMonths}月，双方和谈`;
  } else if (result === 'attackerWin') {
    if (war.casusBelli === 'independence') {
      desc = `${attackerName}与${defenderName}交战${durationMonths}月，${attackerName}获胜，自立门户`;
    } else if (war.casusBelli === 'annexation') {
      desc = `${attackerName}与${defenderName}交战${durationMonths}月，${attackerName}获胜，兼并${targetStr}`;
    } else {
      desc = `${attackerName}与${defenderName}交战${durationMonths}月，${attackerName}获胜，收复${targetStr}`;
    }
  } else {
    // defenderWin
    desc = `${attackerName}与${defenderName}交战${durationMonths}月，${defenderName}获胜，${attackerName}图谋未遂`;
  }

  turnMgr.addEvent({
    id: crypto.randomUUID(),
    date: { year: date.year, month: date.month, day: date.day },
    type: '战争结束',
    actors: [war.attackerId, ...war.attackerParticipants, war.defenderId, ...war.defenderParticipants],
    territories: war.targetTerritoryIds,
    description: desc,
    priority: EventPriority.Normal,
    payload: { casusBelli: war.casusBelli, cbLabel, durationMonths, result },
  });
}

// ── 领地战争结算（武力兼并 / 法理宣称） ────────────────────────────────────

function settleTerritorialWar(war: War, result: War['result']): void {
  if (result !== 'attackerWin') return; // 和谈/防方胜：无领地变动

  const terrStore = useTerritoryStore.getState();
  const date = useTurnManager.getState().currentDate;

  for (const targetId of war.targetTerritoryIds) {
    const terr = terrStore.territories.get(targetId);
    if (!terr) continue;

    // 转移主岗
    const mainPost = terr.posts.find((p) => positionMap.get(p.templateId)?.grantsControl === true);
    if (mainPost) {
      seatPost(mainPost.id, war.attackerId, war.attackerId, date);
      syncArmyForPost(mainPost.id, war.attackerId);
    }

    // 副岗持有人效忠关系强制转给攻方（无 prevHolderId 约束）
    cascadeSecondaryOverlord(targetId, war.attackerId);
  }

  // 治所州被占 → 销毁父道主岗
  checkCapitalZhouLost(war.targetTerritoryIds);

  // 效忠链提升（攻方可能通过战争获得更高层级领地）
  const TIER_RANK: Record<string, number> = { zhou: 1, dao: 2, guo: 3, tianxia: 4 };
  let maxTierRank = 0;
  for (const tId of war.targetTerritoryIds) {
    const t = terrStore.territories.get(tId);
    if (t) maxTierRank = Math.max(maxTierRank, TIER_RANK[t.tier] ?? 0);
  }
  if (maxTierRank > 0) {
    promoteOverlordIfNeeded(war.attackerId, maxTierRank);
  }

  // 领地转手后刷新缓存（全量刷新正统性）
  refreshPostCaches(undefined, true);
}

// ── 独立战争失败：宗法改流官 ────────────────────────────────────────────

/** 将角色所有 grantsControl 主岗的宗法改为流官（独立失败惩罚） */
function revertClanToBureaucratic(charId: string): void {
  const terrStore = useTerritoryStore.getState();
  const date = useTurnManager.getState().currentDate;
  const posts = terrStore.getPostsByHolder(charId);
  for (const p of posts) {
    if (p.successionLaw !== 'clan') continue;
    const tpl = positionMap.get(p.templateId);
    if (!tpl?.grantsControl) continue;
    terrStore.updatePost(p.id, {
      successionLaw: 'bureaucratic',
      // 清空旧的宗法留后，避免后续切回 clan 时旧 heir 复活（与 centralizationAction 行为对齐）
      designatedHeirId: null,
      reviewBaseline: {
        population: terrStore.territories.get(p.territoryId ?? '')?.basePopulation ?? 0,
        virtue: useCharacterStore.getState().getCharacter(charId)?.official?.virtue ?? 0,
        date: { year: date.year, month: date.month, day: date.day },
      },
    });
  }
}

// ── 独立战争结算 ────────────────────────────────────────────────────────

function settleIndependenceWar(war: War, result: War['result']): void {
  const charStore = useCharacterStore.getState();

  switch (result) {
    case 'attackerWin': {
      // 攻方已在宣战时脱离效忠，独立成功 → 授予辟署权
      ensureAppointRight(war.attackerId);
      // 针对皇帝的独立战争胜利 → 崩溃进度 +10
      const terrStore = useTerritoryStore.getState();
      const emperorId = findEmperorId(terrStore.territories, terrStore.centralPosts);
      if (emperorId && war.defenderId === emperorId) {
        addCollapseProgress(10);
      }
      break;
    }
    case 'defenderWin': {
      // 叛乱失败：恢复效忠关系 + 收回辟署权 + 宗法改流官 + 好感 -30
      // 收回辟署权：防止独立期间通过 adjustOwnPolicy 自行授予后残留
      // 宗法改流官：防止独立期间改成世袭后残留
      if (war.previousOverlordId) {
        charStore.updateCharacter(war.attackerId, { overlordId: war.previousOverlordId });
      }
      revokeAppointRight(war.attackerId);
      revertClanToBureaucratic(war.attackerId);
      charStore.setOpinion(war.attackerId, war.defenderId, {
        reason: '叛乱失败',
        value: -30,
        decayable: true,
      });
      break;
    }
    case 'whitePeace':
      // 和谈：独立成功（已在宣战时脱离，不恢复）→ 授予辟署权
      ensureAppointRight(war.attackerId);
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
    if (!isWarParticipant(terr.occupiedBy, war)) continue;
    terrStore.updateTerritory(terr.id, { occupiedBy: undefined });
  }
}

/** 解散该战争下的所有行营和围城，军队留在原地（由调兵系统自然遣回） */
function disbandCampaigns(warId: string): void {
  const warStore = useWarStore.getState();

  // 先结束所有该战争的围城
  for (const siege of warStore.sieges.values()) {
    if (siege.warId === warId) {
      warStore.endSiege(siege.id);
    }
  }

  // 解散所有该战争的行营，军队留在当前位置
  for (const campaign of useWarStore.getState().campaigns.values()) {
    if (campaign.warId !== warId) continue;
    useWarStore.getState().disbandCampaign(campaign.id);
  }
}
