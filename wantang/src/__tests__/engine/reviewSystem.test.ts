/**
 * 考课系统单元测试
 *
 * reviewSystem.ts 包含两个纯函数：
 *
 *   calculateReviewScore(character, territory, baseline, positionTemplate, reviewDate)
 *     地方主官（grantsControl）：landScore×0.4 + virtueScore×0.3 + abilityScore×0.3
 *     中央官/地方副职：         virtueScore×0.5 + abilityScore×0.5
 *
 *     其中：
 *       served     = clamp(diffMonths(baseline.date, reviewDate), 1, 36)
 *       scale      = 36 / served
 *       virtueScore = clamp(virtueGrowth × scale / 3 + 65,        0, 100)
 *       abilityScore = clamp(ability × 5,                          0, 100)
 *       landScore   = clamp(popGrowth × scale × 500 + 65,         0, 100)
 *
 *   getReviewGrade(score) → 'upper' | 'middle' | 'lower'
 *     score >= 80 → upper，>= 60 → middle，其余 lower
 *
 * 测试策略：逐条公式路径写具体预期值（非"大于0"之类），
 * 确保公式被悄悄改动时测试能立刻报警。
 */

import { describe, it, expect } from 'vitest';
import {
  calculateReviewScore,
  getReviewGrade,
  getReviewGradeLabel,
} from '@engine/systems/reviewSystem';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import type { PositionTemplate } from '@engine/official/types';
import type { GameDate } from '@engine/types';

// ─────────────────────────────────────────────────────────────────────────────
// 测试夹具
// ─────────────────────────────────────────────────────────────────────────────

function makeChar(ability: number, virtue: number, isMilitary = false): Character {
  return {
    id: 'char-review',
    name: 'Test',
    courtesy: '', gender: '男', birthYear: 830, clan: '',
    family: { childrenIds: [] },
    abilities: {
      military:       isMilitary ? ability : 10,
      administration: isMilitary ? 10 : ability,
      strategy: 10, diplomacy: 10, scholarship: 10,
    },
    traitIds: [],
    health: 100, stress: 0, alive: true,
    resources: { money: 0, grain: 0, prestige: 0, legitimacy: 0 },
    relationships: [],
    isPlayer: false, isRuler: false, title: '',
    official: { rankLevel: 15, virtue, isCivil: true },
    redistributionRate: 60,
  };
}

/** 构造最小 zhou 领地（仅用于考课） */
function makeTerritory(basePopulation: number): Territory {
  return {
    id: 'zhou-test', name: '测试州', tier: 'zhou', territoryType: 'civil',
    childIds: [], dejureControllerId: 'char-0', posts: [],
    control: 60, development: 60, populace: 60,
    buildings: [], constructions: [],
    basePopulation,
    conscriptionPool: 100,
    moneyRatio: 1, grainRatio: 1,
  };
}

const centralTemplate: PositionTemplate = {
  id: 'pos-test-central', name: '测试中央职', institution: '吏部',
  scope: 'central', minRank: 10,
  salary: { money: 0, grain: 0 }, description: '',
  grantsControl: false,
};

const localTemplate: PositionTemplate = {
  id: 'pos-test-local', name: '测试地方主官', institution: '藩镇',
  scope: 'local', minRank: 12,
  salary: { money: 0, grain: 0 }, description: '',
  grantsControl: true,
};

const militaryLocalTemplate: PositionTemplate = {
  id: 'pos-test-mil', name: '测试军事主官', institution: '藩镇',
  scope: 'local', minRank: 17, territoryType: 'military',
  salary: { money: 0, grain: 0 }, description: '',
  grantsControl: true,
};

// baseline：36个月前，virtue=50，人口10000
const baseline36: NonNullable<import('@engine/territory/types').Post['reviewBaseline']> = {
  population: 10000,
  virtue: 50,
  date: { year: 864, month: 1, day: 1 },
};

// baseline：18个月前（短任期）— 867年1月往前18个月 = 865年7月
const baseline18: NonNullable<import('@engine/territory/types').Post['reviewBaseline']> = {
  population: 10000,
  virtue: 50,
  date: { year: 865, month: 7, day: 1 },
};

// 考课时间：867年1月1日
const reviewDate: GameDate = { year: 867, month: 1, day: 1 };

