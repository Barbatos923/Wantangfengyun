/**
 * 战斗引擎纯函数单元测试
 *
 * 覆盖 battleEngine.ts 中可独立测试的两个纯计算函数：
 *
 *   calcTacticalPower(strategy, commander, momentum)
 *     = clamp(strategy.basePower × abilityCoeff × momentum, 0, 2)
 *     其中 abilityCoeff = 0.5 + abilityValue × 0.05
 *
 *   calcMilitaryPower(armyIds, armies, battalions, characters, phase)
 *     = Σ(strength × phaseValue × eliteBonus × moraleCoeff × leaderBonus)
 *     其中 phaseValue = 加权的兵种属性
 *          eliteBonus = 1 + elite/200
 *          moraleCoeff = 0.5 + morale/100 × 0.5
 *          leaderBonus = 1 + (commanderMilitary - 10) × 0.02
 *
 * 注意：drawStrategies 和 resolveBattle 依赖随机数 / 完整游戏状态，不在此处测试。
 */

import { describe, it, expect } from 'vitest';
import { calcTacticalPower, calcMilitaryPower } from '@engine/military/battleEngine';
import type { StrategyDef } from '@data/strategies';
import type { Character } from '@engine/character/types';
import type { Army, Battalion } from '@engine/military/types';

// ─────────────────────────────────────────────────────────────────────────────
// 测试夹具
// ─────────────────────────────────────────────────────────────────────────────

/** 构造最小合法 Character（traitIds=[] ⟹ getEffectiveAbilities 直接返回 abilities） */
function makeChar(military = 10, overrides: Partial<Character['abilities']> = {}): Character {
  return {
    id: 'char-test',
    name: 'Test',
    courtesy: '',
    gender: '男',
    birthYear: 830,
    clan: '',
    family: { childrenIds: [] },
    abilities: {
      military,
      administration: 10,
      strategy: 10,
      diplomacy: 10,
      scholarship: 10,
      ...overrides,
    },
    traitIds: [],    // 无特质 → 能力值不做任何修正
    health: 100,
    stress: 0,
    alive: true,
    resources: { money: 0, grain: 0, prestige: 0, legitimacy: 0 },
    relationships: [],
    isPlayer: false,
    isRuler: false,
    title: '',
    redistributionRate: 60,
  };
}

/** 构造最小 StrategyDef */
function makeStrategy(
  id: string,
  basePower: number,
  abilityDependency: keyof Character['abilities'] = 'military',
): StrategyDef {
  return {
    id,
    name: id,
    basePower,
    personalityWeights: {},
    abilityDependency,
    phases: ['clash'],
    narratives: { win: 'win', lose: 'lose' },
  };
}

/** 构造 Battalion，默认满编满士气、精锐度 0 */
function makeBattalion(
  id: string,
  armyId: string,
  unitType: Battalion['unitType'] = 'heavyInfantry',
  strength = 1000,
  morale = 100,
  elite = 0,
): Battalion {
  return {
    id,
    name: id,
    unitType,
    currentStrength: strength,
    homeTerritory: 'zhou-test',
    locationId: 'zhou-test',
    morale,
    elite,
    armyId,
  };
}

