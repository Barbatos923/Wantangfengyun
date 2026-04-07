import { create } from 'zustand';
import type { MonthlyLedger } from './types';

interface LedgerStoreState {
  playerLedger: MonthlyLedger | null;
  updatePlayerLedger: (ledger: MonthlyLedger) => void;
  /** 月结后缓存所有角色的 ledger，供 NPC 决策读取（避免重算） */
  allLedgers: Map<string, MonthlyLedger>;
  setAllLedgers: (ledgers: Map<string, MonthlyLedger>) => void;
}

export const useLedgerStore = create<LedgerStoreState>((set) => ({
  playerLedger: null,
  updatePlayerLedger: (ledger) => set({ playerLedger: ledger }),
  allLedgers: new Map(),
  setAllLedgers: (ledgers) => set({ allLedgers: ledgers }),
}));
