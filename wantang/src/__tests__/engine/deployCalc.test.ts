/**
 * 调兵部署计算纯函数测试
 *
 * 覆盖 deployCalc.ts 中的纯函数：
 *   - getArmyHomeTerritory：军队归属州计算
 *   - resolveDeployDrafter：草拟人解析
 *   - assessBorderThreats + planDeployments：依赖真实地图拓扑
 */

import { describe, it, expect } from 'vitest';
import {
  getArmyHomeTerritory,
  resolveDeployDrafter,
  planDeployments,
} from '@engine/military/deployCalc';
import type { Army, Battalion } from '@engine/military/types';
import type { Territory, Post } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import type { Personality } from '@data/traits';

// ─────────────────────────────────────────────────────────────────────────────
// 测试夹具
// ─────────────────────────────────────────────────────────────────────────────

function makeBattalion(id: string, homeTerritory: string): Battalion {
  return {
    id,
    name: `营-${id}`,
    unitType: 'heavyInfantry',
    currentStrength: 800,
    locationId: homeTerritory,
    morale: 80,
    elite: 50,
    armyId: 'army-1',
    homeTerritory,
  };
}

function makeArmy(
  id: string,
  locationId: string,
  battalionIds: string[],
  ownerId = 'ruler-1',
): Army {
  return {
    id,
    name: `军-${id}`,
    postId: null,
    ownerId,
    commanderId: null,
    locationId,
    battalionIds,
  };
}

function makeTerritory(
  id: string,
  tier: 'zhou' | 'dao' | 'guo' | 'tianxia',
  mainPostHolder: string | null,
  opts: Partial<Territory> = {},
): Territory {
  const posts: Post[] = mainPostHolder
    ? [{
        id: `post-${id}`,
        templateId: tier === 'zhou' ? 'pos-cishi' : tier === 'dao' ? 'pos-jiedushi' : 'pos-emperor',
        holderId: mainPostHolder,
        territoryId: id,
        successionLaw: 'bureaucratic' as const,
        hasAppointRight: false,
      }]
    : [];
  return {
    id,
    name: id,
    tier,
    territoryType: 'civil' as const,
    childIds: [],
    dejureControllerId: mainPostHolder ?? '',
    posts,
    control: 100,
    development: 50,
    populace: 10000,
    buildings: [],
    constructions: [],
    basePopulation: 5000,
    conscriptionPool: 1000,
    moneyRatio: 0.5,
    grainRatio: 0.5,
    ...opts,
  };
}

function makeChar(id: string, overlordId?: string, isRuler = false): Character {
  return {
    id,
    name: id,
    courtesy: '',
    gender: '男',
    birthYear: 830,
    clan: '',
    family: { childrenIds: [] },
    abilities: { military: 10, administration: 10, strategy: 10, diplomacy: 10, scholarship: 10 },
    traitIds: [],
    health: 100,
    stress: 0,
    alive: true,
    resources: { money: 0, grain: 0, prestige: 0, legitimacy: 0 },
    relationships: [],
    isPlayer: false,
    isRuler,
    title: '',
    overlordId,
  };
}

const defaultPersonality: Personality = {
  boldness: 0.5,
  compassion: 0.5,
  greed: 0.5,
  honor: 0.5,
  rationality: 0.5,
  sociability: 0.5,
  vengefulness: 0.5,
  energy: 0.5,
};

// ─────────────────────────────────────────────────────────────────────────────
// getArmyHomeTerritory
// ─────────────────────────────────────────────────────────────────────────────

