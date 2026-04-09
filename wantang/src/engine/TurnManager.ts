import { create } from 'zustand';
import type { GameDate, GameEvent } from './types';
import { GameSpeed, Era, EventPriority } from './types';
import { initRng } from './random.ts';
import { archiveEvents, loadArchivedEvents as loadArchivedEventsFromDB } from '@engine/storage.ts';
import { addDays, getDaysInMonth } from './dateUtils.ts';

// ===== 回调类型 =====

type DailyCallback = (date: GameDate) => void;
type MonthlyCallback = (date: GameDate) => void;

// ===== Store 类型 =====

interface TurnManagerState {
  currentDate: GameDate;
  speed: GameSpeed;
  era: Era;
  stabilityProgress: number;
  collapseProgress: number;
  events: GameEvent[];
  isPaused: boolean;
  seed: string;
  /** 周目命名空间 ID。每次新游戏/读档刷新，用于隔离 IndexedDB 中的 events / chronicles。 */
  playthroughId: string;
  /** 玩家王朝是否已绝嗣（Game Over）。绝嗣死亡时由 characterSystem 设为 true，UI 据此展示终局屏。 */
  dynastyExtinct: boolean;

  advanceDay: () => void;
  advanceToNextMonth: () => void;
  /** @deprecated 仅供测试使用，内部循环调用 advanceDay() */
  advanceMonth: () => void;
  setSpeed: (speed: GameSpeed) => void;
  togglePause: () => void;
  addEvent: (event: GameEvent) => void;
  getEventsForYear: (year: number) => GameEvent[];
  archiveOldEvents: () => Promise<void>;
  loadArchivedEvents: (year: number) => Promise<GameEvent[]>;
  setEraState: (patch: { era?: Era; stabilityProgress?: number; collapseProgress?: number }) => void;
  registerDailyCallback: (id: string, callback: DailyCallback) => void;
  unregisterDailyCallback: (id: string) => void;
  registerMonthlyCallback: (id: string, callback: MonthlyCallback) => void;
  unregisterMonthlyCallback: (id: string) => void;
}

// 回调注册表放在 store 外部，避免序列化问题
const dailyCallbacks = new Map<string, DailyCallback>();
const monthlyCallbacks = new Map<string, MonthlyCallback>();

/** 内存中事件数量超过此阈值时触发归档 */
const EVENT_MEMORY_THRESHOLD = 500;
/** 归档时保留最近多少个月的事件在内存中 */
const ARCHIVE_AGE_MONTHS = 12;

/** 核心回合管理 Store */
export const useTurnManager = create<TurnManagerState>((set, get) => ({
  currentDate: { year: 870, month: 1, day: 2 },
  speed: GameSpeed.Normal,
  era: Era.WeiShi,
  stabilityProgress: 0,
  collapseProgress: 0,
  events: [],
  isPaused: false,
  seed: (() => { const s = Date.now().toString(); initRng(s); return s; })(),
  playthroughId: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pt-${Date.now()}-${Math.random()}`),
  dynastyExtinct: false,

  advanceDay: () => {
    const { currentDate } = get();
    const nextDate = addDays(currentDate, 1);

    set({ currentDate: nextDate });

    // 触发所有日结回调
    dailyCallbacks.forEach((callback) => {
      callback(nextDate);
    });

    // 跨月：触发月结回调
    if (nextDate.day === 1) {
      const systemEvent: GameEvent = {
        id: `system-month-${nextDate.year}-${nextDate.month}`,
        date: nextDate,
        type: '月结算',
        actors: [],
        territories: [],
        description: `${nextDate.year}年${nextDate.month}月 月结算`,
        priority: EventPriority.Minor,
      };

      set((state) => ({
        events: [...state.events, systemEvent],
      }));

      monthlyCallbacks.forEach((callback) => {
        callback(nextDate);
      });

      // 异步归档旧事件（fire-and-forget）
      if (get().events.length > EVENT_MEMORY_THRESHOLD) {
        get().archiveOldEvents();
      }
    }
  },

  advanceToNextMonth: () => {
    const startMonth = get().currentDate.month;
    const startYear = get().currentDate.year;
    // 循环推进直到月份变化
    do {
      get().advanceDay();
    } while (get().currentDate.month === startMonth && get().currentDate.year === startYear);
  },

  /** @deprecated 仅供测试使用，内部循环调用 advanceDay() */
  advanceMonth: () => {
    const { currentDate } = get();
    const daysInMonth = getDaysInMonth(currentDate.month);
    const remaining = daysInMonth - currentDate.day + 1;
    for (let i = 0; i < remaining; i++) {
      get().advanceDay();
    }
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

  archiveOldEvents: async () => {
    const { events, currentDate } = get();
    if (events.length <= EVENT_MEMORY_THRESHOLD) return;

    // 保留最近 12 个月的事件
    const cutoff = currentDate.month > ARCHIVE_AGE_MONTHS
      ? { year: currentDate.year, month: currentDate.month - ARCHIVE_AGE_MONTHS, day: 1 }
      : { year: currentDate.year - 1, month: currentDate.month - ARCHIVE_AGE_MONTHS + 12, day: 1 };

    const toArchive = events.filter((e) =>
      e.date.year < cutoff.year ||
      (e.date.year === cutoff.year && e.date.month <= cutoff.month),
    );
    const toKeep = events.filter((e) =>
      e.date.year > cutoff.year ||
      (e.date.year === cutoff.year && e.date.month > cutoff.month),
    );

    if (toArchive.length > 0) {
      await archiveEvents(get().playthroughId, toArchive);
      set({ events: toKeep });
    }
  },

  loadArchivedEvents: (year: number) => {
    return loadArchivedEventsFromDB(get().playthroughId, year);
  },

  setEraState: (patch) => {
    set((state) => ({
      ...(patch.era !== undefined ? { era: patch.era } : {}),
      stabilityProgress: patch.stabilityProgress ?? state.stabilityProgress,
      collapseProgress: patch.collapseProgress ?? state.collapseProgress,
    }));
  },

  registerDailyCallback: (id: string, callback: DailyCallback) => {
    dailyCallbacks.set(id, callback);
  },

  unregisterDailyCallback: (id: string) => {
    dailyCallbacks.delete(id);
  },

  registerMonthlyCallback: (id: string, callback: MonthlyCallback) => {
    monthlyCallbacks.set(id, callback);
  },

  unregisterMonthlyCallback: (id: string) => {
    monthlyCallbacks.delete(id);
  },
}));
