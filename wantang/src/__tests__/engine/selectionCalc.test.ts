/**
 * 铨选系统核心逻辑单元测试
 *
 * 覆盖 selectionCalc.ts 中可独立测试的部分：
 *
 *   getEffectiveMinRank(post)
 *     — 返回岗位的有效最低品级（minRankOverride 优先于模板定义）
 *
 *   generateCandidates(vacantPost, appointerId, characters, territories, centralPosts)
 *     — 评分公式：score = round(virtue × 0.4 + abilityValue × 0.2)
 *     — 品位不足时叠加 calcRankMismatchPenalty（负值）
 *     — 按分数降序返回，tier 仅用于 UI 展示
 *
 *   HONORARY_TEMPLATES
 *     — 虚衔集合，不进入铨选
 *
 * 测试边界：
 *   - 候选人必须 alive && official 存在
 *   - 候选人效忠链必须追溯到法理主体（appointerId）
 *   - 文职岗位用 administration 能力打分，武职岗位用 military 能力
 *   - 品位不足的候选人评分被惩罚
 */

import { describe, it, expect } from 'vitest';
import {
  getEffectiveMinRank,
  generateCandidates,
  HONORARY_TEMPLATES,
} from '@engine/official/selectionCalc';
import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';

// ─────────────────────────────────────────────────────────────────────────────
// 测试夹具
// ─────────────────────────────────────────────────────────────────────────────

function makeCandidate(
  id: string,
  virtue: number,
  rankLevel: number,
  overlordId: string,
  abilities: Partial<Character['abilities']> = {},
): Character {
  return {
    id,
    name: id,
    courtesy: '', gender: '男', birthYear: 830, clan: '',
    family: { childrenIds: [] },
    abilities: {
      military: 10, administration: 10,
      strategy: 10, diplomacy: 10, scholarship: 10,
      ...abilities,
    },
    traitIds: [],
    health: 100, stress: 0, alive: true,
    resources: { money: 0, grain: 0, prestige: 0, legitimacy: 0 },
    relationships: [],
    isPlayer: false, isRuler: false, title: '',
    overlordId,
    official: { rankLevel, virtue, isCivil: true },
    redistributionRate: 60,
  };
}

/** 构造空缺岗位（post.holderId=null） */
function makeVacantPost(templateId: string, overrides: Partial<Post> = {}): Post {
  return {
    id: `post-${templateId}`,
    templateId,
    holderId: null,
    successionLaw: 'bureaucratic',
    hasAppointRight: false,
    ...overrides,
  };
}

const APPOINTER_ID = 'emp'; // 法理主体（皇帝 or 辟署权持有人）

