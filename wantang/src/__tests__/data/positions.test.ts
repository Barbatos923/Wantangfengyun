/**
 * 职位系统数据完整性测试
 *
 * 锁定 ALL_POSITIONS 的数据契约：
 *   - 非空、ID 全局唯一
 *   - minRank 在合法品级范围内（1–29，且在 rankMap 中存在）
 *   - salary 字段非负
 *   - scope 字段枚举合法
 *   - 地方职位（local）必须携带合法的 tier
 */

import { describe, it, expect } from 'vitest';
import { ALL_POSITIONS, positionMap } from '@data/positions';
import { rankMap } from '@data/ranks';

const VALID_SCOPES = new Set(['central', 'local']);
const VALID_TIERS = new Set(['dao', 'zhou', 'guo']);

describe('ALL_POSITIONS — 职位模板数据完整性', () => {
  it('数组不为空', () => {
    expect(ALL_POSITIONS.length).toBeGreaterThan(0);
  });

  it('每个职位都有唯一 id', () => {
    const ids = ALL_POSITIONS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('皇帝职位必须存在', () => {
    const emperor = positionMap.get('pos-emperor');
    expect(emperor).toBeDefined();
    expect(emperor!.name).toBe('皇帝');
  });

  it('宰相职位必须存在', () => {
    expect(positionMap.get('pos-zaixiang')).toBeDefined();
  });

  it('节度使职位必须存在', () => {
    expect(positionMap.get('pos-jiedushi')).toBeDefined();
  });

  it('每个职位的 minRank 在合法品级范围内（1–29）', () => {
    for (const pos of ALL_POSITIONS) {
      expect(
        pos.minRank,
        `职位 ${pos.id} 的 minRank=${pos.minRank} 不在 [1,29] 范围内`
      ).toBeGreaterThanOrEqual(1);
      expect(pos.minRank).toBeLessThanOrEqual(29);
    }
  });

  it('每个职位的 minRank 在 rankMap 中存在', () => {
    for (const pos of ALL_POSITIONS) {
      expect(
        rankMap.has(pos.minRank),
        `职位 ${pos.id} 的 minRank=${pos.minRank} 在 rankMap 中找不到`
      ).toBe(true);
    }
  });

  it('salary.money >= 0', () => {
    for (const pos of ALL_POSITIONS) {
      expect(
        pos.salary.money,
        `职位 ${pos.id} 的 salary.money=${pos.salary.money} 为负`
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('salary.grain >= 0', () => {
    for (const pos of ALL_POSITIONS) {
      expect(
        pos.salary.grain,
        `职位 ${pos.id} 的 salary.grain=${pos.salary.grain} 为负`
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('scope 字段只能是 central 或 local', () => {
    for (const pos of ALL_POSITIONS) {
      expect(
        VALID_SCOPES.has(pos.scope),
        `职位 ${pos.id} 的 scope="${pos.scope}" 无效`
      ).toBe(true);
    }
  });

  it('local 职位必须有合法的 tier（dao/zhou/guo）', () => {
    const localPositions = ALL_POSITIONS.filter((p) => p.scope === 'local');
    expect(localPositions.length).toBeGreaterThan(0);
    for (const pos of localPositions) {
      expect(
        pos.tier !== undefined && VALID_TIERS.has(pos.tier),
        `local 职位 ${pos.id} 缺少合法的 tier（当前: "${pos.tier}"）`
      ).toBe(true);
    }
  });

  it('central 职位不应有 tier（或 tier 为 undefined）', () => {
    const centralPositions = ALL_POSITIONS.filter((p) => p.scope === 'central');
    for (const pos of centralPositions) {
      expect(
        pos.tier,
        `central 职位 ${pos.id} 不应有 tier 字段`
      ).toBeUndefined();
    }
  });

  it('positionMap 中的条目数与数组长度一致', () => {
    expect(positionMap.size).toBe(ALL_POSITIONS.length);
  });

  it('positionMap 能按 id 正确查找', () => {
    for (const pos of ALL_POSITIONS) {
      expect(positionMap.get(pos.id)).toBe(pos);
    }
  });

  it('grantsControl 为 true 的职位必须是 local scope', () => {
    const controlPositions = ALL_POSITIONS.filter((p) => p.grantsControl);
    expect(controlPositions.length).toBeGreaterThan(0);
    for (const pos of controlPositions) {
      expect(
        pos.scope,
        `职位 ${pos.id} 设置了 grantsControl 但 scope=${pos.scope}`
      ).toBe('local');
    }
  });
});
