// ===== StoryEvent 事件总线（engine 层） =====
// NPC 行为产生的玩家决策/通知事件队列，UI 层订阅渲染。

import { create } from 'zustand';
import { GameSpeed } from './types';
import { useTurnManager } from './TurnManager';

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
  /** 数据驱动效果标识（存档可恢复）。读档后 onSelect 被 noop 替代，EventModal 走 effectKey 路径重建回调。 */
  effectKey?: string;
  /** effectKey 对应的参数，纯数据，可序列化。各 effectKey 有固定字段约定，见 storyEffectResolver.ts。 */
  effectData?: Record<string, unknown>;
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
  /** push 前记录的原始速度，pop 至空队列时恢复 */
  _speedBeforePause: GameSpeed | null;
  pushStoryEvent: (event: StoryEvent) => void;
  popStoryEvent: () => void;
}

export const useStoryEventBus = create<StoryEventBusState>((set, get) => ({
  storyEventQueue: [],
  _speedBeforePause: null,

  pushStoryEvent: (event) => {
    const state = get();
    // 首个弹窗入队时记录当前速度并暂停
    if (state.storyEventQueue.length === 0) {
      const currentSpeed = useTurnManager.getState().speed;
      if (currentSpeed !== GameSpeed.Paused) {
        set({ _speedBeforePause: currentSpeed });
      }
      useTurnManager.getState().setSpeed(GameSpeed.Paused);
    }
    set((s) => ({
      storyEventQueue: [...s.storyEventQueue, event],
    }));
  },

  popStoryEvent: () => {
    const state = get();
    const remaining = state.storyEventQueue.slice(1);
    // 队列清空时恢复原速度
    if (remaining.length === 0 && state._speedBeforePause !== null) {
      useTurnManager.getState().setSpeed(state._speedBeforePause);
      set({ storyEventQueue: remaining, _speedBeforePause: null });
    } else {
      set({ storyEventQueue: remaining });
    }
  },
}));
