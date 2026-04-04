// ===== 岗位管理计算纯函数测试 =====

import { describe, it, expect } from 'vitest';
import type { Territory, Post } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import type { War } from '@engine/military/types';
import { Era } from '@engine/types';
import {
  isInActorRealm,
  calcRealmControlRatio,
  canCreatePost,
  canCreateEmperor,
  canUsurpPost,
  canDestroyPost,
  calcPostManageCost,
} from '@engine/official/postManageCalc';

// ── 测试数据工厂 ──────────────────────────────────────────────

function makeChar(id: string, overlordId?: string): Character {
  return {
    id, name: id, courtesy: '', gender: 'male', birthYear: 840,
    clan: 'test', family: { fatherId: null, motherId: null, spouseId: null, childIds: [] },
    abilities: { military: 50, administration: 50, diplomacy: 50, intrigue: 50, learning: 50 },
    traitIds: [], alive: true, overlordId, isRuler: false,
    official: { rankLevel: 17, salary: { money: 0, grain: 0 } },
    resources: { money: 1000, grain: 1000, prestige: 500, legitimacy: 80 },
    opinions: [],
  } as unknown as Character;
}

function makeTerritory(
  id: string,
  tier: Territory['tier'],
  childIds: string[] = [],
  posts: Post[] = [],
  type: Territory['territoryType'] = 'military',
): Territory {
  return {
    id, name: id, tier, territoryType: type,
    childIds, posts,
    parentId: undefined, control: 50, development: 50, populace: 50,
    buildings: [], constructions: [], basePopulation: 10000, conscriptionPool: 1000,
    moneyRatio: 0.5, grainRatio: 0.5, dejureControllerId: '',
  } as Territory;
}

function makePost(id: string, templateId: string, holderId: string | null, territoryId?: string): Post {
  return {
    id, templateId, holderId, territoryId,
    successionLaw: 'clan' as const, hasAppointRight: true,
  };
}

// ── isInActorRealm ────────────────────────────────────────────

describe('isInActorRealm', () => {
  it('自身属于自己势力', () => {
    const chars = new Map([['a', makeChar('a')]]);
    expect(isInActorRealm('a', 'a', chars)).toBe(true);
  });

  it('直接附庸属于领主势力', () => {
    const chars = new Map([
      ['lord', makeChar('lord')],
      ['vassal', makeChar('vassal', 'lord')],
    ]);
    expect(isInActorRealm('vassal', 'lord', chars)).toBe(true);
  });

  it('二级附庸属于顶层领主势力', () => {
    const chars = new Map([
      ['king', makeChar('king')],
      ['duke', makeChar('duke', 'king')],
      ['count', makeChar('count', 'duke')],
    ]);
    expect(isInActorRealm('count', 'king', chars)).toBe(true);
  });

  it('无关角色不属于势力', () => {
    const chars = new Map([
      ['a', makeChar('a')],
      ['b', makeChar('b')],
    ]);
    expect(isInActorRealm('b', 'a', chars)).toBe(false);
  });

  it('超过最大深度返回 false', () => {
    const chars = new Map([
      ['a', makeChar('a')],
      ['b', makeChar('b', 'a')],
    ]);
    expect(isInActorRealm('b', 'a', chars, 0)).toBe(false);
  });
});

// ── calcRealmControlRatio ─────────────────────────────────────

