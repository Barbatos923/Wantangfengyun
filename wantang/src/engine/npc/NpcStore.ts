// ===== NPC Engine Store =====

import { create } from 'zustand';
import type { TransferPlan, PlayerTask } from './types';
import type { DeploymentEntry, DeploySubmission } from '@engine/military/deployCalc';
import type { TreasuryEntry, TreasurySubmission } from '@engine/official/treasuryDraftCalc';
import type { GameDate } from '@engine/types';
import { isDateReached } from '@engine/dateUtils';
import { ALLIANCE_PROPOSAL_REJECT_CD_DAYS } from '@engine/military/types';

interface NpcStoreState {
  // ── 引擎内部缓冲区（不暴露给 UI） ──
  /** 月 N NPC 拟定的调动草案（月 N+1 初呈报皇帝） */
  draftPlan: TransferPlan | null;
  setDraftPlan: (plan: TransferPlan | null) => void;

  /** 调兵部署草案缓冲区：rulerId → 提交列表（每个 submission 携带 drafterId） */
  deployDrafts: Map<string, DeploySubmission[]>;
  addDeployDraft: (rulerId: string, drafterId: string, entries: DeploymentEntry[]) => void;
  getDeployDraft: (rulerId: string) => DeploySubmission[] | undefined;
  clearDeployDraft: (rulerId: string) => void;

  /** 调兵草案驳回冷却（drafter 维度）：drafterId → 冷却截止日 */
  deployDrafterCooldowns: Map<string, GameDate>;
  setDeployDrafterCooldown: (drafterId: string, until: GameDate) => void;
  isDeployDrafterCooldown: (drafterId: string, now: GameDate) => boolean;

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

  // ── 同盟提议拒绝冷却 ──
  // key 格式: `${proposerId}|${targetId}`，value = 冷却截止时的绝对天
  allianceRejectCooldowns: Map<string, number>;
  setAllianceRejectCooldown: (proposerId: string, targetId: string, currentDay: number) => void;
  isAllianceProposalCooldown: (proposerId: string, targetId: string, currentDay: number) => boolean;
}

export const useNpcStore = create<NpcStoreState>((set, get) => ({
  // 引擎内部缓冲区
  draftPlan: null,
  setDraftPlan: (plan) => set({ draftPlan: plan }),

  // 调兵部署草案
  deployDrafts: new Map(),
  addDeployDraft: (rulerId, drafterId, entries) => set((s) => {
    const drafts = new Map(s.deployDrafts);
    const existing = drafts.get(rulerId) ?? [];
    drafts.set(rulerId, [...existing, { drafterId, entries }]);
    return { deployDrafts: drafts };
  }),
  getDeployDraft: (rulerId) => get().deployDrafts.get(rulerId),
  clearDeployDraft: (rulerId) => set((s) => {
    const drafts = new Map(s.deployDrafts);
    drafts.delete(rulerId);
    return { deployDrafts: drafts };
  }),

  // 草拟人维度的驳回冷却
  deployDrafterCooldowns: new Map(),
  setDeployDrafterCooldown: (drafterId, until) => set((s) => {
    const cds = new Map(s.deployDrafterCooldowns);
    cds.set(drafterId, until);
    return { deployDrafterCooldowns: cds };
  }),
  isDeployDrafterCooldown: (drafterId, now) => {
    const until = get().deployDrafterCooldowns.get(drafterId);
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

  // 同盟提议拒绝冷却
  allianceRejectCooldowns: new Map(),
  setAllianceRejectCooldown: (proposerId, targetId, currentDay) => set((s) => {
    const cds = new Map(s.allianceRejectCooldowns);
    cds.set(`${proposerId}|${targetId}`, currentDay + ALLIANCE_PROPOSAL_REJECT_CD_DAYS);
    return { allianceRejectCooldowns: cds };
  }),
  isAllianceProposalCooldown: (proposerId, targetId, currentDay) => {
    const until = get().allianceRejectCooldowns.get(`${proposerId}|${targetId}`);
    if (until == null) return false;
    return until > currentDay;
  },
}));
