// ===== NPC Engine Store =====

import { create } from 'zustand';
import type { TransferPlan } from './types';
import type { ReviewPlan } from '@engine/systems/reviewSystem';

interface NpcStoreState {
  pendingPlan: TransferPlan | null;
  pendingReviewPlan: ReviewPlan | null;

  setPendingPlan: (plan: TransferPlan | null) => void;
  setPendingReviewPlan: (plan: ReviewPlan | null) => void;
}

export const useNpcStore = create<NpcStoreState>((set) => ({
  pendingPlan: null,
  pendingReviewPlan: null,
  setPendingPlan: (plan) => set({ pendingPlan: plan }),
  setPendingReviewPlan: (plan) => set({ pendingReviewPlan: plan }),
}));