describe('calcRealmControlRatio', () => {
  it('guo → dao → zhou，actor 控制 3/5 个 zhou → 0.6', () => {
    const territories = new Map<string, Territory>();
    // guo 有 2 个 dao，dao-1 有 3 个 zhou，dao-2 有 2 个 zhou = 5 zhou 总计
    territories.set('guo-1', makeTerritory('guo-1', 'guo', ['dao-1', 'dao-2']));
    territories.set('dao-1', makeTerritory('dao-1', 'dao', ['z1', 'z2', 'z3']));
    territories.set('dao-2', makeTerritory('dao-2', 'dao', ['z4', 'z5']));
    // actor 控制 z1, z2, z3（3个），enemy 控制 z4, z5（2个）
    territories.set('z1', makeTerritory('z1', 'zhou', [], [makePost('p1', 'pos-cishi', 'actor', 'z1')]));
    territories.set('z2', makeTerritory('z2', 'zhou', [], [makePost('p2', 'pos-cishi', 'actor', 'z2')]));
    territories.set('z3', makeTerritory('z3', 'zhou', [], [makePost('p3', 'pos-cishi', 'vassal1', 'z3')]));
    territories.set('z4', makeTerritory('z4', 'zhou', [], [makePost('p4', 'pos-cishi', 'enemy1', 'z4')]));
    territories.set('z5', makeTerritory('z5', 'zhou', [], [makePost('p5', 'pos-cishi', 'enemy2', 'z5')]));

    const chars = new Map<string, Character>();
    chars.set('actor', makeChar('actor'));
    chars.set('vassal1', makeChar('vassal1', 'actor'));
    chars.set('enemy1', makeChar('enemy1'));
    chars.set('enemy2', makeChar('enemy2'));

    expect(calcRealmControlRatio('guo-1', 'actor', territories, chars)).toBe(0.6);
  });

  it('无法理 zhou 返回 0', () => {
    const territories = new Map<string, Territory>();
    territories.set('guo-1', makeTerritory('guo-1', 'guo', []));
    const chars = new Map<string, Character>();
    expect(calcRealmControlRatio('guo-1', 'actor', territories, chars)).toBe(0);
  });

  it('dao 级：全部 zhou 控制返回 1.0', () => {
    const territories = new Map<string, Territory>();
    territories.set('dao-parent', makeTerritory('dao-parent', 'dao', ['zhou-1', 'zhou-2']));
    territories.set('zhou-1', makeTerritory('zhou-1', 'zhou', [], [makePost('p1', 'pos-cishi', 'actor', 'zhou-1')]));
    territories.set('zhou-2', makeTerritory('zhou-2', 'zhou', [], [makePost('p2', 'pos-cishi', 'actor', 'zhou-2')]));

    const chars = new Map([['actor', makeChar('actor')]]);
    expect(calcRealmControlRatio('dao-parent', 'actor', territories, chars)).toBe(1);
  });

  it('guo 级：跨道统计 zhou，不要求控制 dao 头衔', () => {
    const territories = new Map<string, Territory>();
    // 2 个 dao 各 2 个 zhou = 4 zhou 总计
    territories.set('guo-1', makeTerritory('guo-1', 'guo', ['dao-1', 'dao-2']));
    territories.set('dao-1', makeTerritory('dao-1', 'dao', ['z1', 'z2']));
    territories.set('dao-2', makeTerritory('dao-2', 'dao', ['z3', 'z4']));
    // actor 控制 dao-1 的 z1 + dao-2 的 z3 = 跨道控制 2/4 zhou，但不持有任何 dao 头衔
    territories.set('z1', makeTerritory('z1', 'zhou', [], [makePost('p1', 'pos-cishi', 'actor', 'z1')]));
    territories.set('z2', makeTerritory('z2', 'zhou', [], [makePost('p2', 'pos-cishi', 'enemy', 'z2')]));
    territories.set('z3', makeTerritory('z3', 'zhou', [], [makePost('p3', 'pos-cishi', 'actor', 'z3')]));
    territories.set('z4', makeTerritory('z4', 'zhou', [], [makePost('p4', 'pos-cishi', 'enemy', 'z4')]));

    const chars = new Map([['actor', makeChar('actor')], ['enemy', makeChar('enemy')]]);
    expect(calcRealmControlRatio('guo-1', 'actor', territories, chars)).toBe(0.5);
  });
});

// ── canCreatePost ─────────────────────────────────────────────

describe('canCreatePost', () => {
  it('满足条件时返回 eligible: true', () => {
    const territories = new Map<string, Territory>();
    territories.set('guo-1', makeTerritory('guo-1', 'guo', ['dao-1']));
    territories.set('dao-1', makeTerritory('dao-1', 'dao', ['z1', 'z2']));
    territories.set('z1', makeTerritory('z1', 'zhou', [], [makePost('p1', 'pos-cishi', 'actor', 'z1')]));
    territories.set('z2', makeTerritory('z2', 'zhou', [], [makePost('p2', 'pos-cishi', 'actor', 'z2')]));

    const chars = new Map([['actor', makeChar('actor')]]);
    const result = canCreatePost('actor', 'guo-1', territories, chars);
    expect(result.eligible).toBe(true);
  });

  it('控制比例不足时返回 eligible: false', () => {
    const territories = new Map<string, Territory>();
    territories.set('guo-1', makeTerritory('guo-1', 'guo', ['dao-1']));
    territories.set('dao-1', makeTerritory('dao-1', 'dao', ['z1', 'z2', 'z3']));
    territories.set('z1', makeTerritory('z1', 'zhou', [], [makePost('p1', 'pos-cishi', 'actor', 'z1')]));
    territories.set('z2', makeTerritory('z2', 'zhou', [], [makePost('p2', 'pos-cishi', 'other', 'z2')]));
    territories.set('z3', makeTerritory('z3', 'zhou', [], [makePost('p3', 'pos-cishi', 'other2', 'z3')]));

    const chars = new Map([
      ['actor', makeChar('actor')],
      ['other', makeChar('other')],
      ['other2', makeChar('other2')],
    ]);
    const result = canCreatePost('actor', 'guo-1', territories, chars);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('控制比例不足');
  });

  it('guo 已有主岗位时返回 eligible: false', () => {
    const territories = new Map<string, Territory>();
    const guoPost = makePost('p-guo', 'pos-wang', 'other', 'guo-1');
    territories.set('guo-1', makeTerritory('guo-1', 'guo', ['dao-1'], [guoPost]));
    territories.set('dao-1', makeTerritory('dao-1', 'dao', ['z1']));
    territories.set('z1', makeTerritory('z1', 'zhou', [], [makePost('p1', 'pos-cishi', 'actor', 'z1')]));

    const chars = new Map([
      ['actor', makeChar('actor')],
      ['other', makeChar('other')],
    ]);
    const result = canCreatePost('actor', 'guo-1', territories, chars);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('该领地已有主岗位');
  });
});