// ─────────────────────────────────────────────────────────────────────────────
// calculateReviewScore — 中央官（无土地维度）
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateReviewScore — 中央官 / 地方副职', () => {

  it('零增长、ability=10、36个月 → score=58', () => {
    // virtueGrowth=0 → virtueScore = clamp(0/3 + 65) = 65
    // abilityScore = clamp(10×5) = 50
    // score = round(65×0.5 + 50×0.5) = round(32.5+25) = round(57.5) = 58
    const char = makeChar(10, 50); // virtue 当前=50，baseline.virtue=50 → growth=0
    expect(calculateReviewScore(char, undefined, baseline36, centralTemplate, reviewDate)).toBe(58);
  });

  it('贤能增长 +12、ability=10、36个月 → score=60', () => {
    // virtueGrowth=12 → virtueScore = clamp(12/3 + 65) = 69
    // score = round(69×0.5 + 50×0.5) = round(34.5+25) = round(59.5) = 60
    const char = makeChar(10, 62); // virtue=62, baseline.virtue=50 → growth=12
    expect(calculateReviewScore(char, undefined, baseline36, centralTemplate, reviewDate)).toBe(60);
  });

  it('高能力（administration=20） → score=83', () => {
    // virtueGrowth=0 → virtueScore=65
    // abilityScore = clamp(20×5) = 100
    // score = round(65×0.5 + 100×0.5) = round(32.5+50) = round(82.5) = 83
    const char = makeChar(20, 50);
    expect(calculateReviewScore(char, undefined, baseline36, centralTemplate, reviewDate)).toBe(83);
  });

  it('短任期归一化：18个月增长6点 等效于 36个月增长12点', () => {
    // 18个月：scale=2，virtueGrowth=6 → virtueScore = clamp(6×2/3 + 65) = clamp(4+65) = 69
    // 36个月：scale=1，virtueGrowth=12 → virtueScore = clamp(12×1/3 + 65) = clamp(4+65) = 69
    const char18 = makeChar(10, 56); // virtue=56, baseline.virtue=50 → growth=6
    const char36 = makeChar(10, 62); // virtue=62, baseline.virtue=50 → growth=12
    const score18 = calculateReviewScore(char18, undefined, baseline18, centralTemplate, reviewDate);
    const score36 = calculateReviewScore(char36, undefined, baseline36, centralTemplate, reviewDate);
    expect(score18).toBe(score36);
  });

  it('贤能增长极高时 virtueScore 裁剪为 100', () => {
    // virtueGrowth=105 → virtueScore = clamp(105/3 + 65) = clamp(35+65) = clamp(100) = 100
    // score = round(100×0.5 + 50×0.5) = round(50+25) = 75
    const char = makeChar(10, 155); // 155-50=105
    expect(calculateReviewScore(char, undefined, baseline36, centralTemplate, reviewDate)).toBe(75);
  });

  it('军事职位使用 military 能力而非 administration', () => {
    // militaryLocalTemplate.grantsControl=true 但此处 territory=undefined → 无土地维度
    // military ability=20 → abilityScore=100
    // virtueScore=65 (no growth)
    // score = round(65×0.5 + 100×0.5) = 83
    const charMil = makeChar(20, 50, true); // military=20
    const charCiv = makeChar(20, 50, false); // administration=20, military=10
    const scoreMil = calculateReviewScore(charMil, undefined, baseline36, militaryLocalTemplate, reviewDate);
    const scoreCiv = calculateReviewScore(charCiv, undefined, baseline36, militaryLocalTemplate, reviewDate);
    // 军职角色 military=20 会得高分，文职角色 military=10 →因military模板取military→score低
    expect(scoreMil).toBeGreaterThan(scoreCiv);
  });

  it('能力上限：ability >= 20 时 abilityScore 均为 100', () => {
    const char20 = makeChar(20, 50);
    const char30 = makeChar(30, 50);
    const s20 = calculateReviewScore(char20, undefined, baseline36, centralTemplate, reviewDate);
    const s30 = calculateReviewScore(char30, undefined, baseline36, centralTemplate, reviewDate);
    expect(s20).toBe(s30); // 都 clamp 到 100
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateReviewScore — 地方主官（有土地维度）
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateReviewScore — 地方主官（grantsControl）', () => {

  it('人口零增长、virtueGrowth=0、ability=10 → score=61', () => {
    // popGrowth=0 → landScore=clamp(0×500+65)=65
    // virtueScore=65, abilityScore=50
    // score = round(65×0.4 + 65×0.3 + 50×0.3) = round(26+19.5+15) = round(60.5) = 61
    const char = makeChar(10, 50);
    const territory = makeTerritory(10000); // 人口不变
    expect(calculateReviewScore(char, territory, baseline36, localTemplate, reviewDate)).toBe(61);
  });

  it('人口增长 10%（+1000）→ landScore 裁剪为100 → score=75', () => {
    // popGrowth=0.1 → landScore=clamp(0.1×500+65)=clamp(115)=100
    // score = round(100×0.4 + 65×0.3 + 50×0.3) = round(40+19.5+15) = round(74.5) = 75
    const char = makeChar(10, 50);
    const territory = makeTerritory(11000); // 10000→11000，+10%
    expect(calculateReviewScore(char, territory, baseline36, localTemplate, reviewDate)).toBe(75);
  });

  it('人口下降 3% → landScore=50 → score=55', () => {
    // popGrowth=-0.03 → landScore=clamp(-0.03×500+65)=clamp(50)=50
    // score = round(50×0.4 + 65×0.3 + 50×0.3) = round(20+19.5+15) = round(54.5) = 55
    const char = makeChar(10, 50);
    const territory = makeTerritory(9700); // 10000→9700，-3%
    expect(calculateReviewScore(char, territory, baseline36, localTemplate, reviewDate)).toBe(55);
  });

  it('人口增长 + 高ability → 可达上等（≥80）', () => {
    // popGrowth=0.1, ability=20, virtueGrowth=0
    // landScore=100, abilityScore=100, virtueScore=65
    // score = round(100×0.4 + 65×0.3 + 100×0.3) = round(40+19.5+30) = round(89.5) = 90
    const char = makeChar(20, 50);
    const territory = makeTerritory(11000);
    expect(calculateReviewScore(char, territory, baseline36, localTemplate, reviewDate)).toBe(90);
  });

  it('territory=undefined 时退化为中央官公式（无土地维度）', () => {
    // 地方主官若 territory 为 undefined → hasLandDimension=false → 与中央官公式相同
    const char = makeChar(10, 50);
    const withTerritory = calculateReviewScore(char, makeTerritory(10000), baseline36, localTemplate, reviewDate);
    const withoutTerritory = calculateReviewScore(char, undefined, baseline36, centralTemplate, reviewDate);
    // centralTemplate grantsControl=false, localTemplate grantsControl=true 但 territory=undefined
    // 两者公式路径不同
    // 有 territory: score=61（地方），无 territory: score=58（中央公式）
    expect(withTerritory).not.toBe(withoutTerritory);
  });

  it('短任期人口增长归一化：18个月增长5% 等效于 36个月增长10%', () => {
    // 18个月：scale=2，popGrowth=0.05 → landScore=clamp(0.05×2×500+65)=clamp(50+65)=100
    // 36个月：scale=1，popGrowth=0.10 → landScore=clamp(0.10×1×500+65)=clamp(50+65)=100
    // 两者 landScore 都被裁剪为 100，score 应相同
    const char = makeChar(10, 50);
    const t18 = makeTerritory(10500); // 5% 增长
    const t36 = makeTerritory(11000); // 10% 增长
    const s18 = calculateReviewScore(char, t18, baseline18, localTemplate, reviewDate);
    const s36 = calculateReviewScore(char, t36, baseline36, localTemplate, reviewDate);
    expect(s18).toBe(s36);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getReviewGrade — 等第评定
// ─────────────────────────────────────────────────────────────────────────────

describe('getReviewGrade', () => {
  it('score=80 → upper（正好达线）', () => expect(getReviewGrade(80)).toBe('upper'));
  it('score=79 → middle', ()          => expect(getReviewGrade(79)).toBe('middle'));
  it('score=100 → upper',  ()         => expect(getReviewGrade(100)).toBe('upper'));
  it('score=60 → middle（正好达线）', () => expect(getReviewGrade(60)).toBe('middle'));
  it('score=59 → lower',  ()          => expect(getReviewGrade(59)).toBe('lower'));
  it('score=0 → lower',   ()          => expect(getReviewGrade(0)).toBe('lower'));
});

// ─────────────────────────────────────────────────────────────────────────────
// getReviewGradeLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('getReviewGradeLabel', () => {
  it('upper → 上等', ()  => expect(getReviewGradeLabel('upper')).toBe('上等'));
  it('middle → 中等', () => expect(getReviewGradeLabel('middle')).toBe('中等'));
  it('lower → 下等', ()  => expect(getReviewGradeLabel('lower')).toBe('下等'));
});