// ─────────────────────────────────────────────────────────────────────────────
// getEffectiveMinRank
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveMinRank', () => {
  it('无 override → 返回模板 minRank（刺史=12）', () => {
    const post = makeVacantPost('pos-cishi');
    expect(getEffectiveMinRank(post)).toBe(12);
  });

  it('有 minRankOverride → 返回 override 值（优先级高于模板）', () => {
    const post = makeVacantPost('pos-cishi', { minRankOverride: 8 });
    expect(getEffectiveMinRank(post)).toBe(8);
  });

  it('minRankOverride=0 → 返回 0（falsy 值 null/undefined 才走模板，0 不行）', () => {
    // 注：代码判断是 != null，所以 0 也会走 override
    const post = makeVacantPost('pos-cishi', { minRankOverride: 0 });
    expect(getEffectiveMinRank(post)).toBe(0);
  });

  it('未知 templateId → fallback 返回 1', () => {
    const post = makeVacantPost('pos-nonexistent');
    expect(getEffectiveMinRank(post)).toBe(1);
  });

  it('节度使（minRank=17）', () => {
    const post = makeVacantPost('pos-jiedushi');
    expect(getEffectiveMinRank(post)).toBe(17);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateCandidates — 基础筛选
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCandidates — 基础筛选', () => {
  const vacantPost = makeVacantPost('pos-cishi'); // 刺史，civil，minRank=12
  const territories = new Map<string, Territory>(); // 空：无辟署权持有人
  const centralPosts: Post[] = [];

  it('空角色池 → 返回空数组', () => {
    const result = generateCandidates(vacantPost, APPOINTER_ID, new Map(), territories, centralPosts);
    expect(result).toHaveLength(0);
  });

  it('未 alive 的角色不进入候选池', () => {
    const dead = makeCandidate('dead', 60, 15, APPOINTER_ID);
    dead.alive = false;
    const chars = new Map([['dead', dead]]);
    expect(generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts)).toHaveLength(0);
  });

  it('无 official 数据的角色不进入候选池', () => {
    const noOfficial = makeCandidate('noofc', 0, 15, APPOINTER_ID);
    noOfficial.official = undefined;
    const chars = new Map([['noofc', noOfficial]]);
    expect(generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts)).toHaveLength(0);
  });

  it('效忠链不指向 appointer 的角色被排除', () => {
    const foreign = makeCandidate('foreign', 60, 15, 'other-lord'); // 效忠其他人
    const chars = new Map([['foreign', foreign]]);
    expect(generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts)).toHaveLength(0);
  });

  it('appointer 自身不进入候选池', () => {
    const emp = makeCandidate(APPOINTER_ID, 999, 29, ''); // 皇帝自身
    const chars = new Map([[APPOINTER_ID, emp]]);
    expect(generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts)).toHaveLength(0);
  });

  it('合格候选人（alive + official + 效忠链正确）进入候选池', () => {
    const cand = makeCandidate('c1', 50, 15, APPOINTER_ID);
    const chars = new Map([['c1', cand]]);
    expect(generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateCandidates — 评分公式
// score = round(virtue × 0.4 + abilityValue × 0.2)
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCandidates — 评分公式（文职岗位：刺史）', () => {
  const vacantPost = makeVacantPost('pos-cishi'); // civil，用 administration
  const territories = new Map<string, Territory>();
  const centralPosts: Post[] = [];

  it('单候选人评分验证：virtue=50, admin=15 → score=23', () => {
    // round(50×0.4 + 15×0.2) = round(20+3) = 23
    const cand = makeCandidate('c1', 50, 15, APPOINTER_ID, { administration: 15 });
    const chars = new Map([['c1', cand]]);
    const result = generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(23);
  });

  it('单候选人评分验证：virtue=30, admin=10 → score=14', () => {
    // round(30×0.4 + 10×0.2) = round(12+2) = 14
    const cand = makeCandidate('c1', 30, 15, APPOINTER_ID, { administration: 10 });
    const chars = new Map([['c1', cand]]);
    const result = generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts);
    expect(result[0].score).toBe(14);
  });

  it('贤能更高 → 得分更高（virtue 权重 0.4）', () => {
    const highVirtue = makeCandidate('hv', 80, 15, APPOINTER_ID, { administration: 10 });
    const lowVirtue  = makeCandidate('lv', 20, 15, APPOINTER_ID, { administration: 10 });
    const chars = new Map([['hv', highVirtue], ['lv', lowVirtue]]);
    const result = generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts);
    expect(result[0].character.id).toBe('hv');
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it('行政能力更高 → 得分更高（ability 权重 0.2）', () => {
    const highAdmin = makeCandidate('ha', 50, 15, APPOINTER_ID, { administration: 20 });
    const lowAdmin  = makeCandidate('la', 50, 15, APPOINTER_ID, { administration: 5  });
    const chars = new Map([['ha', highAdmin], ['la', lowAdmin]]);
    const result = generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts);
    expect(result[0].character.id).toBe('ha');
  });

  it('返回结果按分数降序排列', () => {
    // A: score=23, B: score=14 → 顺序 A, B
    const candA = makeCandidate('A', 50, 15, APPOINTER_ID, { administration: 15 });
    const candB = makeCandidate('B', 30, 15, APPOINTER_ID, { administration: 10 });
    const chars = new Map([['A', candA], ['B', candB]]);
    const result = generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts);
    expect(result[0].character.id).toBe('A');
    expect(result[1].character.id).toBe('B');
    // 顺序不应因 Map 迭代顺序改变
    const chars2 = new Map([['B', candB], ['A', candA]]);
    const result2 = generateCandidates(vacantPost, APPOINTER_ID, chars2, territories, centralPosts);
    expect(result2[0].character.id).toBe('A');
  });
});

