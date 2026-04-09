// ===== AI 史书：Zustand Store =====
//
// 只存月度摘要 + 年度史书 + 状态机。LLM 配置走独立 IndexedDB store，
// 不在这里。任何异步任务管理（in-flight / abort）都在 chronicleService 里。

import { create } from 'zustand';
import type { MonthDraft, YearChronicle } from './types';

export const monthKey = (year: number, month: number): string => `${year}-${month}`;

interface ChronicleState {
  monthDrafts: Map<string, MonthDraft>;
  yearChronicles: Map<number, YearChronicle>;

  upsertMonthDraft: (draft: MonthDraft) => void;
  upsertYearChronicle: (yc: YearChronicle) => void;
  markYearRead: (year: number) => void;
  getUnreadCount: () => number;
  /** 重试一条月稿：状态置 pending，service 的 reconcile 会重新入队 */
  retryMonthDraft: (year: number, month: number) => void;
  retryYearChronicle: (year: number) => void;
  clearAll: () => void;

  /** 给 deserialize / 测试用，整体替换两张 Map。 */
  hydrate: (snapshot: {
    monthDrafts: Array<[string, MonthDraft]>;
    yearChronicles: Array<[number, YearChronicle]>;
  }) => void;
}

export const useChronicleStore = create<ChronicleState>((set, get) => ({
  monthDrafts: new Map(),
  yearChronicles: new Map(),

  upsertMonthDraft: (draft) => {
    set((s) => {
      const next = new Map(s.monthDrafts);
      next.set(monthKey(draft.year, draft.month), draft);
      return { monthDrafts: next };
    });
  },

  upsertYearChronicle: (yc) => {
    set((s) => {
      const next = new Map(s.yearChronicles);
      next.set(yc.year, yc);
      return { yearChronicles: next };
    });
  },

  markYearRead: (year) => {
    set((s) => {
      const cur = s.yearChronicles.get(year);
      if (!cur || cur.read) return s;
      const next = new Map(s.yearChronicles);
      next.set(year, { ...cur, read: true });
      return { yearChronicles: next };
    });
  },

  getUnreadCount: () => {
    let n = 0;
    for (const yc of get().yearChronicles.values()) {
      if (yc.status === 'done' && !yc.read) n++;
    }
    return n;
  },

  retryMonthDraft: (year, month) => {
    const key = monthKey(year, month);
    const cur = get().monthDrafts.get(key);
    if (!cur) return;
    set((s) => {
      const next = new Map(s.monthDrafts);
      next.set(key, { ...cur, status: 'pending', failureReason: undefined });
      return { monthDrafts: next };
    });
  },

  retryYearChronicle: (year) => {
    const cur = get().yearChronicles.get(year);
    if (!cur) return;
    set((s) => {
      const next = new Map(s.yearChronicles);
      next.set(year, { ...cur, status: 'pending', failureReason: undefined });
      return { yearChronicles: next };
    });
  },

  clearAll: () => {
    set({ monthDrafts: new Map(), yearChronicles: new Map() });
  },

  hydrate: (snapshot) => {
    set({
      monthDrafts: new Map(snapshot.monthDrafts),
      yearChronicles: new Map(snapshot.yearChronicles),
    });
  },
}));
