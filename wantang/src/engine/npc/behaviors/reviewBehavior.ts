// ===== NPC 考课行为 — 评分 + 罢免 =====

import type { GameDate } from '@engine/types';
import type { NpcBehavior, NpcContext, PlayerTask } from '../types';
import type { Character } from '@engine/character/types';
import type { ReviewEntry, ReviewPlan } from '@engine/systems/reviewSystem';
import { calculateReviewScore, getReviewGrade, monthsBetween } from '@engine/systems/reviewSystem';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useNpcStore } from '../NpcStore';
import { executeDismiss } from '@engine/interaction';
import { positionMap } from '@data/positions';
import {
  resolveAppointAuthority,
  resolveLegalAppointer,
} from '@engine/official/selectionUtils';
import { findEmperorId } from '@engine/official/postQueries';
import { addDays } from '@engine/dateUtils';
import { registerBehavior } from './index';

// ── 内部实现：执行考课（保留原有逻辑） ─────────────────

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

  // 收集治所州 ID → 治所主岗由道级联动管理，考课跳过
  const capitalZhouIds = new Set<string>();
  for (const t of territories.values()) {
    if (t.tier === 'dao' && t.capitalZhouId) capitalZhouIds.add(t.capitalZhouId);
  }

  const allEntries: ReviewEntry[] = [];

  function reviewPost(post: import('@engine/territory/types').Post, terr: import('@engine/territory/types').Territory | undefined): void {
    if (post.successionLaw !== 'bureaucratic') return;
    if (!post.holderId || !post.reviewBaseline) return;
    // 新任豁免：任职不满 6 个月不参加考课（参考明清新任规定）
    if (monthsBetween(post.reviewBaseline.date, date) < 6) return;
    // 治所州 grantsControl 主岗跳过（由道级联动管理，铨选不独立填补）
    if (terr && capitalZhouIds.has(terr.id)) {
      const tpl2 = positionMap.get(post.templateId);
      if (tpl2?.grantsControl) return;
    }
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

  // NPC 自动罢免（grantsControl 岗位用 vacateOnly，避免罢免者自动接管导致直辖膨胀）
  for (const entry of autoEntries) {
    const post = useTerritoryStore.getState().findPost(entry.postId);
    const tpl = post ? positionMap.get(post.templateId) : null;
    executeDismiss(entry.postId, entry.legalAppointerId, tpl?.grantsControl ? { vacateOnly: true } : undefined);
  }

  // 玩家审批 → 创建统一 PlayerTask
  if (playerEntries.length > 0) {
    const plan: ReviewPlan = { entries: playerEntries, date: { ...date } };
    useNpcStore.getState().addPlayerTask({
      id: crypto.randomUUID(),
      type: 'review',
      actorId: '',
      data: plan,
      deadline: addDays(date, 30),
    });
  }
}

// ── NpcBehavior 接口适配 ────────────────────────────────

interface ReviewData {
  year: number;
}

export const reviewBehaviorDef: NpcBehavior<ReviewData> = {
  id: 'review',
  requiredTemplateIds: ['pos-emperor'], // 考课是朝廷级行为，只由皇帝触发
  playerMode: 'push-task',

  generateTask(actor: Character, ctx: NpcContext) {
    // CD 判定：三年一考，每三年正月初一触发（day===1 防止日结 forced pass 重复触发）
    if (ctx.date.day !== 1 || ctx.date.month !== 1 || ctx.date.year % 3 !== 0) return null;

    // 只由皇帝触发（考课是朝廷级行为）
    const emperorId = findEmperorId(ctx.territories, ctx.centralPosts);
    if (actor.id !== emperorId) return null;

    return {
      data: { year: ctx.date.year },
      weight: 100,
      forced: true, // 强制执行，不受 maxActions 限制
    };
  },

  executeAsNpc(_actor: Character, _data: ReviewData, ctx: NpcContext) {
    runReview(ctx.date);
  },

  generatePlayerTask(_actor: Character, _data: ReviewData, ctx: NpcContext): PlayerTask | null {
    // runReview 内部会创建 'review' PlayerTask（如有玩家管辖的罢免条目）
    runReview(ctx.date);
    return null;
  },
};

registerBehavior(reviewBehaviorDef);
