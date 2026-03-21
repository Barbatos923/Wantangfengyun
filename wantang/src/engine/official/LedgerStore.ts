import { create } from 'zustand';
import type { MonthlyLedger } from './types';

interface LedgerStoreState {
  playerLedger: MonthlyLedger | null;
  updatePlayerLedger: (ledger: MonthlyLedger) => void;
}

export const useLedgerStore = create<LedgerStoreState>((set) => ({
  playerLedger: null,
  updatePlayerLedger: (ledger) => set({ playerLedger: ledger }),
}));
