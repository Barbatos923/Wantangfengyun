// ===== 角色工具函数 =====

import type { Abilities, Character } from './types';
import { ALL_TRAITS, traitMap, type TraitDef, type TraitCategory } from '@data/traits';
import { randInt, random, shuffle } from '@engine/random.ts';
import { calcLegitimacyOpinion } from '@engine/official/legitimacyCalc';
import { CENTRALIZATION_OPINION } from '@engine/interaction/centralizationAction';
import type { PolicyOpinionEntry } from '@engine/territory/TerritoryStore';

/** 限制值在min~max之间 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


// ===== 层级查询 =====

/** 沿 overlordId 链上溯，找到顶级领主（无 overlord 的角色） */
export function findTopLord(
  charId: string,
  characters: Map<string, Character>,
): string {
  let current = charId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) return current;
    visited.add(current);
    const char = characters.get(current);
    if (!char?.overlordId) return current;
    current = char.overlordId;
  }
}

// ===== 特质查询 =====

/** 按类别获取特质 */
export function getTraitsByCategory(category: TraitCategory): TraitDef[] {
  return ALL_TRAITS.filter((t) => t.category === category);
}

/** 获取对应能力的教育特质（给定等级） */
export function getEducationTrait(ability: keyof Abilities, level: number): TraitDef | undefined {
  return traitMap.get(`trait-edu-${ability}-${level}`);
}

// ===== 能力值生成 =====

/** 生成角色能力值 */
export function generateAbilities(
  fatherAbilities?: Abilities,
  motherAbilities?: Abilities,
  innateTraitIds: string[] = [],
): Abilities {
  const keys: (keyof Abilities)[] = ['military', 'administration', 'strategy', 'diplomacy', 'scholarship'];
  const result: Abilities = { military: 0, administration: 0, strategy: 0, diplomacy: 0, scholarship: 0 };

  for (const key of keys) {
    let base = randInt(3, 10);
    if (fatherAbilities && motherAbilities) {
      base += Math.floor((fatherAbilities[key] + motherAbilities[key]) / 4);
    }
    // 先天特质加成
    for (const tid of innateTraitIds) {
      const trait = traitMap.get(tid);
      if (trait?.abilityModifiers[key]) {
        base += trait.abilityModifiers[key]!;
      }
    }
    result[key] = clamp(base, 0, 30);
  }

  return result;
}

// ===== 性格特质分配 =====

/** 为角色分配2-4个性格特质（6岁时） */
export function assignPersonalityTraits(existingTraitIds: string[]): string[] {
  const personalityTraits = getTraitsByCategory('personality');
  const count = randInt(2, 4);
  const selected: string[] = [];
  const excluded = new Set<string>();

  // 已有的互斥标记
  for (const tid of existingTraitIds) {
    const trait = traitMap.get(tid);
    if (trait?.exclusiveWith) {
      for (const ex of trait.exclusiveWith) excluded.add(ex);
    }
  }

  const shuffled = shuffle([...personalityTraits]);

  for (const trait of shuffled) {
    if (selected.length >= count) break;
    if (excluded.has(trait.id)) continue;
    selected.push(trait.id);
    if (trait.exclusiveWith) {
      for (const ex of trait.exclusiveWith) excluded.add(ex);
    }
  }

  return selected;
}

// ===== 教育特质分配 =====

/** 为角色分配教育特质（16岁时），基于当时能力值 */
export function assignEducationTrait(abilities: Abilities): string {
  // 取最高能力
  const entries: { ability: keyof Abilities; value: number }[] = [
    { ability: 'military', value: abilities.military },
    { ability: 'administration', value: abilities.administration },
    { ability: 'strategy', value: abilities.strategy },
    { ability: 'diplomacy', value: abilities.diplomacy },
    { ability: 'scholarship', value: abilities.scholarship },
  ];

  // 按值降序，打乱同值的
  entries.sort((a, b) => b.value - a.value || (random() - 0.5));
  const best = entries[0];

  // 根据能力值确定等级
  let level: number;
  if (best.value >= 23) level = 4;
  else if (best.value >= 15) level = 3;
  else if (best.value >= 8) level = 2;
  else level = 1;

  return `trait-edu-${best.ability}-${level}`;
}

