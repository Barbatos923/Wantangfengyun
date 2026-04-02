/**
 * 建筑系统数据完整性测试
 *
 * 锁定 ALL_BUILDINGS 的数据契约：
 *   - 非空、ID 全局唯一
 *   - 造价 costMoney / costGrain >= 0
 *   - 建造工期 constructionMonths > 0
 *   - maxLevel > 0
 *   - allowedType 枚举值合法
 *   - buildingMap 查找一致
 */

import { describe, it, expect } from 'vitest';
import { ALL_BUILDINGS, buildingMap } from '@data/buildings';

const VALID_ALLOWED_TYPES = new Set(['any', 'military', 'civil']);

describe('ALL_BUILDINGS — 建筑定义数据完整性', () => {
  it('数组不为空', () => {
    expect(ALL_BUILDINGS.length).toBeGreaterThan(0);
  });

  it('每个建筑都有唯一 id', () => {
    const ids = ALL_BUILDINGS.map((b) => b.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('每个建筑都有 name', () => {
    for (const b of ALL_BUILDINGS) {
      expect(b.name, `建筑 ${b.id} 缺少 name`).toBeTruthy();
    }
  });

  it('costMoney >= 0', () => {
    for (const b of ALL_BUILDINGS) {
      expect(
        b.costMoney,
        `建筑 ${b.id} 的 costMoney=${b.costMoney} 为负`
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('costGrain >= 0', () => {
    for (const b of ALL_BUILDINGS) {
      expect(
        b.costGrain,
        `建筑 ${b.id} 的 costGrain=${b.costGrain} 为负`
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('constructionMonths > 0（工期至少 1 个月）', () => {
    for (const b of ALL_BUILDINGS) {
      expect(
        b.constructionMonths,
        `建筑 ${b.id} 的 constructionMonths=${b.constructionMonths} 无效`
      ).toBeGreaterThan(0);
    }
  });

  it('maxLevel > 0', () => {
    for (const b of ALL_BUILDINGS) {
      expect(
        b.maxLevel,
        `建筑 ${b.id} 的 maxLevel=${b.maxLevel} 无效`
      ).toBeGreaterThan(0);
    }
  });

  it('allowedType 只能是 any / military / civil', () => {
    for (const b of ALL_BUILDINGS) {
      expect(
        VALID_ALLOWED_TYPES.has(b.allowedType),
        `建筑 ${b.id} 的 allowedType="${b.allowedType}" 无效`
      ).toBe(true);
    }
  });

  it('每级效果数值（各 perLevel 字段）均为非负', () => {
    for (const b of ALL_BUILDINGS) {
      const perLevelFields = [
        'moneyPerLevel', 'grainPerLevel', 'troopsPerLevel',
        'defensePerLevel', 'controlPerMonthPerLevel',
        'developmentPerMonthPerLevel', 'populacePerMonthPerLevel',
        'stressReductionPerLevel', 'grainStoragePerLevel',
      ] as const;
      for (const field of perLevelFields) {
        expect(
          b[field],
          `建筑 ${b.id} 的 ${field}=${b[field]} 为负`
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('buildingMap 条目数与数组长度一致', () => {
    expect(buildingMap.size).toBe(ALL_BUILDINGS.length);
  });

  it('buildingMap 能按 id 正确查找', () => {
    for (const b of ALL_BUILDINGS) {
      expect(buildingMap.get(b.id)).toBe(b);
    }
  });

  it('农田（building-farm）应存在且允许类型为 any', () => {
    const farm = buildingMap.get('building-farm');
    expect(farm).toBeDefined();
    expect(farm!.allowedType).toBe('any');
  });

  it('兵营（building-barracks）应只允许军事领地', () => {
    const barracks = buildingMap.get('building-barracks');
    expect(barracks).toBeDefined();
    expect(barracks!.allowedType).toBe('military');
  });

  it('集市（building-market）应只允许民政领地', () => {
    const market = buildingMap.get('building-market');
    expect(market).toBeDefined();
    expect(market!.allowedType).toBe('civil');
  });
});
