// ===== 存档状态 store =====
// 用于驱动右下角 SaveErrorToast 显示存档失败信息。

import { create } from 'zustand';

interface SaveStatusState {
  lastError: string | null;
  setError: (msg: string) => void;
  clear: () => void;
}

export const useSaveStatusStore = create<SaveStatusState>((set) => ({
  lastError: null,
  setError: (msg) => set({ lastError: msg }),
  clear: () => set({ lastError: null }),
}));