describe('generateCandidates — 评分公式（武职岗位：防御使）', () => {
  const militaryPost = makeVacantPost('pos-fangyu-shi'); // military，用 military 能力
  const territories = new Map<string, Territory>();
  const centralPosts: Post[] = [];

  it('武职岗位使用 military 能力打分', () => {
    // A: virtue=50, military=10, admin=20 → score = round(50×0.4 + 10×0.2) = 22
    // B: virtue=50, military=20, admin=10 → score = round(50×0.4 + 20×0.2) = 24
    // B 的军事能力更高，B 得分更高
    const candA = makeCandidate('A', 50, 15, APPOINTER_ID, { military: 10, administration: 20 });
    const candB = makeCandidate('B', 50, 15, APPOINTER_ID, { military: 20, administration: 10 });
    const chars = new Map([['A', candA], ['B', candB]]);
    const result = generateCandidates(militaryPost, APPOINTER_ID, chars, territories, centralPosts);
    expect(result[0].character.id).toBe('B');
    expect(result[0].score).toBe(24);
    expect(result[1].score).toBe(22);
  });

  it('文职高、武职低的人才 在武职岗位上排名落后', () => {
    const civExpert = makeCandidate('civ', 50, 15, APPOINTER_ID, { military: 5, administration: 20 });
    const milExpert = makeCandidate('mil', 50, 15, APPOINTER_ID, { military: 20, administration: 5 });
    const chars = new Map([['civ', civExpert], ['mil', milExpert]]);
    const result = generateCandidates(militaryPost, APPOINTER_ID, chars, territories, centralPosts);
    expect(result[0].character.id).toBe('mil');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateCandidates — 品位不足惩罚
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCandidates — 品位不足（underRank）', () => {
  const vacantPost = makeVacantPost('pos-cishi'); // minRank=12
  const territories = new Map<string, Territory>();
  const centralPosts: Post[] = [];

  it('品位不足的候选人打上 underRank 标记', () => {
    const underRankCand = makeCandidate('under', 50, 8, APPOINTER_ID); // rankLevel=8 < minRank=12
    const chars = new Map([['under', underRankCand]]);
    const result = generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts);
    expect(result).toHaveLength(1);
    expect(result[0].underRank).toBe(true);
  });

  it('品位足够的候选人不打 underRank 标记', () => {
    const properCand = makeCandidate('proper', 50, 15, APPOINTER_ID); // rankLevel=15 >= 12
    const chars = new Map([['proper', properCand]]);
    const result = generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts);
    expect(result[0].underRank).toBeUndefined();
  });

  it('品位不足者得分低于品位足够的同等贤能候选人', () => {
    // 相同 virtue 和 ability，品位足够的应排在前面
    const proper   = makeCandidate('proper',   50, 15, APPOINTER_ID, { administration: 15 });
    const underRnk = makeCandidate('underrnk', 50, 8,  APPOINTER_ID, { administration: 15 });
    const chars = new Map([['proper', proper], ['underrnk', underRnk]]);
    const result = generateCandidates(vacantPost, APPOINTER_ID, chars, territories, centralPosts);
    const properEntry   = result.find(r => r.character.id === 'proper')!;
    const underEntry    = result.find(r => r.character.id === 'underrnk')!;
    expect(properEntry.score).toBeGreaterThan(underEntry.score);
    expect(result[0].character.id).toBe('proper');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateCandidates — tier 标记
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCandidates — tier（候选人层次）', () => {
  it('无当前岗位的候选人 tier=fresh', () => {
    // 空 territories → getHeldPosts=[]] → referencePost=undefined → tier=fresh
    const cand = makeCandidate('c1', 50, 15, APPOINTER_ID);
    const chars = new Map([['c1', cand]]);
    const result = generateCandidates(
      makeVacantPost('pos-cishi'),
      APPOINTER_ID, chars,
      new Map<string, Territory>(), [],
    );
    expect(result[0].tier).toBe('fresh');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HONORARY_TEMPLATES — 虚衔集合
// ─────────────────────────────────────────────────────────────────────────────

describe('HONORARY_TEMPLATES', () => {
  it('包含中书令（pos-zhongshuling）', () => {
    expect(HONORARY_TEMPLATES.has('pos-zhongshuling')).toBe(true);
  });

  it('包含侍中（pos-shizhong）', () => {
    expect(HONORARY_TEMPLATES.has('pos-shizhong')).toBe(true);
  });

  it('包含尚书令（pos-shangshuling）', () => {
    expect(HONORARY_TEMPLATES.has('pos-shangshuling')).toBe(true);
  });

  it('包含太师（pos-taishi）', () => {
    expect(HONORARY_TEMPLATES.has('pos-taishi')).toBe(true);
  });

  it('刺史（pos-cishi）不是虚衔 — 有实际职能', () => {
    expect(HONORARY_TEMPLATES.has('pos-cishi')).toBe(false);
  });

  it('节度使（pos-jiedushi）不是虚衔', () => {
    expect(HONORARY_TEMPLATES.has('pos-jiedushi')).toBe(false);
  });
});
