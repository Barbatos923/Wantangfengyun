// ===== NPC Engine Store =====

import { create } from 'zustand';
import type { TransferPlan, PlayerTask } from './types';
import type { GameDate } from '@engine/types';
import type { ReviewPlan } from '@engine/systems/reviewSystem';
import { isDateReached } from '@engine/dateUtils';

interface NpcStoreState {
  // ── 旧字段（UI 兼容，TODO(phase6-cleanup): 待 AlertBar 改造后删除） ──
  /** 月 N 拟定的草稿（等待下月呈报皇帝） */
  draftPlan: TransferPlan | null;
  /** 已呈报皇帝、等待玩家审批的方案 */
  pendingPlan: TransferPlan | null;
  /** 玩家需要拟定的空缺岗位 ID 列表（玩家是吏部/宰相/辟署权时） */
  playerDraftPostIds: string[];
  pendingReviewPlan: ReviewPlan | null;

  setDraftPlan: (plan: TransferPlan | null) => void;
  setPendingPlan: (plan: TransferPlan | null) => void;
  setPlayerDraftPostIds: (ids: string[]) => void;
  setPendingReviewPlan: (plan: ReviewPlan | null) => void;

  // ── 新字段：统一任务队列 ──
  playerTasks: PlayerTask[];
  addPlayerTask: (task: PlayerTask) => void;
  removePlayerTask: (taskId: string) => void;
  /** 获取已超时的任务（deadline <= date） */
  getExpiredTasks: (date: GameDate) => PlayerTask[];
}

export const useNpcStore = create<NpcStoreState>((set, get) => ({
  // 旧字段
  draftPlan: null,
  pendingPlan: null,
  playerDraftPostIds: [],
  pendingReviewPlan: null,
  setDraftPlan: (plan) => set({ draftPlan: plan }),
  setPendingPlan: (plan) => set({ pendingPlan: plan }),
  setPlayerDraftPostIds: (ids) => set({ playerDraftPostIds: ids }),
  setPendingReviewPlan: (plan) => set({ pendingReviewPlan: plan }),

  // 新字段
  playerTasks: [],
  addPlayerTask: (task) => set((s) => ({ playerTasks: [...s.playerTasks, task] })),
  removePlayerTask: (taskId) => set((s) => ({
    playerTasks: s.playerTasks.filter((t) => t.id !== taskId),
  })),
  getExpiredTasks: (date) => {
    return get().playerTasks.filter((t) => isDateReached(date, t.deadline));
  },
}));
