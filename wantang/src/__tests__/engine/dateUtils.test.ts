/**
 * 日期工具函数单元测试
 *
 * dateUtils.ts 是全系统最底层的工具，被结算管线、战争系统、行军系统广泛调用。
 * 这里对每个导出函数做完整的边界覆盖。
 *
 * 日历约定：365天/年的平年历，无闰年。月份 1-indexed（1=1月），day 1-indexed（1=1日）。
 */

import { describe, it, expect } from 'vitest';
import {
  getDaysInMonth,
  toAbsoluteDay,
  fromAbsoluteDay,
  addDays,
  diffDays,
  diffMonths,
  isFirstOfMonth,
  isFirstOfYear,
  compareDates,
  isDateReached,
  DAYS_PER_YEAR,
} from '@engine/dateUtils';

// ─────────────────────────────────────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────────────────────────────────────

describe('DAYS_PER_YEAR', () => {
  it('应为 365', () => {
    expect(DAYS_PER_YEAR).toBe(365);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDaysInMonth
// ─────────────────────────────────────────────────────────────────────────────

describe('getDaysInMonth', () => {
  it('1月有31天', () => expect(getDaysInMonth(1)).toBe(31));
  it('2月有28天（平年，无闰年）', () => expect(getDaysInMonth(2)).toBe(28));
  it('3月有31天', () => expect(getDaysInMonth(3)).toBe(31));
  it('4月有30天', () => expect(getDaysInMonth(4)).toBe(30));
  it('6月有30天', () => expect(getDaysInMonth(6)).toBe(30));
  it('7月有31天', () => expect(getDaysInMonth(7)).toBe(31));
  it('9月有30天', () => expect(getDaysInMonth(9)).toBe(30));
  it('12月有31天', () => expect(getDaysInMonth(12)).toBe(31));

  it('全年天数之和为 365', () => {
    let total = 0;
    for (let m = 1; m <= 12; m++) total += getDaysInMonth(m);
    expect(total).toBe(365);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toAbsoluteDay
// ─────────────────────────────────────────────────────────────────────────────

describe('toAbsoluteDay', () => {
  it('纪元第一天（year=1, month=1, day=1）= 0', () => {
    expect(toAbsoluteDay({ year: 1, month: 1, day: 1 })).toBe(0);
  });

  it('year=1, month=1, day=2 → 1', () => {
    expect(toAbsoluteDay({ year: 1, month: 1, day: 2 })).toBe(1);
  });

  it('year=1, month=2, day=1 → 31（1月结束后）', () => {
    expect(toAbsoluteDay({ year: 1, month: 2, day: 1 })).toBe(31);
  });

  it('year=1, month=3, day=1 → 59（1+2月 = 31+28）', () => {
    expect(toAbsoluteDay({ year: 1, month: 3, day: 1 })).toBe(59);
  });

  it('year=2, month=1, day=1 → 365', () => {
    expect(toAbsoluteDay({ year: 2, month: 1, day: 1 })).toBe(365);
  });

  it('year=867, month=1, day=1（游戏开局年份）应为合法正整数', () => {
    const abs = toAbsoluteDay({ year: 867, month: 1, day: 1 });
    expect(abs).toBeGreaterThan(0);
    expect(Number.isInteger(abs)).toBe(true);
  });

  it('year=1, month=12, day=31（年末最后一天）→ 364', () => {
    expect(toAbsoluteDay({ year: 1, month: 12, day: 31 })).toBe(364);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fromAbsoluteDay
// ─────────────────────────────────────────────────────────────────────────────

describe('fromAbsoluteDay', () => {
  it('abs=0 → year=1, month=1, day=1', () => {
    expect(fromAbsoluteDay(0)).toEqual({ year: 1, month: 1, day: 1 });
  });

  it('abs=364 → year=1, month=12, day=31', () => {
    expect(fromAbsoluteDay(364)).toEqual({ year: 1, month: 12, day: 31 });
  });

  it('abs=365 → year=2, month=1, day=1', () => {
    expect(fromAbsoluteDay(365)).toEqual({ year: 2, month: 1, day: 1 });
  });

  it('abs=31 → year=1, month=2, day=1', () => {
    expect(fromAbsoluteDay(31)).toEqual({ year: 1, month: 2, day: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toAbsoluteDay / fromAbsoluteDay 互为逆运算
// ─────────────────────────────────────────────────────────────────────────────

describe('toAbsoluteDay 与 fromAbsoluteDay 互为逆运算', () => {
  const testDates = [
    { year: 1, month: 1, day: 1 },
    { year: 867, month: 1, day: 1 },
    { year: 867, month: 6, day: 15 },
    { year: 867, month: 12, day: 31 },
    { year: 868, month: 2, day: 28 },
    { year: 900, month: 7, day: 4 },
  ];

  for (const d of testDates) {
    it(`round-trip: ${d.year}-${d.month}-${d.day}`, () => {
      expect(fromAbsoluteDay(toAbsoluteDay(d))).toEqual(d);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// addDays
// ─────────────────────────────────────────────────────────────────────────────

describe('addDays', () => {
  it('加 0 天 → 不变', () => {
    const d = { year: 867, month: 6, day: 15 };
    expect(addDays(d, 0)).toEqual(d);
  });

  it('1月31日 + 1天 → 2月1日（月份进位）', () => {
    expect(addDays({ year: 867, month: 1, day: 31 }, 1))
      .toEqual({ year: 867, month: 2, day: 1 });
  });

  it('12月31日 + 1天 → 次年1月1日（年份进位）', () => {
    expect(addDays({ year: 867, month: 12, day: 31 }, 1))
      .toEqual({ year: 868, month: 1, day: 1 });
  });

  it('加 365 天 → 下一年同一天', () => {
    const d = { year: 867, month: 3, day: 15 };
    expect(addDays(d, 365)).toEqual({ year: 868, month: 3, day: 15 });
  });

  it('2月28日 + 1天 → 3月1日（2月只有28天）', () => {
    expect(addDays({ year: 867, month: 2, day: 28 }, 1))
      .toEqual({ year: 867, month: 3, day: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// diffDays
// ─────────────────────────────────────────────────────────────────────────────

describe('diffDays', () => {
  it('同一天差值为 0', () => {
    const d = { year: 867, month: 6, day: 1 };
    expect(diffDays(d, d)).toBe(0);
  });

  it('相差 9 天', () => {
    expect(diffDays(
      { year: 867, month: 1, day: 1 },
      { year: 867, month: 1, day: 10 },
    )).toBe(9);
  });

  it('12月31日 → 次年1月1日 = 1天', () => {
    expect(diffDays(
      { year: 867, month: 12, day: 31 },
      { year: 868, month: 1, day: 1 },
    )).toBe(1);
  });

  it('整一年 = 365 天', () => {
    expect(diffDays(
      { year: 867, month: 1, day: 1 },
      { year: 868, month: 1, day: 1 },
    )).toBe(365);
  });

  it('b < a 时返回负数', () => {
    expect(diffDays(
      { year: 867, month: 6, day: 10 },
      { year: 867, month: 6, day: 5 },
    )).toBe(-5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// diffMonths
// ─────────────────────────────────────────────────────────────────────────────

describe('diffMonths', () => {
  it('同月差值为 0', () => {
    expect(diffMonths(
      { year: 867, month: 6, day: 1 },
      { year: 867, month: 6, day: 30 },
    )).toBe(0);
  });

  it('6 个月差', () => {
    expect(diffMonths(
      { year: 867, month: 1, day: 1 },
      { year: 867, month: 7, day: 1 },
    )).toBe(6);
  });

  it('12 个月差（整年）', () => {
    expect(diffMonths(
      { year: 867, month: 1, day: 1 },
      { year: 868, month: 1, day: 1 },
    )).toBe(12);
  });

  it('b < a 时返回负数', () => {
    expect(diffMonths(
      { year: 867, month: 6, day: 1 },
      { year: 867, month: 3, day: 1 },
    )).toBe(-3);
  });

  it('跨年 14 个月', () => {
    expect(diffMonths(
      { year: 867, month: 3, day: 1 },
      { year: 868, month: 5, day: 1 },
    )).toBe(14);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isFirstOfMonth / isFirstOfYear
// ─────────────────────────────────────────────────────────────────────────────

describe('isFirstOfMonth', () => {
  it('day=1 → true', () => {
    expect(isFirstOfMonth({ year: 867, month: 6, day: 1 })).toBe(true);
  });

  it('day=2 → false', () => {
    expect(isFirstOfMonth({ year: 867, month: 6, day: 2 })).toBe(false);
  });
});

describe('isFirstOfYear', () => {
  it('month=1, day=1 → true', () => {
    expect(isFirstOfYear({ year: 867, month: 1, day: 1 })).toBe(true);
  });

  it('month=1, day=2 → false', () => {
    expect(isFirstOfYear({ year: 867, month: 1, day: 2 })).toBe(false);
  });

  it('month=2, day=1 → false', () => {
    expect(isFirstOfYear({ year: 867, month: 2, day: 1 })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compareDates
// ─────────────────────────────────────────────────────────────────────────────

describe('compareDates', () => {
  it('相同日期 → 0', () => {
    const d = { year: 867, month: 6, day: 15 };
    expect(compareDates(d, d)).toBe(0);
  });

  it('a 年份更早 → -1', () => {
    expect(compareDates(
      { year: 866, month: 12, day: 31 },
      { year: 867, month: 1, day: 1 },
    )).toBe(-1);
  });

  it('a 年份更晚 → 1', () => {
    expect(compareDates(
      { year: 868, month: 1, day: 1 },
      { year: 867, month: 12, day: 31 },
    )).toBe(1);
  });

  it('同年 a 月份更早 → -1', () => {
    expect(compareDates(
      { year: 867, month: 3, day: 1 },
      { year: 867, month: 6, day: 1 },
    )).toBe(-1);
  });

  it('同年同月 a 日更早 → -1', () => {
    expect(compareDates(
      { year: 867, month: 6, day: 1 },
      { year: 867, month: 6, day: 15 },
    )).toBe(-1);
  });

  it('同年同月 a 日更晚 → 1', () => {
    expect(compareDates(
      { year: 867, month: 6, day: 15 },
      { year: 867, month: 6, day: 1 },
    )).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isDateReached
// ─────────────────────────────────────────────────────────────────────────────

describe('isDateReached', () => {
  it('current === target → true', () => {
    const d = { year: 867, month: 6, day: 1 };
    expect(isDateReached(d, d)).toBe(true);
  });

  it('current > target → true', () => {
    expect(isDateReached(
      { year: 867, month: 6, day: 2 },
      { year: 867, month: 6, day: 1 },
    )).toBe(true);
  });

  it('current < target → false', () => {
    expect(isDateReached(
      { year: 867, month: 5, day: 30 },
      { year: 867, month: 6, day: 1 },
    )).toBe(false);
  });
});
