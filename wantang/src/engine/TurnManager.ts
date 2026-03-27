import { create } from 'zustand';
import type { GameDate, GameEvent } from './types';
import { GameSpeed, Era, EventPriority } from './types';
import { initRng } from './random.ts';
import { archiveEvents, loadArchivedEvents as loadArchivedEventsFromDB } from '@data/storage.ts';

// ===== 月度回调 =====

type MonthlyCallback = (date: GameDate) => void;

// ===== Store 类型 =====

interface TurnManagerState {
  currentDate: GameDate;
  speed: GameSpeed;
  era: Era;
  events: GameEvent[];
  isPaused: boolean;
  seed: string;

  advanceMonth: () => void;
  setSpeed: (speed: GameSpeed) => void;
  togglePause: () => void;
  addEvent: (event: GameEvent) => void;
  getEventsForYear: (year: number) => GameEvent[];
  archiveOldEvents: () => Promise<void>;
  loadArchivedEvents: (year: number) => Promise<GameEvent[]>;
  registerMonthlyCallback: (id: string, callback: MonthlyCallback) => void;
  unregisterMonthlyCallback: (id: string) => void;
}

// 回调注册表放在 store 外部，避免序列化问题
const monthlyCallbacks = new Map<string, MonthlyCallback>();

/** 内存中事件数量超过此阈值时触发归档 */
const EVENT_MEMORY_THRESHOLD = 500;
/** 归档时保留最近多少个月的事件在内存中 */
const ARCHIVE_AGE_MONTHS = 12;

/** 核心回合管理 Store */
export const useTurnManager = create<TurnManagerState>((set, get) => ({
  currentDate: { year: 870, month: 1 },
  speed: GameSpeed.Normal,
  era: Era.WeiShi,
  events: [],
  isPaused: false,
  seed: (() => { const s = Date.now().toString(); initRng(s); return s; })(),

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

    // 异步归档旧事件（fire-and-forget）
    if (get().events.length > EVENT_MEMORY_THRESHOLD) {
      get().archiveOldEvents();
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
      ? { year: currentDate.year, month: currentDate.month - ARCHIVE_AGE_MONTHS }
      : { year: currentDate.year - 1, month: currentDate.month - ARCHIVE_AGE_MONTHS + 12 };

    const toArchive = events.filter((e) =>
      e.date.year < cutoff.year ||
      (e.date.year === cutoff.year && e.date.month <= cutoff.month),
    );
    const toKeep = events.filter((e) =>
      e.date.year > cutoff.year ||
      (e.date.year === cutoff.year && e.date.month > cutoff.month),
    );

    if (toArchive.length > 0) {
      await archiveEvents(toArchive);
      set({ events: toKeep });
    }
  },

  loadArchivedEvents: (year: number) => {
    return loadArchivedEventsFromDB(year);
  },

  registerMonthlyCallback: (id: string, callback: MonthlyCallback) => {
    monthlyCallbacks.set(id, callback);
  },

  unregisterMonthlyCallback: (id: string) => {
    monthlyCallbacks.delete(id);
  },
}));
