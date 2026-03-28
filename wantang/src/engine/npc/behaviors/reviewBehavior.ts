// ===== NPC 考课行为 — 评分 + 罢免 =====

import type { GameDate } from '@engine/types';
import type { ReviewEntry, ReviewPlan } from '@engine/systems/reviewSystem';
import { calculateReviewScore, getReviewGrade } from '@engine/systems/reviewSystem';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useNpcStore } from '../NpcStore';
import { executeDismiss } from '@engine/interaction';
import { positionMap } from '@data/positions';
import {
  resolveAppointAuthority,
  resolveLegalAppointer,
} from '@engine/official/selectionUtils';

/**
 * 执行考课：评分所有 bureaucratic 岗位，罢免下等，更新基线。
 * 玩家管辖范围 → 暂存待审批；NPC 管辖 → 自动执行。
 */
export function runReview(date: GameDate): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const playerId = charStore.playerId;
  const characters = charStore.characters;
  const territories = terrStore.territories;

  const allEntries: ReviewEntry[] = [];

  function reviewPost(post: import('@engine/territory/types').Post, terr: import('@engine/territory/types').Territory | undefined): void {
    if (post.successionLaw !== 'bureaucratic') return;
    if (!post.holderId || !post.reviewBaseline) return;
    const holder = characters.get(post.holderId);
    if (!holder?.alive || !holder.official) return;
    const tpl = positionMap.get(post.templateId);
    if (!tpl) return;

    const score = calculateReviewScore(holder, terr, post.reviewBaseline, tpl, date);
    const grade = getReviewGrade(score);

    // 更新基线（无论等级）
    terrStore.updatePost(post.id, {
      reviewBaseline: {
        population: terr?.basePopulation ?? 0,
        virtue: holder.official.virtue,
        date: { ...date },
      },
      reviewBonus: grade === 'upper' ? 20 : 0,
    });

    if (grade === 'lower') {
      const authority = resolveAppointAuthority(post);
      if (!authority) return;
      const legalId = resolveLegalAppointer(authority, post);

      allEntries.push({
        postId: post.id,
        holderId: post.holderId,
        score,
        grade,
        legalAppointerId: legalId,
        proposedBy: authority,
      });
    }
  }

  // 遍历所有领地岗位
  for (const terr of territories.values()) {
    for (const post of terr.posts) {
      reviewPost(post, terr);
    }
  }

  // 中央岗位
  for (const post of terrStore.centralPosts) {
    reviewPost(post, undefined);
  }

  if (allEntries.length === 0) return;

  // 分为玩家需审批 vs NPC 自动执行
  const playerEntries: ReviewEntry[] = [];
  const autoEntries: ReviewEntry[] = [];

  for (const entry of allEntries) {
    if (entry.legalAppointerId === playerId) {
      playerEntries.push(entry);
    } else {
      autoEntries.push(entry);
    }
  }

  // NPC 自动罢免
  for (const entry of autoEntries) {
    executeDismiss(entry.postId, entry.legalAppointerId);
  }

  // 玩家审批
  if (playerEntries.length > 0) {
    const plan: ReviewPlan = { entries: playerEntries, date: { ...date } };
    useNpcStore.getState().setPendingReviewPlan(plan);
  }
}