// ===== 有效能力值（含特质加成）=====

/** 计算包含所有特质加成后的有效能力值 */
export function getEffectiveAbilities(character: Character): Abilities {
  const base = { ...character.abilities };
  const keys: (keyof Abilities)[] = ['military', 'administration', 'strategy', 'diplomacy', 'scholarship'];

  for (const tid of character.traitIds) {
    const trait = traitMap.get(tid);
    if (!trait) continue;
    for (const key of keys) {
      if (trait.abilityModifiers[key]) {
        base[key] = clamp(base[key] + trait.abilityModifiers[key]!, 0, 30);
      }
    }
  }

  return base;
}

// ===== 好感度计算 =====

/** 计算角色A对角色B的基础好感度 */
/**
 * 计算角色A对角色B的基础好感度（纯函数）。
 * @param bExpectedLeg B 的预期正统性（最高岗位 baseLegitimacy），null 表示无官职
 */
export function calculateBaseOpinion(
  a: Character,
  b: Character,
  bExpectedLeg: number | null,
  aPolicyOpinion?: PolicyOpinionEntry | null,
): number {
  let opinion = 0;

  const aTraits = a.traitIds.map((id) => traitMap.get(id)).filter(Boolean) as TraitDef[];
  const bTraitIds = new Set(b.traitIds);

  // 共同特质 +5
  for (const t of aTraits) {
    if (bTraitIds.has(t.id)) opinion += 5;
  }

  // 互斥特质 -10
  for (const t of aTraits) {
    if (t.exclusiveWith) {
      for (const ex of t.exclusiveWith) {
        if (bTraitIds.has(ex)) opinion -= 10;
      }
    }
  }

  // 角色A的全局好感修正
  for (const t of aTraits) {
    opinion += t.globalOpinionModifier;
  }

  // 外交能力加成：B的外交能力让A更喜欢B，超过10点的部分每点+1
  const bEffAbilities = getEffectiveAbilities(b);
  if (bEffAbilities.diplomacy > 10) {
    opinion += bEffAbilities.diplomacy - 10;
  }

  // 亲属加成
  if (a.family.fatherId === b.id || a.family.motherId === b.id ||
      b.family.fatherId === a.id || b.family.motherId === a.id) {
    opinion += 20; // 父子
  }
  if (a.family.spouseId === b.id) {
    opinion += 15; // 配偶
  }
  // 兄弟（同父）
  if (a.family.fatherId && a.family.fatherId === b.family.fatherId && a.id !== b.id) {
    opinion += 10;
  }
  // 同族
  if (a.clan && a.clan === b.clan && a.id !== b.id) {
    opinion += 5;
  }

  // 正统性好感（实时修正项，由调用方传入预期值）
  if (bExpectedLeg !== null) {
    const legOpinion = calcLegitimacyOpinion(b.resources.legitimacy, bExpectedLeg);
    if (legOpinion) {
      opinion += legOpinion.gapValue + legOpinion.absoluteValue;
    }
  }

  // 政策好感（实时计算，A 是臣属、B 是领主时生效）
  if (a.overlordId === b.id) {
    // 赋税等级（A 的 centralization，无地臣属不适用）
    if (a.isRuler) {
      const taxLevel = a.centralization ?? 2;
      opinion += CENTRALIZATION_OPINION[taxLevel] ?? 0;
    }

    // 回拨率（B 的 redistributionRate）
    const redistRate = b.redistributionRate;
    opinion += Math.floor((redistRate - 60) / 10) * 5;

    // 岗位相关（从缓存读取）
    if (aPolicyOpinion) {
      opinion += aPolicyOpinion.appointRight + aPolicyOpinion.succession + aPolicyOpinion.type;
    }
  }

  // 赋税好感（反向：B 是臣属、A 是领主时，高税→A 对 B 好感高，无地臣属不适用）
  if (b.overlordId === a.id && b.isRuler) {
    const taxLevel = b.centralization ?? 2;
    opinion += -(CENTRALIZATION_OPINION[taxLevel] ?? 0);
  }

  // 事件累积好感度
  const rel = a.relationships.find((r) => r.targetId === b.id);
  if (rel) {
    for (const entry of rel.opinions) {
      opinion += entry.value;
    }
  }

  return clamp(opinion, -100, 100);
}