// ── canCreateEmperor ──────────────────────────────────────────

describe('canCreateEmperor', () => {
  it('非乱世返回 ineligible', () => {
    const territories = new Map<string, Territory>();
    const chars = new Map<string, Character>();
    expect(canCreateEmperor('actor', territories, chars, Era.ZhiShi).eligible).toBe(false);
    expect(canCreateEmperor('actor', territories, chars, Era.WeiShi).eligible).toBe(false);
  });
});

// ── canUsurpPost ──────────────────────────────────────────────

describe('canUsurpPost', () => {
  it('满足条件返回 eligible: true', () => {
    const post = makePost('p-dao', 'pos-jiedushi', 'defender', 'dao-1');
    const territories = new Map<string, Territory>();
    territories.set('dao-1', makeTerritory('dao-1', 'dao', ['zhou-1', 'zhou-2'], [post]));
    territories.set('zhou-1', makeTerritory('zhou-1', 'zhou', [], [makePost('z1', 'pos-cishi', 'actor', 'zhou-1')]));
    territories.set('zhou-2', makeTerritory('zhou-2', 'zhou', [], [makePost('z2', 'pos-cishi', 'actor', 'zhou-2')]));

    const chars = new Map([
      ['actor', makeChar('actor')],
      ['defender', makeChar('defender')],
    ]);
    const dao = territories.get('dao-1')!;
    const result = canUsurpPost('actor', post, dao, territories, chars, []);
    expect(result.eligible).toBe(true);
  });

  it('与持有者交战中返回 ineligible', () => {
    const post = makePost('p-dao', 'pos-jiedushi', 'defender', 'dao-1');
    const territories = new Map<string, Territory>();
    territories.set('dao-1', makeTerritory('dao-1', 'dao', ['zhou-1'], [post]));
    territories.set('zhou-1', makeTerritory('zhou-1', 'zhou', [], [makePost('z1', 'pos-cishi', 'actor', 'zhou-1')]));

    const chars = new Map([
      ['actor', makeChar('actor')],
      ['defender', makeChar('defender')],
    ]);

    const activeWar: War = {
      id: 'w1', attackerId: 'actor', defenderId: 'defender',
      attackerParticipants: [], defenderParticipants: [],
      casusBelli: 'annexation', targetTerritoryIds: [],
      warScore: 0, startDate: { year: 867, month: 1, day: 1 }, status: 'active',
    };
    const dao = territories.get('dao-1')!;
    const result = canUsurpPost('actor', post, dao, territories, chars, [activeWar]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('不能篡夺正在交战的对手');
  });
});

// ── canDestroyPost ────────────────────────────────────────────

describe('canDestroyPost', () => {
  it('持有多个主岗位时可销毁非唯一的', () => {
    const post1 = makePost('p1', 'pos-wang', 'actor', 'guo-1');
    const post2 = makePost('p2', 'pos-jiedushi', 'actor', 'dao-1');
    const result = canDestroyPost('actor', post1, [post1, post2]);
    expect(result.eligible).toBe(true);
  });

  it('唯一主岗位不可销毁', () => {
    const post1 = makePost('p1', 'pos-wang', 'actor', 'guo-1');
    const result = canDestroyPost('actor', post1, [post1]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('不能销毁唯一的主岗位');
  });

  it('非 guo 级岗位不可销毁', () => {
    const post = makePost('p1', 'pos-jiedushi', 'actor', 'dao-1');
    const result = canDestroyPost('actor', post, [post, makePost('p2', 'pos-wang', 'actor', 'guo-1')]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('只能销毁国级岗位');
  });
});

// ── calcPostManageCost ────────────────────────────────────────

describe('calcPostManageCost', () => {
  it('创建国级费用', () => {
    const cost = calcPostManageCost('create', 'guo');
    expect(cost.money).toBe(500_000);
    expect(cost.prestige).toBe(200);
  });

  it('称帝费用', () => {
    const cost = calcPostManageCost('createEmperor', 'tianxia');
    expect(cost.money).toBe(1_000_000);
    expect(cost.prestige).toBe(500);
  });

  it('篡夺国级费用', () => {
    const cost = calcPostManageCost('usurp', 'guo');
    expect(cost.money).toBe(400_000);
    expect(cost.prestige).toBe(150);
  });

  it('篡夺道级费用', () => {
    const cost = calcPostManageCost('usurp', 'dao');
    expect(cost.money).toBe(200_000);
    expect(cost.prestige).toBe(100);
  });

  it('销毁费用', () => {
    const cost = calcPostManageCost('destroy', 'guo');
    expect(cost.money).toBe(0);
    expect(cost.prestige).toBe(100);
  });
});
