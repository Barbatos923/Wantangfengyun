/**
 * 地图拓扑数据完整性测试
 *
 * 锁定 ZHOU_POSITIONS 和 ALL_EDGES 的数据契约：
 *   - 49 个州坐标，全局 ID 唯一
 *   - 边无自环，端点均在 ZHOU_POSITIONS 中存在
 *   - 无重复边（同一对 from/to 只出现一次）
 *   - 边类型只能是 land 或 water
 *   - 坐标在合法 ViewBox 范围（0 0 1600 1000）内
 *
 * 注意：边以无向方式定义（每条边只存储一次），不测试双向存储。
 */

import { describe, it, expect } from 'vitest';
import { ZHOU_POSITIONS, ALL_EDGES, posById } from '@data/mapTopology';

const VIEWBOX_W = 1600;
const VIEWBOX_H = 1000;
const VALID_EDGE_TYPES = new Set(['land', 'water']);

describe('ZHOU_POSITIONS — 州坐标数据完整性', () => {
  it('应有 49 个州', () => {
    expect(ZHOU_POSITIONS.length).toBe(49);
  });

  it('每个州都有唯一 id', () => {
    const ids = ZHOU_POSITIONS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('长安（zhou-changan）必须存在', () => {
    expect(posById.get('zhou-changan')).toBeDefined();
  });

  it('所有坐标 x 在 ViewBox 宽度内（0 ~ 1600）', () => {
    for (const p of ZHOU_POSITIONS) {
      expect(p.x, `${p.id} 的 x=${p.x} 超出范围`).toBeGreaterThanOrEqual(0);
      expect(p.x, `${p.id} 的 x=${p.x} 超出范围`).toBeLessThanOrEqual(VIEWBOX_W);
    }
  });

  it('所有坐标 y 在 ViewBox 高度内（0 ~ 1000）', () => {
    for (const p of ZHOU_POSITIONS) {
      expect(p.y, `${p.id} 的 y=${p.y} 超出范围`).toBeGreaterThanOrEqual(0);
      expect(p.y, `${p.id} 的 y=${p.y} 超出范围`).toBeLessThanOrEqual(VIEWBOX_H);
    }
  });

  it('半径 r > 0', () => {
    for (const p of ZHOU_POSITIONS) {
      expect(p.r, `${p.id} 的 r=${p.r} 无效`).toBeGreaterThan(0);
    }
  });

  it('posById 条目数与数组长度一致', () => {
    expect(posById.size).toBe(ZHOU_POSITIONS.length);
  });

  it('posById 能按 id 正确查找', () => {
    for (const p of ZHOU_POSITIONS) {
      expect(posById.get(p.id)).toBe(p);
    }
  });
});

describe('ALL_EDGES — 州间连接数据完整性', () => {
  it('边数组不为空', () => {
    expect(ALL_EDGES.length).toBeGreaterThan(0);
  });

  it('边类型只能是 land 或 water', () => {
    for (const e of ALL_EDGES) {
      expect(
        VALID_EDGE_TYPES.has(e.type),
        `边 ${e.from}→${e.to} 的 type="${e.type}" 无效`
      ).toBe(true);
    }
  });

  it('无自环（from !== to）', () => {
    for (const e of ALL_EDGES) {
      expect(
        e.from,
        `边存在自环：${e.from}→${e.to}`
      ).not.toBe(e.to);
    }
  });

  it('边的 from 端点必须是合法的州 id', () => {
    for (const e of ALL_EDGES) {
      expect(
        posById.has(e.from),
        `边的 from="${e.from}" 不在 ZHOU_POSITIONS 中`
      ).toBe(true);
    }
  });

  it('边的 to 端点必须是合法的州 id', () => {
    for (const e of ALL_EDGES) {
      expect(
        posById.has(e.to),
        `边的 to="${e.to}" 不在 ZHOU_POSITIONS 中`
      ).toBe(true);
    }
  });

  it('无重复边（同一对 from/to 不出现两次）', () => {
    const seen = new Set<string>();
    for (const e of ALL_EDGES) {
      // 以规范顺序生成 key（from < to 则直接用，否则互换）
      const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
      expect(
        seen.has(key),
        `重复边：${e.from} ↔ ${e.to}`
      ).toBe(false);
      seen.add(key);
    }
  });

  it('长安（zhou-changan）应有邻接边', () => {
    const changanEdges = ALL_EDGES.filter(
      (e) => e.from === 'zhou-changan' || e.to === 'zhou-changan'
    );
    expect(changanEdges.length).toBeGreaterThan(0);
  });

  it('水路边（water）应至少存在一条', () => {
    const waterEdges = ALL_EDGES.filter((e) => e.type === 'water');
    expect(waterEdges.length).toBeGreaterThan(0);
  });
});
