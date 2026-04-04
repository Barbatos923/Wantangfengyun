// ===== 通知系统状态管理 =====

import { create } from 'zustand';

/** 中心弹出框事件：效果预览条目 */
export interface StoryEventEffect {
  label: string;
  value: number;
  type: 'positive' | 'negative' | 'neutral';
}

/** 中心弹出框事件：决策选项 */
export interface StoryEventOption {
  label: string;
  description: string;
  effects: StoryEventEffect[];
  successChance?: number;     // 0-100
  onSelect: () => void;
}

/** 中心弹出框事件 */
export interface StoryEvent {
  id: string;
  title: string;
  description: string;
  actors: Array<{
    characterId: string;
    role: string;
  }>;
  options: StoryEventOption[];
}

interface NotificationState {
  // ── 侧边栏通知：已清除的事件 ID ──
  dismissedIds: Set<string>;
  dismissEvent: (id: string) => void;
  dismissAll: (ids: string[]) => void;

  // ── 中心弹出框：事件队列 ──
  storyEventQueue: StoryEvent[];
  pushStoryEvent: (event: StoryEvent) => void;
  popStoryEvent: () => void;
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

  storyEventQueue: [],
  pushStoryEvent: (event) => set((s) => ({
    storyEventQueue: [...s.storyEventQueue, event],
  })),
  popStoryEvent: () => set((s) => ({
    storyEventQueue: s.storyEventQueue.slice(1),
  })),
}));
