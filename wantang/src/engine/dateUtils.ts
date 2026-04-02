// ===== 日期工具：现实平年日历（无闰年） =====

import type { GameDate } from './types';

/** 每月天数（平年） */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 月份前缀和：MONTH_PREFIX[m] = 第 m 月第 1 天之前的总天数（0-indexed month） */
const MONTH_PREFIX: number[] = [];
{
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    MONTH_PREFIX.push(sum);
    sum += DAYS_IN_MONTH[i];
  }
}

export const DAYS_PER_YEAR = 365;

/** 获取某月的天数（month: 1-12） */
export function getDaysInMonth(month: number): number {
  return DAYS_IN_MONTH[month - 1];
}

/** 转为绝对天数（从 year=1, month=1, day=1 起算为 0） */
export function toAbsoluteDay(d: GameDate): number {
  return (d.year - 1) * DAYS_PER_YEAR + MONTH_PREFIX[d.month - 1] + (d.day - 1);
}

/** 从绝对天数还原 GameDate */
export function fromAbsoluteDay(abs: number): GameDate {
  const year = Math.floor(abs / DAYS_PER_YEAR) + 1;
  let rem = abs % DAYS_PER_YEAR;
  // 处理负余数（理论上不应出现，防御性编程）
  if (rem < 0) rem += DAYS_PER_YEAR;

  let month = 1;
  for (let i = 0; i < 12; i++) {
    if (rem < DAYS_IN_MONTH[i]) {
      month = i + 1;
      break;
    }
    rem -= DAYS_IN_MONTH[i];
  }
  return { year, month, day: rem + 1 };
}

/** 前进 n 天 */
export function addDays(d: GameDate, n: number): GameDate {
  return fromAbsoluteDay(toAbsoluteDay(d) + n);
}

/** 两个日期之间的天数差（b - a） */
export function diffDays(a: GameDate, b: GameDate): number {
  return toAbsoluteDay(b) - toAbsoluteDay(a);
}

/** 两个日期之间的月数差（向下取整，兼容旧 (y2-y1)*12+(m2-m1) 语义） */
export function diffMonths(a: GameDate, b: GameDate): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** 是否为月初（day === 1） */
export function isFirstOfMonth(d: GameDate): boolean {
  return d.day === 1;
}

/** 是否为年初（month === 1 && day === 1） */
export function isFirstOfYear(d: GameDate): boolean {
  return d.month === 1 && d.day === 1;
}

/** 日期比较：-1 = a 早于 b，0 = 相同，1 = a 晚于 b */
export function compareDates(a: GameDate, b: GameDate): -1 | 0 | 1 {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/** current 是否已达到或超过 target */
export function isDateReached(current: GameDate, target: GameDate): boolean {
  return compareDates(current, target) >= 0;
}