/** 好感度分项明细 */
export interface OpinionBreakdownEntry {
  label: string;
  value: number;
}

/**
 * 计算角色A对角色B的好感度分项明细（纯函数）。
 * @param bExpectedLeg B 的预期正统性，null 表示无官职
 */
export function getOpinionBreakdown(a: Character, b: Character, bExpectedLeg: number | null, aPolicyOpinion?: PolicyOpinionEntry | null): OpinionBreakdownEntry[] {
  const entries: OpinionBreakdownEntry[] = [];

  const aTraits = a.traitIds.map((id) => traitMap.get(id)).filter(Boolean) as TraitDef[];
  const bTraitIds = new Set(b.traitIds);

  // 共同特质
  for (const t of aTraits) {
    if (bTraitIds.has(t.id)) {
      entries.push({ label: `共同特质：${t.name}`, value: 5 });
    }
  }

  // 互斥特质
  for (const t of aTraits) {
    if (t.exclusiveWith) {
      for (const ex of t.exclusiveWith) {
        if (bTraitIds.has(ex)) {
          const exTrait = traitMap.get(ex);
          entries.push({ label: `特质冲突：${t.name}↔${exTrait?.name ?? ex}`, value: -10 });
        }
      }
    }
  }

  // 全局好感修正
  for (const t of aTraits) {
    if (t.globalOpinionModifier !== 0) {
      entries.push({ label: `性格：${t.name}`, value: t.globalOpinionModifier });
    }
  }

  // 外交能力加成：B的外交让A更喜欢B
  const bEffAbilities = getEffectiveAbilities(b);
  if (bEffAbilities.diplomacy > 10) {
    entries.push({ label: '外交能力', value: bEffAbilities.diplomacy - 10 });
  }

  // 亲属加成
  if (a.family.fatherId === b.id || a.family.motherId === b.id ||
      b.family.fatherId === a.id || b.family.motherId === a.id) {
    entries.push({ label: '父子/母子', value: 20 });
  }
  if (a.family.spouseId === b.id) {
    entries.push({ label: '夫妻', value: 15 });
  }
  if (a.family.fatherId && a.family.fatherId === b.family.fatherId && a.id !== b.id) {
    entries.push({ label: '兄弟', value: 10 });
  }
  if (a.clan && a.clan === b.clan && a.id !== b.id) {
    entries.push({ label: '同族', value: 5 });
  }

  // 正统性好感（实时修正项）
  if (bExpectedLeg !== null) {
    const bLeg = calcLegitimacyOpinion(b.resources.legitimacy, bExpectedLeg);
    if (bLeg) {
      if (bLeg.gapValue > 0) {
        entries.push({ label: '正统性高于预期', value: bLeg.gapValue });
      } else if (bLeg.gapValue >= -15) {
        entries.push({ label: '正统性不及预期', value: bLeg.gapValue });
      } else if (bLeg.gapValue < -15) {
        entries.push({ label: '正统性严重不及预期', value: bLeg.gapValue });
      }
      if (bLeg.absoluteValue > 0) {
        entries.push({ label: '天命所归', value: bLeg.absoluteValue });
      } else if (bLeg.absoluteValue < 0) {
        entries.push({ label: '名器尽失', value: bLeg.absoluteValue });
      }
    }
  }

  // 政策好感（A 是臣属、B 是领主时）
  if (a.overlordId === b.id) {
    // 赋税等级（无地臣属不适用）
    if (a.isRuler) {
      const taxLevel = a.centralization ?? 2;
      const taxVal = CENTRALIZATION_OPINION[taxLevel] ?? 0;
      if (taxVal !== 0) entries.push({ label: `赋税等级（${taxLevel}级）`, value: taxVal });
    }

    const redistRate = b.redistributionRate;
    const redistVal = Math.floor((redistRate - 60) / 10) * 5;
    if (redistVal !== 0) entries.push({ label: `回拨率（${redistRate}%）`, value: redistVal });

    if (aPolicyOpinion) {
      if (aPolicyOpinion.appointRight !== 0) entries.push({ label: '辟署权', value: aPolicyOpinion.appointRight });
      if (aPolicyOpinion.succession !== 0) entries.push({ label: '宗法继承', value: aPolicyOpinion.succession });
      if (aPolicyOpinion.type !== 0) entries.push({ label: '军事职类', value: aPolicyOpinion.type });
    }
  }

  // 赋税好感（反向：B 是臣属、A 是领主时，高税→A 对 B 好感高，无地臣属不适用）
  if (b.overlordId === a.id && b.isRuler) {
    const taxLevel = b.centralization ?? 2;
    const taxVal = -(CENTRALIZATION_OPINION[taxLevel] ?? 0);
    if (taxVal !== 0) entries.push({ label: `臣属进奉（${taxLevel}级）`, value: taxVal });
  }

  // 事件累积
  const rel = a.relationships.find((r) => r.targetId === b.id);
  if (rel) {
    for (const entry of rel.opinions) {
      entries.push({ label: entry.reason, value: entry.value });
    }
  }

  return entries;
}

