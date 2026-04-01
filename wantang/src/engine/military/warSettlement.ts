// ===== 战争结算（结束战争时调用） =====

import { useWarStore } from './WarStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useMilitaryStore } from './MilitaryStore';
import { positionMap } from '@data/positions';
import type { War } from './types';
import { findEmperorId } from '@engine/official/postQueries';
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

  // ── 通用收尾 ──────────────────────────────────────────────────────────
  clearOccupation(war);
  warStore.endWar(warId, result);
  disbandCampaigns(warId);
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
}

// ── 独立战争结算 ────────────────────────────────────────────────────────

function settleIndependenceWar(war: War, result: War['result']): void {
  const charStore = useCharacterStore.getState();

  switch (result) {
    case 'attackerWin': {
      // 攻方（原附庸）脱离效忠，成为独立统治者
      charStore.updateCharacter(war.attackerId, { overlordId: undefined });
      // 针对皇帝的独立战争胜利 → 崩溃进度 +10
      const terrStore = useTerritoryStore.getState();
      const emperorId = findEmperorId(terrStore.territories, terrStore.centralPosts);
      if (emperorId && war.defenderId === emperorId) {
        addCollapseProgress(10);
      }
      break;
    }
    case 'defenderWin':
      // 叛乱失败，防方（原领主）对攻方好感 -30
      charStore.setOpinion(war.attackerId, war.defenderId, {
        reason: '叛乱失败',
        value: -30,
        decayable: true,
      });
      break;
    case 'whitePeace':
      // 和谈：无变化
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

/** 解散该战争下的所有行营 */
function disbandCampaigns(warId: string): void {
  const warStore = useWarStore.getState();
  for (const campaign of warStore.campaigns.values()) {
    if (campaign.warId === warId) {
      warStore.disbandCampaign(campaign.id);
    }
  }
}
