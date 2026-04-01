// ===== Phase 4c 正统性系统单元测试 =====

import { describe, it, expect } from 'vitest';
import { Era } from '@engine/types';
import {
  getBaseLegitimacy,
  getHighestBaseLegitimacy,
  getRankLegitimacyCap,
  calcLegitimacyOpinion,
  calcEraDecay,
  calcRankMismatchPenalty,
  canAffordWarCost,
} from '@engine/official/legitimacyCalc';
import type { Post } from '@engine/territory/types';

// ── getBaseLegitimacy ──────────────────────────────────────────────────────────

describe('getBaseLegitimacy', () => {
  it('皇帝岗位返回 95', () => {
    expect(getBaseLegitimacy('pos-emperor')).toBe(95);
  });

  it('baseLegitimacy = 岗位 minRank 对应的 rankCap', () => {
    expect(getBaseLegitimacy('pos-jiedushi')).toBe(80);     // minRank 17 → cap 80
    expect(getBaseLegitimacy('pos-guancha-shi')).toBe(80);  // minRank 17 → cap 80
    expect(getBaseLegitimacy('pos-zaixiang')).toBe(90);     // minRank 25 → cap 90
    expect(getBaseLegitimacy('pos-shumi')).toBe(85);        // minRank 22 → cap 85
    expect(getBaseLegitimacy('pos-cishi')).toBe(60);        // minRank 12 → cap 60
    expect(getBaseLegitimacy('pos-panguan')).toBe(60);      // minRank 9 → cap 60
    expect(getBaseLegitimacy('pos-zhengzi')).toBe(40);      // minRank 3 → cap 40
  });

  it('未知模板返回 60', () => {
    expect(getBaseLegitimacy('pos-nonexistent')).toBe(60);
  });
});

// ── getHighestBaseLegitimacy ────────────────────────────────────────────────────

describe('getHighestBaseLegitimacy', () => {
  it('无岗位返回 null', () => {
    expect(getHighestBaseLegitimacy([])).toBeNull();
  });

  it('取多个岗位中最高的 baseLegitimacy', () => {
    const posts = [
      { templateId: 'pos-cishi' } as Post,       // 60
      { templateId: 'pos-jiedushi' } as Post,     // 80
    ];
    expect(getHighestBaseLegitimacy(posts)).toBe(80);
  });

  it('单个岗位返回该岗位的 baseLegitimacy', () => {
    const posts = [{ templateId: 'pos-emperor' } as Post];
    expect(getHighestBaseLegitimacy(posts)).toBe(95);
  });
});

// ── getRankLegitimacyCap ────────────────────────────────────────────────────────

describe('getRankLegitimacyCap', () => {
  it('一品（rank 29）上限 100', () => {
    expect(getRankLegitimacyCap(29)).toBe(100);
  });

  it('二品（rank 27-28）上限 95', () => {
    expect(getRankLegitimacyCap(27)).toBe(95);
    expect(getRankLegitimacyCap(28)).toBe(95);
  });

  it('三品（rank 25-26）上限 90', () => {
    expect(getRankLegitimacyCap(25)).toBe(90);
    expect(getRankLegitimacyCap(26)).toBe(90);
  });

  it('五品（rank 17-20）上限 80', () => {
    expect(getRankLegitimacyCap(17)).toBe(80);
    expect(getRankLegitimacyCap(20)).toBe(80);
  });

  it('六品（rank 13-16）上限 70', () => {
    expect(getRankLegitimacyCap(13)).toBe(70);
    expect(getRankLegitimacyCap(16)).toBe(70);
  });

  it('七品（rank 9-12）上限 60', () => {
    expect(getRankLegitimacyCap(9)).toBe(60);
    expect(getRankLegitimacyCap(12)).toBe(60);
  });

  it('八品（rank 5-8）上限 50', () => {
    expect(getRankLegitimacyCap(5)).toBe(50);
    expect(getRankLegitimacyCap(8)).toBe(50);
  });

  it('九品（rank 1-4）上限 40', () => {
    expect(getRankLegitimacyCap(1)).toBe(40);
    expect(getRankLegitimacyCap(4)).toBe(40);
  });
});

// ── calcLegitimacyOpinion ───────────────────────────────────────────────────────

