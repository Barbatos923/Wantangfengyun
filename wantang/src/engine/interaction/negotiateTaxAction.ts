// ===== "议定进奉"交互 =====

import type { Character } from '@engine/character/types';
import type { Personality } from '@data/traits';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTurnManager } from '@engine/TurnManager';
import { toAbsoluteDay } from '@engine/dateUtils';
import { calcPersonality } from '@engine/character/personalityUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { executeTaxChange } from './centralizationAction';
import { random } from '@engine/random';

/** 议定进奉冷却��数（约半年） */
export const NEGOTIATE_TAX_COOLDOWN_DAYS = 180;

export const TAX_LABELS: Record<number, string> = { 1: '放任', 2: '一般', 3: '严控', 4: '压榨' };

// ── 类型 ──────────────────────────────────────────────────

export interface NegotiateTaxChanceResult {
  chance: number;
  breakdown: {
    base: number;
    opinion: number;
    power: number;
    personality: number;
  };
}

export interface NegotiateTaxResult {
  success: boolean;
  chance: number;
  breakdown: NegotiateTaxChanceResult['breakdown'];
}

// ── 注册交互 ──────────────────────────────────────────────

registerInteraction({
  id: 'negotiateTax',
  name: '议定进奉',
  icon: '💰',
  canShow: (player, target) => canNegotiateTax(player, target),
  paramType: 'negotiateTax',
});

// ── canShow ──────────────────────────────────────────────

function canNegotiateTax(player: Character, target: Character): boolean {
  if (!player.alive || !target.alive) return false;
  if (player.overlordId !== target.id) return false;

  // 冷却检查
  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  if (player.lastNegotiateTaxDay != null && currentDay - player.lastNegotiateTaxDay < NEGOTIATE_TAX_COOLDOWN_DAYS) {
    return false;
  }

  // 至少有一个方向可调
  const level = player.centralization ?? 2;
  return level > 1 || level < 4;
}

// ── 纯函数版（供 NPC 使用） ──────────────────────────────

export function canNegotiateTaxPure(
  actor: Character,
  overlord: Character,
): boolean {
  if (!actor.alive || !overlord.alive) return false;
  if (!actor.isRuler) return false;
  if (actor.overlordId !== overlord.id) return false;
  const level = actor.centralization ?? 2;
  return level > 1 || level < 4;
}

// ── 成功率计算（纯函数） ──────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 计算议定进奉成功率。
 * @param delta -1 请求降税，+1 请求加税
 */
export function calcNegotiateTaxChance(
  opinion: number,
  actorMilitary: number,
  overlordMilitary: number,
  overlordPersonality: Personality,
  delta: number,
): NegotiateTaxChanceResult {
  let base: number;
  let opinionBonus: number;
  let powerBonus: number;
  let personalityBonus: number;

  if (delta < 0) {
    // 降税：基础0，全靠好感/兵力/性格争取
    base = 0;
    opinionBonus = clamp(opinion / 4, -25, 25);
    if (actorMilitary + overlordMilitary > 0) {
      const ratio = actorMilitary / (actorMilitary + overlordMilitary);
      powerBonus = (ratio - 0.5) * 40;
    } else {
      powerBonus = 0;
    }
    // 荣誉/理性让步，贪婪抗拒
    personalityBonus = clamp(
      overlordPersonality.honor * 4 + overlordPersonality.rationality * 3 - overlordPersonality.greed * 6,
      -15, 15,
    );
  } else {
    // 加税：基础100，好感/兵力不影响，仅多疑领主可能拒绝
    base = 100;
    opinionBonus = 0;
    powerBonus = 0;
    personalityBonus = clamp(
      -overlordPersonality.vengefulness * 5,
      -15, 0,
    );
  }

  const chance = clamp(
    Math.round(base + opinionBonus + powerBonus + personalityBonus),
    5, 95,
  );

  return {
    chance,
    breakdown: {
      base,
      opinion: Math.round(opinionBonus),
      power: Math.round(powerBonus),
      personality: Math.round(personalityBonus),
    },
  };
}

// ── 执行 ──────────────────────────────────────────────────

/** 计算某角色名下所有军队的总兵力 */
function getTotalMilitary(charId: string): number {
  const milStore = useMilitaryStore.getState();
  const armies = milStore.getArmiesByOwner(charId);
  let total = 0;
  for (const army of armies) {
    total += getArmyStrength(army, milStore.battalions);
  }
  return total;
}

/** 预览成功率 */
export function previewNegotiateTax(
  actorId: string,
  overlordId: string,
  delta: number,
): NegotiateTaxChanceResult {
  const charStore = useCharacterStore.getState();
  const actor = charStore.getCharacter(actorId);
  const overlord = charStore.getCharacter(overlordId);
  if (!actor || !overlord) return { chance: 0, breakdown: { base: 0, opinion: 0, power: 0, personality: 0 } };

  const terrState = useTerritoryStore.getState();
  const overlordExpLeg = terrState.expectedLegitimacy.get(overlordId) ?? null;
  const opinion = calculateBaseOpinion(overlord, actor, overlordExpLeg, terrState.policyOpinionCache.get(overlordId) ?? null);
  const actorMil = getTotalMilitary(actorId);
  const overlordMil = getTotalMilitary(overlordId);
  const overlordPersonality = calcPersonality(overlord);

  return calcNegotiateTaxChance(opinion, actorMil, overlordMil, overlordPersonality, delta);
}

/** 执行议定进奉 */
export function executeNegotiateTax(
  actorId: string,
  overlordId: string,
  delta: number,
): NegotiateTaxResult {
  const charStore = useCharacterStore.getState();
  const actor = charStore.getCharacter(actorId);
  const overlord = charStore.getCharacter(overlordId);
  if (!actor || !overlord) return { success: false, chance: 0, breakdown: { base: 0, opinion: 0, power: 0, personality: 0 } };

  const terrState = useTerritoryStore.getState();
  const overlordExpLeg = terrState.expectedLegitimacy.get(overlordId) ?? null;
  const opinion = calculateBaseOpinion(overlord, actor, overlordExpLeg, terrState.policyOpinionCache.get(overlordId) ?? null);
  const actorMil = getTotalMilitary(actorId);
  const overlordMil = getTotalMilitary(overlordId);
  const overlordPersonality = calcPersonality(overlord);

  const { chance, breakdown } = calcNegotiateTaxChance(opinion, actorMil, overlordMil, overlordPersonality, delta);

  const roll = random() * 100;
  const success = roll < chance;

  // 记录冷却
  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  charStore.updateCharacter(actorId, { lastNegotiateTaxDay: currentDay });

  const dirLabel = delta < 0 ? '降低' : '提高';
  console.log(`[议定进奉] ${actor.name} → ${overlord.name} (${dirLabel}) | chance=${chance}% → ${success ? '成功' : '失败'}`);

  if (success) {
    executeTaxChange(actorId, overlordId, delta);
    charStore.addOpinion(overlordId, actorId, {
      reason: '议定进奉',
      value: delta < 0 ? -5 : 5,
      decayable: true,
    });
  } else {
    charStore.addOpinion(overlordId, actorId, {
      reason: '议定进奉失败',
      value: -15,
      decayable: true,
    });
  }

  return { success, chance, breakdown };
}
