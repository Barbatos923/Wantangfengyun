/**
 * Phase 1 重构安全网测试
 *
 * 目的：在移动 characterGen.ts → engine/character/characterGen.ts
 *       和 registries.ts → engine/utils/registries.ts 之前，
 *       锁定这两个文件的"行为契约"。
 *
 * 重构后只需把 import 路径改成新路径，测试应全部继续通过。
 */

import { describe, it, expect, beforeEach } from 'vitest';
<<<<<<< HEAD
import { generateFillerCharacter, resetNameIndex } from '@engine/character/characterGen';
import { Registry } from '@engine/utils/registries';
=======
import { generateFillerCharacter, resetNameIndex } from '@data/characterGen';
import { Registry } from '@data/registries';
>>>>>>> 649782b93a3eead49926567b09c7206751f66480

// ─────────────────────────────────────────────────────────────────
// 1. generateFillerCharacter — 确定性生成契约
// ─────────────────────────────────────────────────────────────────
describe('generateFillerCharacter', () => {
  beforeEach(() => {
    // 每个测试前重置名字索引，保证生成结果可预测
    resetNameIndex();
  });

  it('应返回包含正确 id 的角色对象', () => {
    const char = generateFillerCharacter({
      id: 'char-test-001',
      rankLevel: 3,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    expect(char.id).toBe('char-test-001');
  });

  it('应设置 isPlayer 为 false，isRuler 为 false', () => {
    const char = generateFillerCharacter({
      id: 'char-test-002',
      rankLevel: 3,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    expect(char.isPlayer).toBe(false);
    expect(char.isRuler).toBe(false);
  });

  it('应将 official.rankLevel 设置为传入的 rankLevel', () => {
    const char = generateFillerCharacter({
      id: 'char-test-003',
      rankLevel: 5,
      overlordId: 'char-yizong',
      isCivil: false,
    });
    expect(char.official?.rankLevel).toBe(5);
  });

  it('应将 official.isCivil 设置为传入的 isCivil', () => {
    const civil = generateFillerCharacter({
      id: 'char-test-004',
      rankLevel: 4,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    const military = generateFillerCharacter({
      id: 'char-test-005',
      rankLevel: 4,
      overlordId: 'char-yizong',
      isCivil: false,
    });
    expect(civil.official?.isCivil).toBe(true);
    expect(military.official?.isCivil).toBe(false);
  });

  it('相同 id 应生成相同的能力值（确定性）', () => {
    resetNameIndex();
    const char1 = generateFillerCharacter({
      id: 'char-deterministic',
      rankLevel: 3,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    resetNameIndex();
    const char2 = generateFillerCharacter({
      id: 'char-deterministic',
      rankLevel: 3,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    expect(char1.abilities).toEqual(char2.abilities);
    expect(char1.birthYear).toBe(char2.birthYear);
  });

  it('能力值应在合法范围内（5~18）', () => {
    const char = generateFillerCharacter({
      id: 'char-range-check',
      rankLevel: 3,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    const { military, administration, strategy, diplomacy, scholarship } = char.abilities;
    for (const val of [military, administration, strategy, diplomacy, scholarship]) {
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(18);
    }
  });

  it('health 应在合法范围内（80~100）', () => {
    const char = generateFillerCharacter({
      id: 'char-health-check',
      rankLevel: 3,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    expect(char.health).toBeGreaterThanOrEqual(80);
    expect(char.health).toBeLessThanOrEqual(100);
  });

  it('birthYear 应在默认范围内（815~840）', () => {
    const char = generateFillerCharacter({
      id: 'char-birth-check',
      rankLevel: 3,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    expect(char.birthYear).toBeGreaterThanOrEqual(815);
    expect(char.birthYear).toBeLessThanOrEqual(840);
  });

  it('应支持自定义 birthYear 范围', () => {
    const char = generateFillerCharacter({
      id: 'char-custom-birth',
      rankLevel: 3,
      overlordId: 'char-yizong',
      isCivil: true,
      birthYearMin: 820,
      birthYearMax: 825,
    });
    expect(char.birthYear).toBeGreaterThanOrEqual(820);
    expect(char.birthYear).toBeLessThanOrEqual(825);
  });

  it('初始资源应与 rankLevel 正相关', () => {
    resetNameIndex();
    const low = generateFillerCharacter({
      id: 'char-rank-low',
      rankLevel: 1,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    resetNameIndex();
    const high = generateFillerCharacter({
      id: 'char-rank-high',
      rankLevel: 9,
      overlordId: 'char-yizong',
      isCivil: true,
    });
    expect(high.resources.money).toBeGreaterThan(low.resources.money);
    expect(high.resources.grain).toBeGreaterThan(low.resources.grain);
  });
});

// ─────────────────────────────────────────────────────────────────
// 2. Registry<T> — 通用注册表契约
// ─────────────────────────────────────────────────────────────────
describe('Registry', () => {
  interface Item { id: string; value: number }

  it('register 后 get 应返回相同对象', () => {
    const reg = new Registry<Item>();
    const item = { id: 'a', value: 42 };
    reg.register('a', item);
    expect(reg.get('a')).toBe(item);
  });

  it('get 不存在的 key 应返回 undefined', () => {
    const reg = new Registry<Item>();
    expect(reg.get('nonexistent')).toBeUndefined();
  });

  it('has 应正确反映注册状态', () => {
    const reg = new Registry<Item>();
    expect(reg.has('x')).toBe(false);
    reg.register('x', { id: 'x', value: 1 });
    expect(reg.has('x')).toBe(true);
  });

  it('getAll 应返回所有已注册条目', () => {
    const reg = new Registry<Item>();
    reg.register('a', { id: 'a', value: 1 });
    reg.register('b', { id: 'b', value: 2 });
    const all = reg.getAll();
    expect(all.size).toBe(2);
    expect(all.get('a')?.value).toBe(1);
    expect(all.get('b')?.value).toBe(2);
  });

  it('重复 register 同一 key 应覆盖旧值', () => {
    const reg = new Registry<Item>();
    reg.register('a', { id: 'a', value: 1 });
    reg.register('a', { id: 'a', value: 99 });
    expect(reg.get('a')?.value).toBe(99);
  });
});
