// ===== NPC Engine Store =====

import { create } from 'zustand';
import type { TransferPlan, PlayerTask } from './types';
import type { GameDate } from '@engine/types';
import { isDateReached } from '@engine/dateUtils';

interface NpcStoreState {
  // ── 引擎内部缓冲区（不暴露给 UI） ──
  /** 月 N NPC 拟定的调动草案（月 N+1 初呈报皇帝） */
  draftPlan: TransferPlan | null;
  setDraftPlan: (plan: TransferPlan | null) => void;

  // ── 统一玩家任务队列 ──
  playerTasks: PlayerTask[];
  addPlayerTask: (task: PlayerTask) => void;
  removePlayerTask: (taskId: string) => void;
  /** 获取已超时的任务（deadline <= date） */
  getExpiredTasks: (date: GameDate) => PlayerTask[];
}

export const useNpcStore = create<NpcStoreState>((set, get) => ({
  // 引擎内部缓冲区
  draftPlan: null,
  setDraftPlan: (plan) => set({ draftPlan: plan }),

  // 统一任务队列
  playerTasks: [],
  addPlayerTask: (task) => set((s) => ({ playerTasks: [...s.playerTasks, task] })),
  removePlayerTask: (taskId) => set((s) => ({
    playerTasks: s.playerTasks.filter((t) => t.id !== taskId),
  })),
  getExpiredTasks: (date) => {
    return get().playerTasks.filter((t) => isDateReached(date, t.deadline));
  },
}));
