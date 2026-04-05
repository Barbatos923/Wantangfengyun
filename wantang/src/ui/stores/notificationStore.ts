// ===== 通知系统状态管理 =====

import { create } from 'zustand';

interface NotificationState {
  // ── 侧边栏通知：已清除的事件 ID ──
  dismissedIds: Set<string>;
  dismissEvent: (id: string) => void;
  dismissAll: (ids: string[]) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  dismissedIds: new Set(),
  dismissEvent: (id) => set((s) => {
    const next = new Set(s.dismissedIds);
    next.add(id);
    return { dismissedIds: next };
  }),
  dismissAll: (ids) => set((s) => {
    const next = new Set(s.dismissedIds);
    for (const id of ids) next.add(id);
    return { dismissedIds: next };
  }),
}));