// ===== 月度结算：健康 =====

/** 计算角色每月健康变化 */
export function calculateMonthlyHealthChange(character: Character, currentYear: number): number {
  const age = currentYear - character.birthYear;
  let change = 0;

  // ── 概率制年龄衰退 ──
  // 55 岁起开始有概率扣血，年龄越大概率越高
  // 55 岁: ~5%/月，65 岁: ~15%/月，75 岁: ~25%/月
  // 80 岁以上额外加速，避免极端长寿
  if (age >= 55) {
    let decayChance = 0.01 * (age - 50); // 55→5%, 65→15%, 75→25%
    if (age >= 80) {
      decayChance += 0.05 * (age - 80); // 80→25%+0%, 85→25%+25%, 90→25%+50%
    }
    decayChance = Math.min(decayChance, 1);
    if (random() < decayChance) {
      change -= randInt(2, 5);
    }
  }

  // ── 概率制压力惩罚 ──
  // 高压力增加健康恶化概率，而非每月固定扣
  if (character.stress >= 75) {
    if (random() < 0.25) change -= randInt(2, 4);
  } else if (character.stress >= 50) {
    if (random() < 0.10) change -= randInt(1, 3);
  }

  // ── 特质加成（确定性，伤病/残疾等） ──
  for (const tid of character.traitIds) {
    const trait = traitMap.get(tid);
    if (trait) change += trait.monthlyHealth;
  }

  // ── 恢复 ──
  // 55 岁以下且压力 < 50 可恢复
  if (character.health < 100 && character.stress < 50 && age < 55) {
    change += 1;
  }

  return change;
}

// ===== 月度结算：压力 =====

/** 计算角色每月压力变化 */
export function calculateMonthlyStressChange(character: Character): number {
  let change = 0;

  // 事件特质加成（性格特质已全部归零，仅事件特质如忧虑/嗜酒生效）
  for (const tid of character.traitIds) {
    const trait = traitMap.get(tid);
    if (trait) change += trait.monthlyStress;
  }

  // 健康惩罚
  if (character.health < 30) {
    change += 2;
  }

  return change;
}

// ===== 好感度衰减 =====

/** 处理好感度衰减（事件类每月向0靠拢1点） */
export function decayOpinions(character: Character): Character {
  const newRelationships = character.relationships.map((rel) => {
    const newOpinions = rel.opinions
      .map((op) => {
        if (!op.decayable) return op;
        if (op.value > 0) return { ...op, value: op.value - 1 };
        if (op.value < 0) return { ...op, value: op.value + 1 };
        return op;
      })
      .filter((op) => op.value !== 0 || !op.decayable);
    return { ...rel, opinions: newOpinions };
  });
  return { ...character, relationships: newRelationships };
}
