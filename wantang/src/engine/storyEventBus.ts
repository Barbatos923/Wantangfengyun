// ===== StoryEvent 事件总线（engine 层） =====
// NPC 行为产生的玩家决策/通知事件队列，UI 层订阅渲染。

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

interface StoryEventBusState {
  storyEventQueue: StoryEvent[];
  pushStoryEvent: (event: StoryEvent) => void;
  popStoryEvent: () => void;
}

export const useStoryEventBus = create<StoryEventBusState>((set) => ({
  storyEventQueue: [],
  pushStoryEvent: (event) => set((s) => ({
    storyEventQueue: [...s.storyEventQueue, event],
  })),
  popStoryEvent: () => set((s) => ({
    storyEventQueue: s.storyEventQueue.slice(1),
  })),
}));