/** 构造 Army */
function makeArmy(id: string, battalionIds: string[], commanderId: string | null = null): Army {
  return {
    id,
    name: id,
    postId: null,
    ownerId: 'char-test',
    commanderId,
    locationId: 'zhou-test',
    battalionIds,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// calcTacticalPower
// ─────────────────────────────────────────────────────────────────────────────

describe('calcTacticalPower', () => {
  it('标准情况：basePower=1.0, military=10, momentum=1.0 → 1.0', () => {
    // abilityCoeff = 0.5 + 10*0.05 = 1.0
    // result = 1.0 * 1.0 * 1.0 = 1.0
    const strategy = makeStrategy('s', 1.0);
    const commander = makeChar(10);
    expect(calcTacticalPower(strategy, commander, 1.0)).toBeCloseTo(1.0);
  });

  it('military=0 → abilityCoeff=0.5 → result=0.5', () => {
    const strategy = makeStrategy('s', 1.0);
    const commander = makeChar(0);
    expect(calcTacticalPower(strategy, commander, 1.0)).toBeCloseTo(0.5);
  });

  it('military=20 → abilityCoeff=1.5 → result=1.5', () => {
    const strategy = makeStrategy('s', 1.0);
    const commander = makeChar(20);
    expect(calcTacticalPower(strategy, commander, 1.0)).toBeCloseTo(1.5);
  });

  it('momentum 加成：momentum=1.5, military=10 → result=1.5', () => {
    const strategy = makeStrategy('s', 1.0);
    const commander = makeChar(10);
    expect(calcTacticalPower(strategy, commander, 1.5)).toBeCloseTo(1.5);
  });

  it('momentum 削减：momentum=0.7, military=10 → result=0.7', () => {
    const strategy = makeStrategy('s', 1.0);
    const commander = makeChar(10);
    expect(calcTacticalPower(strategy, commander, 0.7)).toBeCloseTo(0.7);
  });

  it('上限裁剪：超过 2.0 时应裁剪为 2.0', () => {
    // basePower=1.5, military=30 → abilityCoeff=2.0 → raw=3.0 → clamped=2.0
    const strategy = makeStrategy('s', 1.5);
    const commander = makeChar(30);
    expect(calcTacticalPower(strategy, commander, 1.0)).toBeCloseTo(2.0);
  });

  it('下限裁剪：负值应裁剪为 0', () => {
    // basePower=-1.0 → raw 为负 → clamped=0
    const strategy = makeStrategy('s', -1.0);
    const commander = makeChar(10);
    expect(calcTacticalPower(strategy, commander, 1.0)).toBeCloseTo(0);
  });

  it('依赖 strategy 字段（strategy abilityDependency=administration）', () => {
    // abilityCoeff = 0.5 + 20*0.05 = 1.5，以 admin=20 计算
    const strategy = makeStrategy('s', 1.0, 'administration');
    const commander = makeChar(10, { administration: 20 });
    expect(calcTacticalPower(strategy, commander, 1.0)).toBeCloseTo(1.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcMilitaryPower
// ─────────────────────────────────────────────────────────────────────────────

describe('calcMilitaryPower', () => {
  it('无军队 → 0', () => {
    expect(calcMilitaryPower([], new Map(), new Map(), new Map(), 'clash')).toBe(0);
  });

  it('兵力=0 的营不计入战力', () => {
    const bat = makeBattalion('b1', 'a1', 'heavyInfantry', 0);
    const army = makeArmy('a1', ['b1']);
    const armies = new Map([['a1', army]]);
    const battalions = new Map([['b1', bat]]);
    expect(calcMilitaryPower(['a1'], armies, battalions, new Map(), 'clash')).toBe(0);
  });

  it('deploy 阶段，重步兵 1000人，满士气，无精锐，将领military=10 → 7600', () => {
    // heavyInfantry: charge=6, breach=8, pursuit=2, siege=4
    // deploy weights: charge=0.2, breach=0.8, pursuit=0, siege=0
    // phaseValue = 6*0.2 + 8*0.8 = 1.2 + 6.4 = 7.6
    // eliteBonus = 1 + 0/200 = 1.0
    // moraleCoeff = 0.5 + 100/100 * 0.5 = 1.0
    // leaderBonus = 1 + (10-10)*0.02 = 1.0
    // power = 1000 * 7.6 * 1.0 * 1.0 * 1.0 = 7600
    const char = makeChar(10);
    const bat = makeBattalion('b1', 'a1', 'heavyInfantry', 1000, 100, 0);
    const army = makeArmy('a1', ['b1'], 'char-test');
    const armies = new Map([['a1', army]]);
    const battalions = new Map([['b1', bat]]);
    const characters = new Map([['char-test', char]]);
    expect(calcMilitaryPower(['a1'], armies, battalions, characters, 'deploy')).toBeCloseTo(7600);
  });

  it('clash 阶段，重步兵 1000人 → 5800', () => {
    // clash weights: charge=0.8, breach=0.1, pursuit=0.1, siege=0
    // phaseValue = 6*0.8 + 8*0.1 + 2*0.1 = 4.8 + 0.8 + 0.2 = 5.8
    // power = 1000 * 5.8 * 1.0 * 1.0 * 1.0 = 5800
    const char = makeChar(10);
    const bat = makeBattalion('b1', 'a1', 'heavyInfantry', 1000, 100, 0);
    const army = makeArmy('a1', ['b1'], 'char-test');
    const armies = new Map([['a1', army]]);
    const battalions = new Map([['b1', bat]]);
    const characters = new Map([['char-test', char]]);
    expect(calcMilitaryPower(['a1'], armies, battalions, characters, 'clash')).toBeCloseTo(5800);
  });

  it('将领 military=20 → leaderBonus=1.2 → 战力提升 20%', () => {
    const char10 = makeChar(10);
    const char20 = makeChar(20);
    const bat10 = makeBattalion('b1', 'a1', 'heavyInfantry', 1000, 100, 0);
    const bat20 = makeBattalion('b2', 'a2', 'heavyInfantry', 1000, 100, 0);
    const army10 = makeArmy('a1', ['b1'], 'c10');
    const army20 = makeArmy('a2', ['b2'], 'c20');
    const armies = new Map([['a1', army10], ['a2', army20]]);
    const battalions = new Map([['b1', bat10], ['b2', bat20]]);
    const characters = new Map([['c10', char10], ['c20', char20]]);
    const p10 = calcMilitaryPower(['a1'], armies, battalions, characters, 'clash');
    const p20 = calcMilitaryPower(['a2'], armies, battalions, characters, 'clash');
    expect(p20 / p10).toBeCloseTo(1.2);
  });

  it('精锐度 100 → eliteBonus=1.5 → 战力提升 50%', () => {
    const char = makeChar(10);
    const batElite0 = makeBattalion('b1', 'a1', 'heavyInfantry', 1000, 100, 0);
    const batElite100 = makeBattalion('b2', 'a2', 'heavyInfantry', 1000, 100, 100);
    const army1 = makeArmy('a1', ['b1'], 'char-test');
    const army2 = makeArmy('a2', ['b2'], 'char-test');
    const armies = new Map([['a1', army1], ['a2', army2]]);
    const battalions = new Map([['b1', batElite0], ['b2', batElite100]]);
    const characters = new Map([['char-test', char]]);
    const p0 = calcMilitaryPower(['a1'], armies, battalions, characters, 'clash');
    const p100 = calcMilitaryPower(['a2'], armies, battalions, characters, 'clash');
    expect(p100 / p0).toBeCloseTo(1.5);
  });

  it('士气 0 → moraleCoeff=0.5 → 战力减半', () => {
    const char = makeChar(10);
    const batFull = makeBattalion('b1', 'a1', 'heavyInfantry', 1000, 100, 0);
    const batZero = makeBattalion('b2', 'a2', 'heavyInfantry', 1000, 0, 0);
    const army1 = makeArmy('a1', ['b1'], 'char-test');
    const army2 = makeArmy('a2', ['b2'], 'char-test');
    const armies = new Map([['a1', army1], ['a2', army2]]);
    const battalions = new Map([['b1', batFull], ['b2', batZero]]);
    const characters = new Map([['char-test', char]]);
    const pFull = calcMilitaryPower(['a1'], armies, battalions, characters, 'clash');
    const pZero = calcMilitaryPower(['a2'], armies, battalions, characters, 'clash');
    expect(pZero / pFull).toBeCloseTo(0.5);
  });

  it('两支军队战力可以正确累加', () => {
    const char = makeChar(10);
    const bat1 = makeBattalion('b1', 'a1', 'heavyInfantry', 1000, 100, 0);
    const bat2 = makeBattalion('b2', 'a2', 'heavyInfantry', 1000, 100, 0);
    const army1 = makeArmy('a1', ['b1'], 'char-test');
    const army2 = makeArmy('a2', ['b2'], 'char-test');
    const armies = new Map([['a1', army1], ['a2', army2]]);
    const battalions = new Map([['b1', bat1], ['b2', bat2]]);
    const characters = new Map([['char-test', char]]);
    const p1 = calcMilitaryPower(['a1'], armies, battalions, characters, 'clash');
    const p2 = calcMilitaryPower(['a2'], armies, battalions, characters, 'clash');
    const pBoth = calcMilitaryPower(['a1', 'a2'], armies, battalions, characters, 'clash');
    expect(pBoth).toBeCloseTo(p1 + p2);
  });
});
