// ===== NPC Engine Store =====

import { create } from 'zustand';
import type { TransferPlan, PlayerTask } from './types';
import type { DeploymentEntry } from '@engine/military/deployCalc';
import type { GameDate } from '@engine/types';
import { isDateReached } from '@engine/dateUtils';

interface NpcStoreState {
  // ── 引擎内部缓冲区（不暴露给 UI） ──
  /** 月 N NPC 拟定的调动草案（月 N+1 初呈报皇帝） */
  draftPlan: TransferPlan | null;
  setDraftPlan: (plan: TransferPlan | null) => void;

  /** 调兵部署草案缓冲区：rulerId → 待批方案 */
  deploymentDrafts: Map<string, DeploymentEntry[]>;
  addDeploymentDraft: (rulerId: string, entries: DeploymentEntry[]) => void;
  clearDeploymentDraft: (rulerId: string) => void;

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

  // 调兵部署草案
  deploymentDrafts: new Map(),
  addDeploymentDraft: (rulerId, entries) => set((s) => {
    const drafts = new Map(s.deploymentDrafts);
    const existing = drafts.get(rulerId) ?? [];
    drafts.set(rulerId, [...existing, ...entries]);
    return { deploymentDrafts: drafts };
  }),
  clearDeploymentDraft: (rulerId) => set((s) => {
    const drafts = new Map(s.deploymentDrafts);
    drafts.delete(rulerId);
    return { deploymentDrafts: drafts };
  }),

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