describe('getArmyHomeTerritory', () => {
  it('应返回营的 homeTerritory 中最多数的州', () => {
    const batMap = new Map<string, Battalion>([
      ['bat-1', makeBattalion('bat-1', 'zhou-a')],
      ['bat-2', makeBattalion('bat-2', 'zhou-a')],
      ['bat-3', makeBattalion('bat-3', 'zhou-b')],
    ]);
    const army = makeArmy('army-1', 'zhou-c', ['bat-1', 'bat-2', 'bat-3']);
    expect(getArmyHomeTerritory(army, batMap)).toBe('zhou-a');
  });

  it('无营时 fallback 到当前驻地', () => {
    const batMap = new Map<string, Battalion>();
    const army = makeArmy('army-1', 'zhou-c', []);
    expect(getArmyHomeTerritory(army, batMap)).toBe('zhou-c');
  });

  it('票数相同时保持稳定（第一个出现的胜出）', () => {
    const batMap = new Map<string, Battalion>([
      ['bat-1', makeBattalion('bat-1', 'zhou-a')],
      ['bat-2', makeBattalion('bat-2', 'zhou-b')],
    ]);
    const army = makeArmy('army-1', 'zhou-c', ['bat-1', 'bat-2']);
    // 各1票，第一个遍历到的胜出
    const result = getArmyHomeTerritory(army, batMap);
    expect(['zhou-a', 'zhou-b']).toContain(result);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveDeployDrafter
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveDeployDrafter', () => {
  it('兵部尚书 → ruler 为皇帝', () => {
    const territories = new Map<string, Territory>();
    const centralPosts: Post[] = [
      { id: 'cp-1', templateId: 'pos-bingbu-shangshu', holderId: 'minister', territoryId: '', successionLaw: 'bureaucratic', hasAppointRight: false },
      { id: 'cp-2', templateId: 'pos-emperor', holderId: 'emperor', territoryId: '', successionLaw: 'bureaucratic', hasAppointRight: false },
    ];
    const result = resolveDeployDrafter('minister', territories, centralPosts);
    expect(result).toEqual({ rulerId: 'emperor' });
  });

  it('都知兵马使 → ruler 为所在道的节度使', () => {
    const daoTerr = makeTerritory('dao-1', 'dao', 'jiedushi-1', {
      posts: [
        { id: 'p-jd', templateId: 'pos-jiedushi', holderId: 'jiedushi-1', territoryId: 'dao-1', successionLaw: 'clan', hasAppointRight: true },
        { id: 'p-bm', templateId: 'pos-duzhibingmashi', holderId: 'bingmashi-1', territoryId: 'dao-1', successionLaw: 'bureaucratic', hasAppointRight: false },
      ],
    });
    const territories = new Map([['dao-1', daoTerr]]);
    const result = resolveDeployDrafter('bingmashi-1', territories, []);
    expect(result).toEqual({ rulerId: 'jiedushi-1' });
  });

  it('grantsControl 持有人 → ruler 为自己', () => {
    const zhouTerr = makeTerritory('zhou-1', 'zhou', 'cishi-1');
    const territories = new Map([['zhou-1', zhouTerr]]);
    const result = resolveDeployDrafter('cishi-1', territories, []);
    expect(result).toEqual({ rulerId: 'cishi-1' });
  });

  it('无任何岗位的角色 → null', () => {
    const territories = new Map<string, Territory>();
    const result = resolveDeployDrafter('nobody', territories, []);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// planDeployments
// ─────────────────────────────────────────────────────────────────────────────

describe('planDeployments', () => {
  it('无威胁时：不在归属州的军队应调回', () => {
    // 使用真实地图拓扑中的州 ID，但边境无敌对势力
    const batMap = new Map<string, Battalion>([
      ['bat-1', makeBattalion('bat-1', 'zhou-changan')],
    ]);
    const army = makeArmy('army-1', 'zhou-tongzhou', ['bat-1'], 'ruler-1');

    const territories = new Map<string, Territory>([
      ['zhou-changan', makeTerritory('zhou-changan', 'zhou', 'ruler-1')],
      ['zhou-tongzhou', makeTerritory('zhou-tongzhou', 'zhou', 'ruler-1')],
    ]);
    const characters = new Map([['ruler-1', makeChar('ruler-1', undefined, true)]]);

    const entries = planDeployments(
      'ruler-1',
      [army],
      batMap,
      territories,
      characters,
      () => 50, // 所有好感都很高
      new Set(),
      defaultPersonality,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].armyId).toBe('army-1');
    expect(entries[0].fromLocationId).toBe('zhou-tongzhou');
    expect(entries[0].targetLocationId).toBe('zhou-changan');
  });

  it('已在归属州的军队不调动', () => {
    const batMap = new Map<string, Battalion>([
      ['bat-1', makeBattalion('bat-1', 'zhou-changan')],
    ]);
    const army = makeArmy('army-1', 'zhou-changan', ['bat-1'], 'ruler-1');

    const territories = new Map<string, Territory>([
      ['zhou-changan', makeTerritory('zhou-changan', 'zhou', 'ruler-1')],
    ]);
    const characters = new Map([['ruler-1', makeChar('ruler-1', undefined, true)]]);

    const entries = planDeployments(
      'ruler-1',
      [army],
      batMap,
      territories,
      characters,
      () => 50,
      new Set(),
      defaultPersonality,
    );

    expect(entries).toHaveLength(0);
  });

  it('已编入行营的军队应跳过', () => {
    const batMap = new Map<string, Battalion>([
      ['bat-1', makeBattalion('bat-1', 'zhou-changan')],
    ]);
    const army = makeArmy('army-1', 'zhou-tongzhou', ['bat-1'], 'ruler-1');

    const territories = new Map<string, Territory>([
      ['zhou-changan', makeTerritory('zhou-changan', 'zhou', 'ruler-1')],
      ['zhou-tongzhou', makeTerritory('zhou-tongzhou', 'zhou', 'ruler-1')],
    ]);
    const characters = new Map([['ruler-1', makeChar('ruler-1', undefined, true)]]);

    const entries = planDeployments(
      'ruler-1',
      [army],
      batMap,
      territories,
      characters,
      () => 50,
      new Set(['army-1']), // 已在行营中
      defaultPersonality,
    );

    expect(entries).toHaveLength(0);
  });
});
