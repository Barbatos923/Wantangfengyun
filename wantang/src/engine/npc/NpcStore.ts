// ===== NPC Engine Store =====

import { create } from 'zustand';
import type { TransferPlan, PlayerTask } from './types';
import type { DeploymentEntry } from '@engine/military/deployCalc';
import type { TreasuryEntry, TreasurySubmission } from '@engine/official/treasuryDraftCalc';
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

  /** 调兵驳回冷却：rulerId → 冷却截止日 */
  deployRejectCooldowns: Map<string, GameDate>;
  setDeployRejectCooldown: (rulerId: string, until: GameDate) => void;
  isDeployCooldown: (rulerId: string, now: GameDate) => boolean;

  /** 国库调拨草案缓冲区：rulerId → 提交列表（每个 submission 携带 drafterId） */
  treasuryDrafts: Map<string, TreasurySubmission[]>;
  addTreasuryDraft: (rulerId: string, drafterId: string, entries: TreasuryEntry[]) => void;
  getTreasuryDraft: (rulerId: string) => TreasurySubmission[] | undefined;
  clearTreasuryDraft: (rulerId: string) => void;

  /** 国库草案驳回冷却（drafter 维度）：drafterId → 冷却截止日 */
  treasuryDrafterCooldowns: Map<string, GameDate>;
  setTreasuryDrafterCooldown: (drafterId: string, until: GameDate) => void;
  isTreasuryDrafterCooldown: (drafterId: string, now: GameDate) => boolean;

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

  // 调兵驳回冷却
  deployRejectCooldowns: new Map(),
  setDeployRejectCooldown: (rulerId, until) => set((s) => {
    const cds = new Map(s.deployRejectCooldowns);
    cds.set(rulerId, until);
    return { deployRejectCooldowns: cds };
  }),
  isDeployCooldown: (rulerId, now) => {
    const until = get().deployRejectCooldowns.get(rulerId);
    if (!until) return false;
    return !isDateReached(now, until);
  },

  // 国库调拨草案
  treasuryDrafts: new Map(),
  addTreasuryDraft: (rulerId, drafterId, entries) => set((s) => {
    const drafts = new Map(s.treasuryDrafts);
    const existing = drafts.get(rulerId) ?? [];
    drafts.set(rulerId, [...existing, { drafterId, entries }]);
    return { treasuryDrafts: drafts };
  }),
  getTreasuryDraft: (rulerId) => get().treasuryDrafts.get(rulerId),
  clearTreasuryDraft: (rulerId) => set((s) => {
    const drafts = new Map(s.treasuryDrafts);
    drafts.delete(rulerId);
    return { treasuryDrafts: drafts };
  }),

  // 草拟人维度的驳回冷却
  treasuryDrafterCooldowns: new Map(),
  setTreasuryDrafterCooldown: (drafterId, until) => set((s) => {
    const cds = new Map(s.treasuryDrafterCooldowns);
    cds.set(drafterId, until);
    return { treasuryDrafterCooldowns: cds };
  }),
  isTreasuryDrafterCooldown: (drafterId, now) => {
    const until = get().treasuryDrafterCooldowns.get(drafterId);
    if (!until) return false;
    return !isDateReached(now, until);
  },

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
