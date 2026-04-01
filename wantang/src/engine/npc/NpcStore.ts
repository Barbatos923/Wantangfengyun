// ===== NPC Engine Store =====

import { create } from 'zustand';
import type { TransferPlan } from './types';
import type { ReviewPlan } from '@engine/systems/reviewSystem';

interface NpcStoreState {
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
}

export const useNpcStore = create<NpcStoreState>((set) => ({
  draftPlan: null,
  pendingPlan: null,
  playerDraftPostIds: [],
  pendingReviewPlan: null,
  setDraftPlan: (plan) => set({ draftPlan: plan }),
  setPendingPlan: (plan) => set({ pendingPlan: plan }),
  setPlayerDraftPostIds: (ids) => set({ playerDraftPostIds: ids }),
  setPendingReviewPlan: (plan) => set({ pendingReviewPlan: plan }),
}));
