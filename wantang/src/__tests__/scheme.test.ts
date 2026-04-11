/**
 * 计谋系统 — Store / 守卫 / 死亡终止 / execute 契约 测试
 *
 * 覆盖白名单第 4 类（execute 契约 stale）+ 部分白名单第 1 类（round-trip）：
 * 1. SchemeStore CRUD + 反向索引重建
 * 2. parseParams 守卫严格性
 * 3. 死亡终止：参与者死亡 → status='terminated'
 * 4. cancelScheme 仅允许玩家取消自己的计谋
 *
 * 不覆盖（需要全套 sample data）：
 * - 完整 executeInitiateScheme（依赖 territory/calculateBaseOpinion）
 * - NPC 行为权重（依赖完整 NpcContext）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSchemeStore } from '@engine/scheme/SchemeStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { runSchemeSystem } from '@engine/scheme/schemeSystem';
import { calcSchemeLimit, getFuzzySuccess } from '@engine/scheme/schemeCalc';
import type { SchemeInstance } from '@engine/scheme/types';
import type { Character } from '@engine/character/types';
// 触发 scheme types 自注册（让 getSchemeType 可用）
import '@data/schemes';
import { getSchemeType } from '@engine/scheme/registry';

// ── 测试辅助 ──────────────────────────────────────

function makeMinimalCharacter(id: string, overrides: Partial<Character> = {}): Character {
  return {
    id,
    name: id,
    courtesy: '',
    gender: '男',
    birthYear: 840,
    clan: '李',
    family: { childrenIds: [] },
    abilities: { military: 10, administration: 10, strategy: 10, diplomacy: 10, scholarship: 10 },
    traitIds: [],
    health: 100,
    stress: 0,
    alive: true,
    resources: { money: 1000, grain: 1000, prestige: 100, legitimacy: 100 },
    relationships: [],
    redistributionRate: 0.5,
    isPlayer: false,
    isRuler: false,
    title: '',
    ...overrides,
  };
}

function makeBasicScheme(id: string, overrides: Partial<SchemeInstance> = {}): SchemeInstance {
  return {
    id,
    schemeTypeId: 'curryFavor',
    initiatorId: 'A',
    primaryTargetId: 'B',
    startDate: { year: 870, month: 1, day: 1 },
    status: 'active',
    phase: { current: 1, total: 1, progress: 0, phaseDuration: 90 },
    snapshot: {
      spymasterId: 'A',
      spymasterStrategy: 10,
      targetSpymasterId: 'B',
      targetSpymasterStrategy: 10,
      initialSuccessRate: 50,
    },
    currentSuccessRate: 50,
    data: { kind: 'curryFavor' },
    ...overrides,
  };
}

beforeEach(() => {
  useSchemeStore.setState({
    schemes: new Map(),
    initiatorIndex: new Map(),
    targetIndex: new Map(),
  });
});

// ── 1. SchemeStore CRUD + 索引 ─────────────────────

describe('SchemeStore CRUD', () => {
  it('addScheme 写入 schemes Map 和两个反向索引', () => {
    const s = makeBasicScheme('s1', { initiatorId: 'A', primaryTargetId: 'B' });
    useSchemeStore.getState().addScheme(s);

    expect(useSchemeStore.getState().schemes.size).toBe(1);
    expect(useSchemeStore.getState().initiatorIndex.get('A')?.has('s1')).toBe(true);
    expect(useSchemeStore.getState().targetIndex.get('B')?.has('s1')).toBe(true);
  });

  it('removeScheme 同时清两个索引（无残留键）', () => {
    const s = makeBasicScheme('s1', { initiatorId: 'A', primaryTargetId: 'B' });
    useSchemeStore.getState().addScheme(s);
    useSchemeStore.getState().removeScheme('s1');

    expect(useSchemeStore.getState().schemes.size).toBe(0);
    // size===0 时键应被删除
    expect(useSchemeStore.getState().initiatorIndex.has('A')).toBe(false);
    expect(useSchemeStore.getState().targetIndex.has('B')).toBe(false);
  });

  it('getActiveSchemeCount 只数 active', () => {
    useSchemeStore.getState().addScheme(makeBasicScheme('s1', { initiatorId: 'A' }));
    useSchemeStore.getState().addScheme(makeBasicScheme('s2', { initiatorId: 'A' }));
    useSchemeStore.getState().addScheme(makeBasicScheme('s3', { initiatorId: 'A', status: 'success' }));
    expect(useSchemeStore.getState().getActiveSchemeCount('A')).toBe(2);
  });

  it('getActiveSchemesByTarget 只返回 status==active 的', () => {
    useSchemeStore.getState().addScheme(makeBasicScheme('s1', { initiatorId: 'X', primaryTargetId: 'B' }));
    useSchemeStore.getState().addScheme(makeBasicScheme('s2', { initiatorId: 'Y', primaryTargetId: 'B', status: 'failure' }));
    const active = useSchemeStore.getState().getActiveSchemesByTarget('B');
    expect(active.length).toBe(1);
    expect(active[0].id).toBe('s1');
  });

  it('initSchemes 重建 schemes Map 和两个索引', () => {
    const list = [
      makeBasicScheme('s1', { initiatorId: 'A', primaryTargetId: 'B' }),
      makeBasicScheme('s2', { initiatorId: 'A', primaryTargetId: 'C' }),
      makeBasicScheme('s3', { initiatorId: 'D', primaryTargetId: 'B' }),
    ];
    useSchemeStore.getState().initSchemes(list);

    expect(useSchemeStore.getState().schemes.size).toBe(3);
    expect(useSchemeStore.getState().initiatorIndex.get('A')?.size).toBe(2);
    expect(useSchemeStore.getState().initiatorIndex.get('D')?.size).toBe(1);
    expect(useSchemeStore.getState().targetIndex.get('B')?.size).toBe(2);
    expect(useSchemeStore.getState().targetIndex.get('C')?.size).toBe(1);
  });
});

// ── 2. parseParams 守卫 ───────────────────────────

describe('parseParams 守卫严格性', () => {
  it('curryFavor: 缺失 primaryTargetId 返回 null', () => {
    const def = getSchemeType('curryFavor');
    expect(def).toBeDefined();
    expect(def!.parseParams(null)).toBeNull();
    expect(def!.parseParams({})).toBeNull();
    expect(def!.parseParams({ primaryTargetId: 123 })).toBeNull();   // 错类型
    expect(def!.parseParams({ primaryTargetId: 'X' })).toEqual({ primaryTargetId: 'X' });
  });

  it('alienation: 缺任一必填字段返回 null', () => {
    const def = getSchemeType('alienation');
    expect(def).toBeDefined();
    expect(def!.parseParams({ primaryTargetId: 'X' })).toBeNull();   // 缺 secondary/method
    expect(def!.parseParams({ primaryTargetId: 'X', secondaryTargetId: 'Y' })).toBeNull(); // 缺 method
    expect(def!.parseParams({ primaryTargetId: 'X', secondaryTargetId: 'Y', methodId: 'rumor' })).toEqual({
      primaryTargetId: 'X',
      secondaryTargetId: 'Y',
      methodId: 'rumor',
      customDescription: undefined,
      aiReasoning: undefined,
    });
  });

  it('alienation: 错误类型字段返回 null', () => {
    const def = getSchemeType('alienation');
    expect(def!.parseParams({
      primaryTargetId: 'X',
      secondaryTargetId: 123,                // 数字而非字符串
      methodId: 'rumor',
    })).toBeNull();
  });
});

// ── 3. 死亡终止（白名单第 4 类） ────────────────────

describe('schemeSystem 死亡终止', () => {
  it('primaryTarget 死亡 → status=terminated', () => {
    // 准备角色
    useCharacterStore.getState().initCharacters([
      makeMinimalCharacter('A'),
      makeMinimalCharacter('B', { alive: false }),  // 死人
    ]);

    const scheme = makeBasicScheme('s1', { initiatorId: 'A', primaryTargetId: 'B' });
    useSchemeStore.getState().addScheme(scheme);

    runSchemeSystem({ year: 870, month: 1, day: 2 });

    const after = useSchemeStore.getState().schemes.get('s1');
    expect(after?.status).toBe('terminated');
  });

  it('secondaryTarget 死亡（离间）→ status=terminated', () => {
    useCharacterStore.getState().initCharacters([
      makeMinimalCharacter('A'),
      makeMinimalCharacter('B'),
      makeMinimalCharacter('C', { alive: false }),  // 死的次要目标
    ]);

    const scheme: SchemeInstance = {
      id: 's2',
      schemeTypeId: 'alienation',
      initiatorId: 'A',
      primaryTargetId: 'B',
      startDate: { year: 870, month: 1, day: 1 },
      status: 'active',
      phase: { current: 1, total: 3, progress: 0, phaseDuration: 30 },
      snapshot: {
        spymasterId: 'A',
        spymasterStrategy: 12,
        targetSpymasterId: 'B',
        targetSpymasterStrategy: 10,
        initialSuccessRate: 35,
      },
      currentSuccessRate: 35,
      data: {
        kind: 'alienation',
        secondaryTargetId: 'C',
        methodId: 'rumor',
        methodBonus: 0,
      },
    };
    useSchemeStore.getState().addScheme(scheme);

    runSchemeSystem({ year: 870, month: 1, day: 2 });
    expect(useSchemeStore.getState().schemes.get('s2')?.status).toBe('terminated');
  });

  it('所有参与者活着 → 进度推进 1 天', () => {
    useCharacterStore.getState().initCharacters([
      makeMinimalCharacter('A'),
      makeMinimalCharacter('B'),
    ]);

    const scheme = makeBasicScheme('s3', { initiatorId: 'A', primaryTargetId: 'B' });
    useSchemeStore.getState().addScheme(scheme);

    runSchemeSystem({ year: 870, month: 1, day: 2 });
    const after = useSchemeStore.getState().schemes.get('s3');
    expect(after?.status).toBe('active');
    expect(after?.phase.progress).toBe(1);
  });
});

// ── 4. cancelScheme 权限 ──────────────────────────

describe('cancelScheme 权限', () => {
  it('非玩家发起的计谋不能取消', async () => {
    const { cancelScheme } = await import('@engine/interaction/schemeAction');
    useCharacterStore.getState().setPlayerId('player1');
    const scheme = makeBasicScheme('s1', { initiatorId: 'npc1', primaryTargetId: 'target1' });
    useSchemeStore.getState().addScheme(scheme);

    expect(cancelScheme('s1')).toBe(false);
    expect(useSchemeStore.getState().schemes.has('s1')).toBe(true);  // 未删除
  });

  it('玩家发起的 active 计谋可以取消', async () => {
    const { cancelScheme } = await import('@engine/interaction/schemeAction');
    useCharacterStore.getState().setPlayerId('player1');
    const scheme = makeBasicScheme('s1', { initiatorId: 'player1', primaryTargetId: 'target1' });
    useSchemeStore.getState().addScheme(scheme);

    expect(cancelScheme('s1')).toBe(true);
    expect(useSchemeStore.getState().schemes.has('s1')).toBe(false);
  });

  it('已结束的计谋不可取消', async () => {
    const { cancelScheme } = await import('@engine/interaction/schemeAction');
    useCharacterStore.getState().setPlayerId('player1');
    const scheme = makeBasicScheme('s1', {
      initiatorId: 'player1',
      primaryTargetId: 'target1',
      status: 'success',
    });
    useSchemeStore.getState().addScheme(scheme);

    expect(cancelScheme('s1')).toBe(false);
    expect(useSchemeStore.getState().schemes.has('s1')).toBe(true);
  });
});

// ── 5. 通用工具函数 ─────────────────────────────────

describe('schemeCalc 通用函数', () => {
  it('calcSchemeLimit: max(1, floor(strategy/8))', () => {
    expect(calcSchemeLimit(0)).toBe(1);
    expect(calcSchemeLimit(7)).toBe(1);
    expect(calcSchemeLimit(8)).toBe(1);
    expect(calcSchemeLimit(15)).toBe(1);
    expect(calcSchemeLimit(16)).toBe(2);
    expect(calcSchemeLimit(24)).toBe(3);
  });

  it('getFuzzySuccess: 谋略差 ≥ 12 显示精确百分比', () => {
    const f = getFuzzySuccess(20, 8, 67.5);
    expect(f).toEqual({ kind: 'exact', value: 68 });
  });

  it('getFuzzySuccess: 差 6-11 显示档位', () => {
    expect(getFuzzySuccess(15, 9, 80)).toEqual({ kind: 'tier', tier: '高' });
    expect(getFuzzySuccess(15, 9, 50)).toEqual({ kind: 'tier', tier: '中' });
    expect(getFuzzySuccess(15, 9, 30)).toEqual({ kind: 'tier', tier: '低' });
  });

  it('getFuzzySuccess: 差 0-5 显示偏高/偏低', () => {
    expect(getFuzzySuccess(12, 10, 60)).toEqual({ kind: 'rough', tier: '偏高' });
    expect(getFuzzySuccess(12, 10, 30)).toEqual({ kind: 'rough', tier: '偏低' });
  });

  it('getFuzzySuccess: 差 < 0 显示未知', () => {
    expect(getFuzzySuccess(8, 12, 60)).toEqual({ kind: 'unknown' });
  });
});
