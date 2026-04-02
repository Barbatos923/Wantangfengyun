/**
 * 领地工具函数单元测试
 *
 * 覆盖 territoryUtils.ts 中的四个纯函数：
 *   - getBuildingBonuses     — 建筑加成汇总
 *   - calculateMonthlyIncome — 月产出计算
 *   - calculateAttributeDrift — 属性漂移计算
 *   - applyAttributeDrift    — 将漂移应用到领地（返回 Partial<Territory>）
 *
 * 关键公式：
 *   totalOutput = basePopulation * 0.9 * (dev/100) * (ctrl/100) * (1 + admin*0.02)
 *   money = totalOutput * moneyRatio / (moneyRatio + grainRatio) + bonuses.money
 *   troops = basePopulation * 0.001 * (ctrl/100) * (populace/100) * (1 + mil*0.02) + bonuses.troops
 *   controlDrift = (min(100, mil*5) - ctrl) * 0.08 + bonuses.controlPerMonth
 *   devDrift = (min(100, admin*5) - dev) * 0.08 + bonuses.developmentPerMonth
 *   populaceDrift = (avg(ctrl,dev) - 60) / 40 + bonuses.populacePerMonth
 */

import { describe, it, expect } from 'vitest';
import {
  getBuildingBonuses,
  calculateMonthlyIncome,
  calculateAttributeDrift,
  applyAttributeDrift,
} from '@engine/territory/territoryUtils';
import type { Territory, BuildingSlot } from '@engine/territory/types';
import type { Abilities } from '@engine/character/types';

// ─────────────────────────────────────────────────────────────────────────────
// 测试夹具
// ─────────────────────────────────────────────────────────────────────────────

/** 构造最小合法 zhou 领地（所有可选字段均有默认值） */
function makeZhou(overrides: Partial<Territory> = {}): Territory {
  return {
    id: 'zhou-test',
    name: '测试州',
    tier: 'zhou',
    territoryType: 'civil',
    parentId: 'dao-test',
    childIds: [],
    dejureControllerId: 'char-0',
    posts: [],
    control: 60,
    development: 60,
    populace: 60,
    buildings: [],
    constructions: [],
    basePopulation: 10000,
    conscriptionPool: 100,
    moneyRatio: 1,
    grainRatio: 1,
    ...overrides,
  };
}

/** 满属性能力值（military=admin=...=10） */
const abilitiesAvg: Abilities = {
  military: 10,
  administration: 10,
  strategy: 10,
  diplomacy: 10,
  scholarship: 10,
};

/** 高军事、高行政能力 */
const abilitiesHigh: Abilities = {
  military: 20,
  administration: 20,
  strategy: 10,
  diplomacy: 10,
  scholarship: 10,
};

// ─────────────────────────────────────────────────────────────────────────────
// getBuildingBonuses
// ─────────────────────────────────────────────────────────────────────────────

