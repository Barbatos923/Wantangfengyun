/**
 * 品级系统数据完整性测试
 *
 * 锁定 ALL_RANKS 的数据契约：
 *   - 共 29 级（从九品下 level=1 至从一品 level=29）
 *   - level 值唯一且连续
 *   - 每级都有 name / civilTitle / militaryTitle
 *   - monthlySalary 非负
 *   - virtueThreshold 单调递增
 */

import { describe, it, expect } from 'vitest';
import { ALL_RANKS, rankMap } from '@data/ranks';

describe('ALL_RANKS — 散官品位数据完整性', () => {
  it('应有 29 个品级', () => {
    expect(ALL_RANKS.length).toBe(29);
  });

  it('level 值应唯一', () => {
    const levels = ALL_RANKS.map((r) => r.level);
    const unique = new Set(levels);
    expect(unique.size).toBe(levels.length);
  });

  it('level 值应覆盖 1–29 连续整数', () => {
    const levels = new Set(ALL_RANKS.map((r) => r.level));
    for (let i = 1; i <= 29; i++) {
      expect(levels.has(i), `品级 level=${i} 缺失`).toBe(true);
    }
  });

  it('每个品级都有 name', () => {
    for (const r of ALL_RANKS) {
      expect(r.name, `level=${r.level} 缺少 name`).toBeTruthy();
    }
  });

  it('每个品级都有 civilTitle', () => {
    for (const r of ALL_RANKS) {
      expect(r.civilTitle, `level=${r.level} 缺少 civilTitle`).toBeTruthy();
    }
  });

  it('每个品级都有 militaryTitle', () => {
    for (const r of ALL_RANKS) {
      expect(r.militaryTitle, `level=${r.level} 缺少 militaryTitle`).toBeTruthy();
    }
  });

  it('monthlySalary.money >= 0', () => {
    for (const r of ALL_RANKS) {
      expect(
        r.monthlySalary.money,
        `level=${r.level} 的 money=${r.monthlySalary.money} 为负`
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('monthlySalary.grain >= 0', () => {
    for (const r of ALL_RANKS) {
      expect(
        r.monthlySalary.grain,
        `level=${r.level} 的 grain=${r.monthlySalary.grain} 为负`
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('virtueThreshold 应单调非递减', () => {
    const sorted = [...ALL_RANKS].sort((a, b) => a.level - b.level);
    for (let i = 1; i < sorted.length; i++) {
      expect(
        sorted[i].virtueThreshold,
        `level=${sorted[i].level} 的 virtueThreshold 不应小于 level=${sorted[i - 1].level}`
      ).toBeGreaterThanOrEqual(sorted[i - 1].virtueThreshold);
    }
  });

  it('最低品 level=1 的 virtueThreshold 应为 0', () => {
    const lowest = rankMap.get(1);
    expect(lowest).toBeDefined();
    expect(lowest!.virtueThreshold).toBe(0);
  });

  it('较高品级的月俸不应低于较低品级（大体趋势）', () => {
    const sorted = [...ALL_RANKS].sort((a, b) => a.level - b.level);
    // 前后两级比较，允许极少量例外（但月俸整体应单调）
    // 此处仅检验最低品 level=1 << level=29
    const level1 = rankMap.get(1)!;
    const level29 = rankMap.get(29)!;
    expect(level29.monthlySalary.money).toBeGreaterThan(level1.monthlySalary.money);
    expect(level29.monthlySalary.grain).toBeGreaterThan(level1.monthlySalary.grain);
  });

  it('rankMap 条目数与数组长度一致', () => {
    expect(rankMap.size).toBe(ALL_RANKS.length);
  });

  it('rankMap 能按 level 正确查找', () => {
    for (const r of ALL_RANKS) {
      expect(rankMap.get(r.level)).toBe(r);
    }
  });
});
