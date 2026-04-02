/**
 * 经济计算纯函数单元测试
 *
 * economyCalc.ts 中大多数函数需要完整的 Store 状态（territories、characters、armies 等），
 * 不适合孤立单元测试。
 *
 * 这里仅测试其中真正意义"纯"的函数：
 *
 *   getTributeRatio(centralization, territoryType)
 *     — 完全由两个枚举参数决定返回值，无任何外部依赖
 *
 * 朝贡比例表：
 *   military: 1→0.10, 2→0.20, 3→0.35, 4→0.50
 *   civil:    1→0.40, 2→0.60, 3→0.80, 4→0.95
 */

import { describe, it, expect } from 'vitest';
import { getTributeRatio } from '@engine/official/economyCalc';

describe('getTributeRatio — 朝贡比例', () => {
  // ── 军事领地（节度使） ──────────────────────────────────────────────────

  describe('military 类型', () => {
    it('centralization=1 → 0.10', () => {
      expect(getTributeRatio(1, 'military')).toBeCloseTo(0.10);
    });

    it('centralization=2 → 0.20', () => {
      expect(getTributeRatio(2, 'military')).toBeCloseTo(0.20);
    });

    it('centralization=3 → 0.35', () => {
      expect(getTributeRatio(3, 'military')).toBeCloseTo(0.35);
    });

    it('centralization=4 → 0.50', () => {
      expect(getTributeRatio(4, 'military')).toBeCloseTo(0.50);
    });

    it('随集权度增加，军事税率单调递增', () => {
      const r1 = getTributeRatio(1, 'military');
      const r2 = getTributeRatio(2, 'military');
      const r3 = getTributeRatio(3, 'military');
      const r4 = getTributeRatio(4, 'military');
      expect(r2).toBeGreaterThan(r1);
      expect(r3).toBeGreaterThan(r2);
      expect(r4).toBeGreaterThan(r3);
    });

    it('军事税率始终 < 1（不可能100%征取）', () => {
      for (const c of [1, 2, 3, 4] as const) {
        expect(getTributeRatio(c, 'military')).toBeLessThan(1);
      }
    });
  });

  // ── 民政领地（观察使） ──────────────────────────────────────────────────

  describe('civil 类型', () => {
    it('centralization=1 → 0.40', () => {
      expect(getTributeRatio(1, 'civil')).toBeCloseTo(0.40);
    });

    it('centralization=2 → 0.60', () => {
      expect(getTributeRatio(2, 'civil')).toBeCloseTo(0.60);
    });

    it('centralization=3 → 0.80', () => {
      expect(getTributeRatio(3, 'civil')).toBeCloseTo(0.80);
    });

    it('centralization=4 → 0.95', () => {
      expect(getTributeRatio(4, 'civil')).toBeCloseTo(0.95);
    });

    it('随集权度增加，民政税率单调递增', () => {
      const r1 = getTributeRatio(1, 'civil');
      const r2 = getTributeRatio(2, 'civil');
      const r3 = getTributeRatio(3, 'civil');
      const r4 = getTributeRatio(4, 'civil');
      expect(r2).toBeGreaterThan(r1);
      expect(r3).toBeGreaterThan(r2);
      expect(r4).toBeGreaterThan(r3);
    });

    it('民政税率始终 < 1', () => {
      for (const c of [1, 2, 3, 4] as const) {
        expect(getTributeRatio(c, 'civil')).toBeLessThan(1);
      }
    });
  });

  // ── 跨类型比较 ─────────────────────────────────────────────────────────

  describe('civil vs military 比较', () => {
    it('相同集权度下，民政税率始终高于军事税率（藩镇独立性更强）', () => {
      for (const c of [1, 2, 3, 4] as const) {
        expect(getTributeRatio(c, 'civil')).toBeGreaterThan(getTributeRatio(c, 'military'));
      }
    });
  });
});
