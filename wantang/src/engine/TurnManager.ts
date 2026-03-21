import { create } from 'zustand';
import type { GameDate, GameEvent } from './types';
import { GameSpeed, Era, EventPriority } from './types';

// ===== 月度回调 =====

type MonthlyCallback = (date: GameDate) => void;

// ===== Store 类型 =====

interface TurnManagerState {
  currentDate: GameDate;
  speed: GameSpeed;
  era: Era;
  events: GameEvent[];
  isPaused: boolean;

  advanceMonth: () => void;
  setSpeed: (speed: GameSpeed) => void;
  togglePause: () => void;
  addEvent: (event: GameEvent) => void;
  getEventsForYear: (year: number) => GameEvent[];
  registerMonthlyCallback: (id: string, callback: MonthlyCallback) => void;
  unregisterMonthlyCallback: (id: string) => void;
}

// 回调注册表放在 store 外部，避免序列化问题
const monthlyCallbacks = new Map<string, MonthlyCallback>();

/** 核心回合管理 Store */
export const useTurnManager = create<TurnManagerState>((set, get) => ({
  currentDate: { year: 870, month: 1 },
  speed: GameSpeed.Normal,
  era: Era.WeiShi,
  events: [],
  isPaused: false,

  advanceMonth: () => {
    const { currentDate } = get();

    const nextMonth = currentDate.month >= 12 ? 1 : currentDate.month + 1;
    const nextYear = currentDate.month >= 12 ? currentDate.year + 1 : currentDate.year;
    const nextDate: GameDate = { year: nextYear, month: nextMonth };

    const systemEvent: GameEvent = {
      id: `system-month-${nextYear}-${nextMonth}`,
      date: nextDate,
      type: '月结算',
      actors: [],
      territories: [],
      description: `${nextYear}年${nextMonth}月 月结算`,
      priority: EventPriority.Minor,
    };

    set((state) => ({
      currentDate: nextDate,
      events: [...state.events, systemEvent],
    }));

    // 调用所有已注册的月度回调
    monthlyCallbacks.forEach((callback) => {
      callback(nextDate);
    });
  },

  setSpeed: (speed: GameSpeed) => {
    set({ speed, isPaused: speed === GameSpeed.Paused });
  },

  togglePause: () => {
    set((state) => ({
      isPaused: !state.isPaused,
      speed: state.isPaused ? GameSpeed.Normal : GameSpeed.Paused,
    }));
  },

  addEvent: (event: GameEvent) => {
    set((state) => ({
      events: [...state.events, event],
    }));
  },

  getEventsForYear: (year: number) => {
    return get().events.filter((e) => e.date.year === year);
  },

  registerMonthlyCallback: (id: string, callback: MonthlyCallback) => {
    monthlyCallbacks.set(id, callback);
  },

  unregisterMonthlyCallback: (id: string) => {
    monthlyCallbacks.delete(id);
  },
}));
