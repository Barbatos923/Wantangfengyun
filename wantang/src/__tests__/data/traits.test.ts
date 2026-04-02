/**
 * 特质系统数据完整性测试
 *
 * 锁定 ALL_TRAITS 的数据契约：
 *   - 非空、ID 全局唯一
 *   - category 枚举合法
 *   - exclusiveWith 引用的特质 id 必须存在
 *   - education 特质必须有 educationLevel
 *   - personalityModifiers 单值不超出 ±1.0
 *   - 互斥关系对称（A 互斥 B 则 B 互斥 A）
 */

import { describe, it, expect } from 'vitest';
import { ALL_TRAITS, traitMap } from '@data/traits';

const VALID_CATEGORIES = new Set(['innate', 'personality', 'education', 'event']);

describe('ALL_TRAITS — 特质数据完整性', () => {
  it('数组不为空', () => {
    expect(ALL_TRAITS.length).toBeGreaterThan(0);
  });

  it('每个特质都有唯一 id', () => {
    const ids = ALL_TRAITS.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('每个特质都有 name', () => {
    for (const t of ALL_TRAITS) {
      expect(t.name, `特质 ${t.id} 缺少 name`).toBeTruthy();
    }
  });

  it('category 只能是 innate / personality / education / event', () => {
    for (const t of ALL_TRAITS) {
      expect(
        VALID_CATEGORIES.has(t.category),
        `特质 ${t.id} 的 category="${t.category}" 无效`
      ).toBe(true);
    }
  });

  it('应同时包含各类别特质', () => {
    const categories = new Set(ALL_TRAITS.map((t) => t.category));
    expect(categories.has('innate')).toBe(true);
    expect(categories.has('personality')).toBe(true);
    expect(categories.has('education')).toBe(true);
  });

  it('exclusiveWith 中引用的特质 id 必须在 traitMap 中存在', () => {
    for (const t of ALL_TRAITS) {
      if (!t.exclusiveWith) continue;
      for (const exId of t.exclusiveWith) {
        expect(
          traitMap.has(exId),
          `特质 ${t.id} 的 exclusiveWith 中引用了不存在的特质 "${exId}"`
        ).toBe(true);
      }
    }
  });

  it('互斥关系应对称（A 互斥 B，则 B 也应互斥 A）', () => {
    for (const t of ALL_TRAITS) {
      if (!t.exclusiveWith) continue;
      for (const exId of t.exclusiveWith) {
        const other = traitMap.get(exId);
        if (!other) continue; // 已被上面的测试捕获
        expect(
          other.exclusiveWith?.includes(t.id),
          `特质 ${t.id} 互斥 ${exId}，但 ${exId} 没有互斥回 ${t.id}（不对称）`
        ).toBe(true);
      }
    }
  });

  it('education 特质必须有 educationLevel', () => {
    const eduTraits = ALL_TRAITS.filter((t) => t.category === 'education');
    expect(eduTraits.length).toBeGreaterThan(0);
    for (const t of eduTraits) {
      expect(
        t.educationLevel !== undefined,
        `教育特质 ${t.id} 缺少 educationLevel`
      ).toBe(true);
      expect(
        t.educationLevel! > 0,
        `教育特质 ${t.id} 的 educationLevel 应大于 0`
      ).toBe(true);
    }
  });

  it('education 特质必须有 educationAbility', () => {
    const eduTraits = ALL_TRAITS.filter((t) => t.category === 'education');
    for (const t of eduTraits) {
      expect(
        t.educationAbility !== undefined,
        `教育特质 ${t.id} 缺少 educationAbility`
      ).toBe(true);
    }
  });

  it('personalityModifiers 单个维度值不超出 ±1.0', () => {
    for (const t of ALL_TRAITS) {
      if (!t.personalityModifiers) continue;
      for (const [key, val] of Object.entries(t.personalityModifiers)) {
        expect(
          Math.abs(val as number) <= 1.0,
          `特质 ${t.id} 的 personalityModifiers.${key}=${val} 超出 ±1.0`
        ).toBe(true);
      }
    }
  });

  it('traitMap 条目数与数组长度一致', () => {
    expect(traitMap.size).toBe(ALL_TRAITS.length);
  });

  it('traitMap 能按 id 正确查找', () => {
    for (const t of ALL_TRAITS) {
      expect(traitMap.get(t.id)).toBe(t);
    }
  });

  it('先天特质：天才/聪慧/愚钝三者互斥', () => {
    const genius = traitMap.get('trait-genius');
    const clever = traitMap.get('trait-clever');
    const dull = traitMap.get('trait-dull');
    expect(genius).toBeDefined();
    expect(clever).toBeDefined();
    expect(dull).toBeDefined();
    expect(genius!.exclusiveWith).toContain('trait-clever');
    expect(genius!.exclusiveWith).toContain('trait-dull');
  });
});