describe('getBuildingBonuses', () => {
  it('空建筑槽 → 全部为 0', () => {
    const bonuses = getBuildingBonuses(makeZhou({ buildings: [] }));
    expect(bonuses.money).toBe(0);
    expect(bonuses.grain).toBe(0);
    expect(bonuses.troops).toBe(0);
    expect(bonuses.defense).toBe(0);
    expect(bonuses.controlPerMonth).toBe(0);
    expect(bonuses.developmentPerMonth).toBe(0);
    expect(bonuses.populacePerMonth).toBe(0);
    expect(bonuses.stressReduction).toBe(0);
    expect(bonuses.grainStorage).toBe(0);
  });

  it('空 buildingId 的槽位不计入加成', () => {
    const buildings: BuildingSlot[] = [{ buildingId: null, level: 2 }];
    const bonuses = getBuildingBonuses(makeZhou({ buildings }));
    expect(bonuses.money).toBe(0);
  });

  it('level=0 的已建建筑不计入加成', () => {
    const buildings: BuildingSlot[] = [{ buildingId: 'building-market', level: 0 }];
    const bonuses = getBuildingBonuses(makeZhou({ buildings }));
    expect(bonuses.money).toBe(0);
  });

  it('集市 level=1 → money +800', () => {
    // building-market: moneyPerLevel=800
    const buildings: BuildingSlot[] = [{ buildingId: 'building-market', level: 1 }];
    const bonuses = getBuildingBonuses(makeZhou({ buildings }));
    expect(bonuses.money).toBe(800);
  });

  it('集市 level=2 → money +1600（线性叠加）', () => {
    const buildings: BuildingSlot[] = [{ buildingId: 'building-market', level: 2 }];
    const bonuses = getBuildingBonuses(makeZhou({ buildings }));
    expect(bonuses.money).toBe(1600);
  });

  it('农田 level=1 → grain +500', () => {
    // building-farm: grainPerLevel=500
    const buildings: BuildingSlot[] = [{ buildingId: 'building-farm', level: 1 }];
    const bonuses = getBuildingBonuses(makeZhou({ buildings }));
    expect(bonuses.grain).toBe(500);
  });

  it('城墙 level=1 → defense +20, controlPerMonth +0.3', () => {
    // building-walls: defensePerLevel=20, controlPerMonthPerLevel=0.3
    const buildings: BuildingSlot[] = [{ buildingId: 'building-walls', level: 1 }];
    const bonuses = getBuildingBonuses(makeZhou({ buildings }));
    expect(bonuses.defense).toBe(20);
    expect(bonuses.controlPerMonth).toBeCloseTo(0.3);
  });

  it('多个建筑同时存在时正确累加', () => {
    const buildings: BuildingSlot[] = [
      { buildingId: 'building-market', level: 1 }, // money +800
      { buildingId: 'building-farm', level: 2 },   // grain +1000
    ];
    const bonuses = getBuildingBonuses(makeZhou({ buildings }));
    expect(bonuses.money).toBe(800);
    expect(bonuses.grain).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateMonthlyIncome
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateMonthlyIncome', () => {
  it('非 zhou tier → 返回全零', () => {
    const dao = makeZhou({ tier: 'dao' });
    const result = calculateMonthlyIncome(dao, abilitiesAvg);
    expect(result).toEqual({ money: 0, grain: 0, troops: 0 });
  });

  it('基准情况（ctrl=100, dev=100, pop=10000, admin=mil=10, moneyRatio=grainRatio=1, populace=100）', () => {
    // totalOutput = 10000 * 0.9 * 1 * 1 * (1+0.2) = 10800
    // money = 10800 * 0.5 = 5400
    // grain = 10800 * 0.5 = 5400
    // troops = 10000 * 0.001 * 1 * 1 * 1.2 = 12
    const t = makeZhou({ control: 100, development: 100, populace: 100 });
    const result = calculateMonthlyIncome(t, abilitiesAvg);
    expect(result.money).toBeCloseTo(5400);
    expect(result.grain).toBeCloseTo(5400);
    expect(result.troops).toBeCloseTo(12);
  });

  it('行政能力更高 → 产出更多钱粮', () => {
    const t = makeZhou({ control: 100, development: 100, populace: 100 });
    const lowAdmin = calculateMonthlyIncome(t, abilitiesAvg);       // admin=10
    const highAdmin = calculateMonthlyIncome(t, abilitiesHigh);     // admin=20
    expect(highAdmin.money).toBeGreaterThan(lowAdmin.money);
    expect(highAdmin.grain).toBeGreaterThan(lowAdmin.grain);
  });

  it('军事能力更高 → 兵役产出更多', () => {
    const t = makeZhou({ control: 100, development: 100, populace: 100 });
    const lowMil = calculateMonthlyIncome(t, abilitiesAvg);
    const highMil = calculateMonthlyIncome(t, abilitiesHigh);
    expect(highMil.troops).toBeGreaterThan(lowMil.troops);
  });

  it('control=0 → 产出更少', () => {
    const highCtrl = makeZhou({ control: 100, development: 100, populace: 100 });
    const lowCtrl = makeZhou({ control: 20, development: 100, populace: 100 });
    const r1 = calculateMonthlyIncome(highCtrl, abilitiesAvg);
    const r2 = calculateMonthlyIncome(lowCtrl, abilitiesAvg);
    expect(r2.money).toBeLessThan(r1.money);
    expect(r2.troops).toBeLessThan(r1.troops);
  });

  it('moneyRatio=2, grainRatio=1 → 钱财占 2/3，粮食占 1/3', () => {
    const t = makeZhou({ control: 100, development: 100, populace: 100, moneyRatio: 2, grainRatio: 1 });
    const result = calculateMonthlyIncome(t, abilitiesAvg);
    // totalOutput = 10800
    // money = 10800 * 2/3 = 7200
    // grain = 10800 * 1/3 = 3600
    expect(result.money).toBeCloseTo(7200);
    expect(result.grain).toBeCloseTo(3600);
  });

  it('建筑加成（集市 level=1）会叠加到 money 上', () => {
    const noBuilding = makeZhou({ control: 100, development: 100, populace: 100 });
    const withMarket = makeZhou({
      control: 100, development: 100, populace: 100,
      buildings: [{ buildingId: 'building-market', level: 1 }],
    });
    const r1 = calculateMonthlyIncome(noBuilding, abilitiesAvg);
    const r2 = calculateMonthlyIncome(withMarket, abilitiesAvg);
    expect(r2.money - r1.money).toBeCloseTo(800); // market.moneyPerLevel=800 × level=1
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateAttributeDrift
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateAttributeDrift', () => {
  it('非 zhou tier → 返回全零', () => {
    const dao = makeZhou({ tier: 'dao' });
    const drift = calculateAttributeDrift(dao, []);
    expect(drift).toEqual({ control: 0, development: 0, populace: 0 });
  });

  it('military=10, control=60 → controlDrift = (min(100,50) - 60) * 0.08 = -0.8（控制度向 50 收敛）', () => {
    // controlTarget = min(100, 10*5) = 50
    // drift = (50 - 60) * 0.08 = -0.8
    const t = makeZhou({ control: 60, development: 60, populace: 50 });
    const drift = calculateAttributeDrift(t, [], { ...abilitiesAvg, military: 10 });
    expect(drift.control).toBeCloseTo(-0.8);
  });

  it('military=20, control=60 → controlDrift = (100 - 60) * 0.08 = 3.2（控制度向 100 收敛）', () => {
    const t = makeZhou({ control: 60, development: 60, populace: 50 });
    const drift = calculateAttributeDrift(t, [], { ...abilitiesAvg, military: 20 });
    expect(drift.control).toBeCloseTo(3.2);
  });

  it('administration=20, development=60 → devDrift = (100 - 60) * 0.08 = 3.2', () => {
    const t = makeZhou({ control: 60, development: 60 });
    const drift = calculateAttributeDrift(t, [], { ...abilitiesAvg, administration: 20 });
    expect(drift.development).toBeCloseTo(3.2);
  });

  it('control=60, development=60 → avg=60 → populaceDrift = (60-60)/40 = 0', () => {
    const t = makeZhou({ control: 60, development: 60 });
    const drift = calculateAttributeDrift(t, [], abilitiesAvg);
    expect(drift.populace).toBeCloseTo(0);
  });

  it('control=100, development=100 → avg=100 → populaceDrift = (100-60)/40 = 1', () => {
    const t = makeZhou({ control: 100, development: 100 });
    const drift = calculateAttributeDrift(t, [], abilitiesAvg);
    expect(drift.populace).toBeCloseTo(1);
  });

  it('control=20, development=20 → avg=20 → populaceDrift = (20-60)/40 = -1', () => {
    const t = makeZhou({ control: 20, development: 20 });
    const drift = calculateAttributeDrift(t, [], abilitiesAvg);
    expect(drift.populace).toBeCloseTo(-1);
  });

  it('trait-cruel → 民心漂移额外 -1', () => {
    const t = makeZhou({ control: 60, development: 60 });
    const noCruel = calculateAttributeDrift(t, [], abilitiesAvg);
    const withCruel = calculateAttributeDrift(t, ['trait-cruel'], abilitiesAvg);
    expect(withCruel.populace - noCruel.populace).toBeCloseTo(-1);
  });

  it('建筑驿站 level=1 → controlPerMonth +0.5', () => {
    const buildings: BuildingSlot[] = [{ buildingId: 'building-post', level: 1 }];
    const t = makeZhou({ control: 60, development: 60, buildings });
    const drift = calculateAttributeDrift(t, [], abilitiesAvg);
    const noBuilding = calculateAttributeDrift(makeZhou({ control: 60, development: 60 }), [], abilitiesAvg);
    expect(drift.control - noBuilding.control).toBeCloseTo(0.5); // post.controlPerMonthPerLevel=0.5
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyAttributeDrift
// ─────────────────────────────────────────────────────────────────────────────

describe('applyAttributeDrift', () => {
  it('非 zhou tier → 返回空对象', () => {
    const dao = makeZhou({ tier: 'dao' });
    const result = applyAttributeDrift(dao, { control: 1, development: 1, populace: 1 });
    expect(result).toEqual({});
  });

  it('正常漂移：control += drift，下限 20，上限 100', () => {
    const t = makeZhou({ control: 60 });
    const result = applyAttributeDrift(t, { control: 5, development: 0, populace: 0 });
    expect(result.control).toBe(65);
  });

  it('control 不超过 100', () => {
    const t = makeZhou({ control: 98 });
    const result = applyAttributeDrift(t, { control: 5, development: 0, populace: 0 });
    expect(result.control).toBe(100);
  });

  it('control 不低于 20', () => {
    const t = makeZhou({ control: 21 });
    const result = applyAttributeDrift(t, { control: -5, development: 0, populace: 0 });
    expect(result.control).toBe(20);
  });

  it('populace 不超过 100', () => {
    const t = makeZhou({ populace: 99 });
    const result = applyAttributeDrift(t, { control: 0, development: 0, populace: 5 });
    expect(result.populace).toBe(100);
  });

  it('populace 不低于 0', () => {
    const t = makeZhou({ populace: 2 });
    const result = applyAttributeDrift(t, { control: 0, development: 0, populace: -5 });
    expect(result.populace).toBe(0);
  });
});
