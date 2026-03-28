// ===== NPC Engine 框架入口 =====

import type { GameDate } from '@engine/types';
import type { TransferPlan } from './types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { positionMap } from '@data/positions';
import { findEmperorId } from '@engine/official/postQueries';
import { useNpcStore } from './NpcStore';
import { planAppointments } from './behaviors/appointBehavior';
import { executeAppoint } from '@engine/interaction';

/** 中央岗位模板 ID → 需要自动行动的角色 */
const NPC_ACTOR_TEMPLATES = ['pos-zaixiang', 'pos-guanlibu-shangshu'] as const;

/**
 * 获取需要自动行动的 NPC ID 列表（排除玩家）。
 * 当前只有宰相和吏部尚书。
 * 若吏部或宰相缺位，AI 皇帝补位充当经办人。
 */
function getNpcActors(playerId: string | null): string[] {
  const { centralPosts } = useTerritoryStore.getState();
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

  // 吏部或宰相缺位 → AI 皇帝补位（排除玩家皇帝和已在列表中的情况）
  if (!hasZaixiang || !hasLibu) {
    const { territories } = useTerritoryStore.getState();
    const emperorId = findEmperorId(territories, centralPosts);
    if (emperorId && emperorId !== playerId && !ids.includes(emperorId)) {
      ids.push(emperorId);
    }
  }

  // 辟署权持有人也需要自动铨选（排除玩家和已在列表中的）
  const { territories } = useTerritoryStore.getState();
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

/**
 * 检查玩家是否是皇帝。
 */
function isPlayerEmperor(playerId: string | null): boolean {
  if (!playerId) return false;
  const { territories, centralPosts } = useTerritoryStore.getState();
  return findEmperorId(territories, centralPosts) === playerId;
}

/**
 * 批量执行调动方案。
 */
export function executeTransferPlan(plan: TransferPlan): void {
  for (const entry of plan.entries) {
    executeAppoint(entry.postId, entry.appointeeId, entry.legalAppointerId, entry.vacateOldPost);
  }
  useNpcStore.getState().setPendingPlan(null);
}

/**
 * NPC Engine 每月入口。
 * 在 settlement 管线中 characterSystem 之后调用。
 */
export function runNpcEngine(_date: GameDate): void {
  const playerId = useCharacterStore.getState().playerId;

  // 1. 各经办人拟定调动方案（共享已选候选人集合，避免冲突）
  const npcActors = getNpcActors(playerId);
  const sharedUsedIds = new Set<string>();
  const allEntries = npcActors.flatMap(npcId => planAppointments(npcId, sharedUsedIds));

  if (allEntries.length === 0) return;

  const plan: TransferPlan = {
    entries: allEntries,
    date: { ..._date },
  };

  // 2. 皇帝是玩家 → 暂存等待审批；否则 → 自动执行
  if (isPlayerEmperor(playerId)) {
    useNpcStore.getState().setPendingPlan(plan);
  } else {
    executeTransferPlan(plan);
  }
}