describe('calcLegitimacyOpinion', () => {
  it('无岗位（E=null）返回 null', () => {
    expect(calcLegitimacyOpinion(50, null)).toBeNull();
  });

  it('D >= +10 → gapValue +10', () => {
    const result = calcLegitimacyOpinion(95, 80);
    expect(result).not.toBeNull();
    expect(result!.gapValue).toBe(10);
  });

  it('0 <= D < 10 → gapValue 0', () => {
    const result = calcLegitimacyOpinion(80, 80);
    expect(result!.gapValue).toBe(0);
  });

  it('-10 <= D < 0 → gapValue -5', () => {
    const result = calcLegitimacyOpinion(75, 80);
    expect(result!.gapValue).toBe(-5);
  });

  it('-20 <= D < -10 → gapValue -15', () => {
    const result = calcLegitimacyOpinion(65, 80);
    expect(result!.gapValue).toBe(-15);
  });

  it('-30 <= D < -20 → gapValue -30', () => {
    const result = calcLegitimacyOpinion(55, 80);
    expect(result!.gapValue).toBe(-30);
  });

  it('D < -30 → gapValue -50', () => {
    const result = calcLegitimacyOpinion(40, 80);
    expect(result!.gapValue).toBe(-50);
  });

  it('L >= 90 → absoluteValue +10', () => {
    const result = calcLegitimacyOpinion(95, 95);
    expect(result!.absoluteValue).toBe(10);
  });

  it('L <= 30 → absoluteValue -20', () => {
    const result = calcLegitimacyOpinion(25, 80);
    expect(result!.absoluteValue).toBe(-20);
  });

  it('31 <= L <= 89 → absoluteValue 0', () => {
    const result = calcLegitimacyOpinion(50, 60);
    expect(result!.absoluteValue).toBe(0);
  });

  it('极端情况：皇帝 95→25，gapValue -50 + absoluteValue -20 = -70', () => {
    const result = calcLegitimacyOpinion(25, 95);
    expect(result!.gapValue).toBe(-50);
    expect(result!.absoluteValue).toBe(-20);
    expect(result!.gapValue + result!.absoluteValue).toBe(-70);
  });
});

// ── calcEraDecay ────────────────────────────────────────────────────────────────

describe('calcEraDecay', () => {
  it('治世 → 0', () => {
    expect(calcEraDecay(Era.ZhiShi)).toBe(0);
  });

  it('危世 → -0.25', () => {
    expect(calcEraDecay(Era.WeiShi)).toBe(-0.25);
  });

  it('乱世 → -1', () => {
    expect(calcEraDecay(Era.LuanShi)).toBe(-1);
  });
});

// ── calcRankMismatchPenalty ──────────────────────────────────────────────────────

describe('calcRankMismatchPenalty', () => {
  it('品位足够 → 0', () => {
    expect(calcRankMismatchPenalty(17, 17)).toBe(0);
    expect(calcRankMismatchPenalty(20, 17)).toBe(0);
  });

  it('品位不足 → 负数惩罚', () => {
    expect(calcRankMismatchPenalty(12, 17)).toBe(-250);  // -50 * 5
    expect(calcRankMismatchPenalty(15, 17)).toBe(-100);  // -50 * 2
  });
});

// ── canAffordWarCost ────────────────────────────────────────────────────────────

describe('canAffordWarCost', () => {
  it('资源充足 → true', () => {
    expect(canAffordWarCost(
      { prestige: 50, legitimacy: 80 },
      { prestige: -40, legitimacy: -20 },
    )).toBe(true);
  });

  it('威望不足 → false', () => {
    expect(canAffordWarCost(
      { prestige: 10, legitimacy: 80 },
      { prestige: -40, legitimacy: -20 },
    )).toBe(false);
  });

  it('正统性不足 → false', () => {
    expect(canAffordWarCost(
      { prestige: 50, legitimacy: 10 },
      { prestige: -5, legitimacy: -20 },
    )).toBe(false);
  });

  it('刚好够 → true', () => {
    expect(canAffordWarCost(
      { prestige: 40, legitimacy: 20 },
      { prestige: -40, legitimacy: -20 },
    )).toBe(true);
  });

  it('零花费 → true', () => {
    expect(canAffordWarCost(
      { prestige: 0, legitimacy: 0 },
      { prestige: 0, legitimacy: 0 },
    )).toBe(true);
  });
});
