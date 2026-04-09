// ===== "罢免职位"交互 =====

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import {
  seatPost,
  vacatePost,
  syncArmyForPost,
  cascadeSecondaryOverlord,
  cascadeChildOverlord,
  capitalZhouSeat,
  refreshPostCaches,
} from '@engine/official/postTransfer';

/** 注册罢免交互 */
registerInteraction({
  id: 'dismiss',
  name: '罢免职位',
  icon: '❌',
  canShow: (player, target) => {
    // 宽松：target 是臣属且持有非 grantsControl 岗位
    if (target.overlordId !== player.id) return false;
    const terrStore = useTerritoryStore.getState();
    return terrStore.getPostsByHolder(target.id).some(p => !positionMap.get(p.templateId)?.grantsControl);
  },
  canExecuteCheck: (player, target) => {
    if (getDismissablePosts(player, target).length > 0) return null;
    return '无可罢免岗位';
  },
  paramType: 'dismiss',
});

/** 获取臣属持有的非 grantsControl 岗位（京官、地方副岗） */
export function getDismissablePosts(
  player: Character,
  target: Character,
): Post[] {
  if (target.overlordId !== player.id) return [];
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(target.id);
  return posts.filter(p => {
    const tpl = positionMap.get(p.templateId);
    // grantsControl 岗位走"剥夺领地"流程，不在此处罢免
    return !tpl?.grantsControl;
  });
}

/**
 * 执行罢免：统一流程，零特殊分支。
 *
 * 瞬时重校验：post 仍存在；非 vacateOnly 模式下，holder 仍是 dismisser 的臣属
 * （vacateOnly 用于铨选/system 路径，dismisserId 可能是 'system' 或非领主，跳过严格检查）。
 * 任一不过 → 返回 false 不写状态。
 */
export function executeDismiss(
  postId: string,
  dismisserId: string,
  opts?: { skipOpinion?: boolean; vacateOnly?: boolean },
): boolean {
  const terrStore = useTerritoryStore.getState();
  const date = useTurnManager.getState().currentDate;
  const post = terrStore.findPost(postId);
  if (!post) return false;

  const tpl = positionMap.get(post.templateId);
  const previousHolderId = post.holderId;

  // 严格校验仅对非 vacateOnly 路径（玩家/NPC 直接罢免）：
  // - holder 仍存在
  // - dismisser 仍存活
  // - holder 仍是 dismisser 的直属臣属（vacateOnly 路径绕过此检查）
  if (!opts?.vacateOnly) {
    if (!previousHolderId) return false;
    const charStore = useCharacterStore.getState();
    const dismisser = charStore.getCharacter(dismisserId);
    if (!dismisser?.alive) return false;
    const holder = charStore.getCharacter(previousHolderId);
    if (!holder?.alive) return false;
    // dismisser 必须仍是 holder 的领主（自我罢免、system 罢免不走这条路径）
    if (dismisserId !== 'system' && holder.overlordId !== dismisserId) return false;
  }

  // ── 岗位持有人变更 ──
  if (tpl?.grantsControl) {
    if (opts?.vacateOnly) {
      // 铨选调动：仅清空，不让罢免者接管（后续 executeAppoint 立刻安排新人）
      vacatePost(postId);
    } else {
      // 正常罢免：罢免者自动接管
      seatPost(postId, dismisserId, 'system', date);
      syncArmyForPost(postId, dismisserId);
    }
  } else {
    // 普通岗位：清空
    vacatePost(postId);
  }

  // ── 好感修正 ──
  if (previousHolderId && tpl && !opts?.skipOpinion) {
    const charStore = useCharacterStore.getState();
    const opinion = -Math.floor(5 + (tpl.minRank / 29) * 25);
    charStore.addOpinion(previousHolderId, dismisserId, {
      reason: `罢免${tpl.name}`,
      value: opinion,
      decayable: true,
    });
  }

  // ── 被罢免者 overlordId 更新 ──
  // 仅 grantsControl 岗位、非 vacateOnly、且被罢免者无剩余 grantsControl 岗位时
  if (previousHolderId && previousHolderId !== dismisserId && tpl?.grantsControl && !opts?.vacateOnly) {
    const terrStoreNow = useTerritoryStore.getState();
    const remainingControlPosts = terrStoreNow.getPostsByHolder(previousHolderId)
      .filter(p => p.id !== postId && positionMap.get(p.templateId)?.grantsControl);
    if (remainingControlPosts.length === 0) {
      useCharacterStore.getState().updateCharacter(previousHolderId, { overlordId: dismisserId });
    }
  }

  // ── 效忠级联（仅正常罢免 grantsControl 岗位时） ──
  if (previousHolderId && tpl?.grantsControl && post.territoryId && !opts?.vacateOnly) {
    // 法理下级主岗持有人回退给 dismisser
    cascadeChildOverlord(post.territoryId, dismisserId, previousHolderId);
    // 本领地副岗持有人回退给 dismisser
    cascadeSecondaryOverlord(post.territoryId, dismisserId, previousHolderId);
  }

  // ── 治所联动（仅正常罢免，vacateOnly 由后续 executeAppoint 处理） ──
  if (previousHolderId && tpl?.grantsControl && post.territoryId && !opts?.vacateOnly) {
    capitalZhouSeat(post.territoryId, dismisserId, 'system', date, {
      oldHolderId: previousHolderId,
    });
  }

  // ── 缓存刷新 ──
  const affectedIds = [previousHolderId, tpl?.grantsControl ? dismisserId : null].filter(Boolean) as string[];
  refreshPostCaches(affectedIds);

  return true;
}
