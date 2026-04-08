import { create } from 'zustand';
import type { MonthlyLedger } from './types';

/** 州国库历史滚动 buffer 长度（最近 N 月净变动） */
export const TREASURY_HISTORY_LEN = 3;

interface LedgerStoreState {
  playerLedger: MonthlyLedger | null;
  updatePlayerLedger: (ledger: MonthlyLedger) => void;
  /** 月结后缓存所有角色的 ledger，供 NPC 决策读取（避免重算） */
  allLedgers: Map<string, MonthlyLedger>;
  setAllLedgers: (ledgers: Map<string, MonthlyLedger>) => void;
  /** 州国库滚动历史：zhouId → 最近 N 月净变动（[0]=最早 [last]=最近） */
  treasuryHistory: Map<string, { money: number[]; grain: number[] }>;
  /** 月结调用：把全局聚合的本月净变动追加到每个州的历史 buffer */
  pushTreasuryHistory: (deltas: Map<string, { money: number; grain: number }>) => void;
}

export const useLedgerStore = create<LedgerStoreState>((set) => ({
  playerLedger: null,
  updatePlayerLedger: (ledger) => set({ playerLedger: ledger }),
  allLedgers: new Map(),
  setAllLedgers: (ledgers) => set({ allLedgers: ledgers }),
  treasuryHistory: new Map(),
  pushTreasuryHistory: (deltas) => set((s) => {
    const next = new Map(s.treasuryHistory);
    for (const [zhouId, delta] of deltas) {
      const cur = next.get(zhouId) ?? { money: [], grain: [] };
      const money = [...cur.money, delta.money];
      const grain = [...cur.grain, delta.grain];
      if (money.length > TREASURY_HISTORY_LEN) money.shift();
      if (grain.length > TREASURY_HISTORY_LEN) grain.shift();
      next.set(zhouId, { money, grain });
    }
    return { treasuryHistory: next };
  }),
}));
