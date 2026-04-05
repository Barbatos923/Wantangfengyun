// ===== 八维人格计算 =====

import type { Character } from './types';
import { traitMap, PERSONALITY_KEYS, type Personality, type PersonalityKey } from '@data/traits';

/** 限制值在 min~max 之间 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 计算角色的八维人格向量。
 *
 * 遍历角色所有特质的 personalityModifiers 求和，
 * 最终每维 clamp 到 [-1.0, +1.0]。
 *
 * 用于 NPC 决策引擎的行为权重计算。
 */
export function calcPersonality(character: Character): Personality {
  const raw: Record<PersonalityKey, number> = {
    boldness: 0,
    compassion: 0,
    greed: 0,
    honor: 0,
    rationality: 0,
    sociability: 0,
    vengefulness: 0,
    energy: 0,
  };

  for (const traitId of character.traitIds) {
    const trait = traitMap.get(traitId);
    if (!trait?.personalityModifiers) continue;
    for (const key of PERSONALITY_KEYS) {
      const mod = trait.personalityModifiers[key];
      if (mod) raw[key] += mod;
    }
  }

  // Clamp each dimension to [-1, 1]
  const result = {} as Personality;
  for (const key of PERSONALITY_KEYS) {
    result[key] = clamp(raw[key], -1.0, 1.0);
  }

  return result;
}

/**
 * 计算角色每回合最大行动数。
 *
 * maxActions = clamp(0, 3, round(1 + energy × 4))
 *
 * energy ≈ -0.35 → 1 次行动（怠政型）
 * energy ≈  0.00 → 2 次行动（普通）
 * energy ≈ +0.25 → 3 次行动（勤勉型）
 * energy ≈ +0.50 → 4 次行动（天才+野心）
 */
export function calcMaxActions(personality: Personality): number {
  return clamp(Math.round(2 + personality.energy * 4), 1, 4);
}
