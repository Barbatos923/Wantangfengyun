// ===== NPC Engine 框架入口（两步铨选流程） =====

import type { GameDate } from '@engine/types';
import type { TransferPlan } from './types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { positionMap } from '@data/positions';
import { findEmperorId } from '@engine/official/postQueries';
import { useNpcStore } from './NpcStore';
import { planAppointments } from './behaviors/appointBehavior';
import { executeAppoint } from '@engine/interaction';
import { resolveAppointAuthority, HONORARY_TEMPLATES } from '@engine/official/selectionCalc';

/** 中央岗位模板 ID → 需要自动行动的角色 */
const NPC_ACTOR_TEMPLATES = ['pos-zaixiang', 'pos-guanlibu-shangshu'] as const;

// ── 角色判断工具 ────────────────────────────────────────────────────────────────

function getEmperorId(): string | null {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return findEmperorId(territories, centralPosts);
}

function isPlayerEmperor(playerId: string | null): boolean {
  return !!playerId && getEmperorId() === playerId;
}

/** 获取玩家作为铨选经办人能管辖的空缺岗位 ID 列表 */
function getPlayerDraftablePostIds(playerId: string): string[] {
  const { territories, centralPosts } = useTerritoryStore.getState();
  const result: string[] = [];

  // 收集所有空缺岗位
  const allVacant: import('@engine/territory/types').Post[] = [];
  for (const t of territories.values()) {
    for (const p of t.posts) {
      if (p.holderId === null && !HONORARY_TEMPLATES.has(p.templateId)) allVacant.push(p);
    }
  }
  for (const p of centralPosts) {
    if (p.holderId === null && !HONORARY_TEMPLATES.has(p.templateId)) allVacant.push(p);
  }

  // 只保留 resolveAppointAuthority 指向玩家的空缺
  for (const post of allVacant) {
    const authority = resolveAppointAuthority(post, territories, centralPosts);
    if (authority === playerId) {
      result.push(post.id);
    }
  }

  return result;
}

/**
 * 获取需要自动行动的 NPC ID 列表（排除玩家）。
 * 当前只有宰相和吏部尚书 + 辟署权持有人。
 * 若吏部或宰相缺位，AI 皇帝补位充当经办人。
 */
function getNpcActors(playerId: string | null): string[] {
  const { centralPosts, territories } = useTerritoryStore.getState();
  const ids: string[] = [];
  let hasZaixiang = false;
  let hasLibu = false;

  for (const tplId of NPC_ACTOR_TEMPLATES) {
    const post = centralPosts.find(p => p.templateId === tplId);
    if (post?.holderId && post.holderId !== playerId) {
      ids.push(post.holderId);
      if (tplId === 'pos-zaixiang') hasZaixiang = true;
      if (tplId === 'pos-guanlibu-shangshu') hasLibu = true;
    }
  }

  // 吏部或宰相缺位 → AI 皇帝补位
  if (!hasZaixiang || !hasLibu) {
    const emperorId = getEmperorId();
    if (emperorId && emperorId !== playerId && !ids.includes(emperorId)) {
      ids.push(emperorId);
    }
  }

  // 辟署权持有人
  for (const terr of territories.values()) {
    for (const post of terr.posts) {
      if (!post.hasAppointRight || !post.holderId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      if (post.holderId === playerId || ids.includes(post.holderId)) continue;
      ids.push(post.holderId);
    }
  }

  return ids;
}

// ── 执行 ────────────────────────────────────────────────────────────────────────

/** 批量执行调动方案 */
export function executeTransferPlan(plan: TransferPlan): void {
  for (const entry of plan.entries) {
    executeAppoint(entry.postId, entry.appointeeId, entry.legalAppointerId, entry.vacateOldPost);
  }
  useNpcStore.getState().setPendingPlan(null);
}

// ── 月结入口 ────────────────────────────────────────────────────────────────────

/**
 * NPC Engine 每月入口（两步流程）。
 *
 * 步骤 1：提交上月草稿 → 皇帝审批或自动执行
 * 步骤 2：检查空缺 → 拟定新草稿
 */
export function runNpcEngine(date: GameDate): void {
  const playerId = useCharacterStore.getState().playerId;
  const npcStore = useNpcStore.getState();

  // ── 步骤 1：提交上月草稿 ──
  if (npcStore.draftPlan && npcStore.draftPlan.entries.length > 0) {
    if (isPlayerEmperor(playerId)) {
      // 玩家是皇帝 → 转为 pendingPlan 等待审批
      npcStore.setPendingPlan(npcStore.draftPlan);
    } else {
      // NPC 皇帝自动批准 → 立即执行
      for (const entry of npcStore.draftPlan.entries) {
        executeAppoint(entry.postId, entry.appointeeId, entry.legalAppointerId, entry.vacateOldPost);
      }
    }
    npcStore.setDraftPlan(null);
  }

  // ── 步骤 2：拟定新草稿（如果有 pendingPlan 等待审批则跳过，避免重复拟定） ──
  if (useNpcStore.getState().pendingPlan) return;

  const npcActors = getNpcActors(playerId);
  const sharedUsedIds = new Set<string>();
  const npcEntries = npcActors.flatMap(npcId => planAppointments(npcId, sharedUsedIds));

  // 检查玩家是否是某个经办人（吏部/宰相/辟署权），且不是皇帝
  let playerDraftPostIds: string[] = [];
  if (playerId && !isPlayerEmperor(playerId)) {
    playerDraftPostIds = getPlayerDraftablePostIds(playerId);
  }

  // NPC 部分存入 draftPlan
  if (npcEntries.length > 0) {
    npcStore.setDraftPlan({
      entries: npcEntries,
      date: { ...date },
    });
  }

  // 玩家需要拟定的部分 → 存入 playerDraftPostIds，等 UI 弹窗
  if (playerDraftPostIds.length > 0) {
    npcStore.setPlayerDraftPostIds(playerDraftPostIds);
  } else {
    npcStore.setPlayerDraftPostIds([]);
  }
}
