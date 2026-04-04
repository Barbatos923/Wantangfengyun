// ===== "要求效忠"交互 =====

import type { Character } from '@engine/character/types';
import type { Post, Territory } from '@engine/territory/types';
import type { War } from '@engine/military/types';
import type { Personality } from '@data/traits';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { calcPersonality } from '@engine/character/personalityUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { getActualController } from '@engine/official/postQueries';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { positionMap } from '@data/positions';
import { random } from '@engine/random';

/** 注册要求效忠交互 */
registerInteraction({
  id: 'demandFealty',
  name: '要求效忠',
  icon: '🤝',
  canShow: (player, target) => canDemandFealty(player, target),
  paramType: 'none',
});

// ── canShow（便捷版：读 Store） ──────────────────────────

function canDemandFealty(player: Character, target: Character): boolean {
  const terrStore = useTerritoryStore.getState();
  const targetPosts = terrStore.getPostsByHolder(target.id);
  const playerPosts = terrStore.getPostsByHolder(player.id);
  const activeWars = useWarStore.getState().getActiveWars();
  return canDemandFealtyPure(player, target, terrStore.territories, targetPosts, playerPosts, activeWars);
}

// ── canDemandFealty 纯函数版（供 NPC Engine 使用） ────────

/**
 * 判断 player 能否对 target 要求效忠（纯函数，不读 Store）。
 *
 * 规则（类似 CK3 "要求附庸"）：
 * - target 必须持有 grantsControl 主岗位（无领地者不可被要求）
 * - player 必须是 target 某个主岗位的法理上级（沿领地树 parentId 向上，直接上一级领地由 player 控制）
 * - target 当前未效忠 player
 */
export function canDemandFealtyPure(
  player: Character,
  target: Character,
  territories: Map<string, Territory>,
  targetPosts: Post[],
  playerPosts?: Post[],
  activeWars?: War[],
): boolean {
  if (!target.alive) return false;
  if (target.overlordId === player.id) return false;

  // 双方正在交战时不可要求效忠
  if (activeWars?.some(w =>
    w.status === 'active' &&
    ((w.attackerId === player.id && w.defenderId === target.id) ||
     (w.attackerId === target.id && w.defenderId === player.id)),
  )) return false;

  // target 必须有 grantsControl 主岗位（控制领地的统治者）
  const mainPosts = targetPosts.filter(p => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.grantsControl === true;
  });
  if (mainPosts.length === 0) return false;

  // 岗位品级检查：要求方最高岗位品级必须严格高于目标最高岗位品级
  const pPosts = playerPosts ?? [];
  const playerMaxRank = Math.max(0, ...pPosts.map(p => positionMap.get(p.templateId)?.minRank ?? 0));
  const targetMaxRank = Math.max(0, ...mainPosts.map(p => positionMap.get(p.templateId)?.minRank ?? 0));
  if (playerMaxRank <= targetMaxRank) return false;

  // player 必须是 target 某个领地的直接法理上级
  return isDirectLiegeOf(player.id, mainPosts, territories);
}

/**
 * 检查 player 是否是 target 某个主岗位领地的直接法理上级。
 * "直接法理上级" = target 领地的 parentId 指向的领地由 player 控制。
 */
function isDirectLiegeOf(
  playerId: string,
  targetMainPosts: { territoryId?: string }[],
  territories: Map<string, Territory>,
): boolean {
  for (const post of targetMainPosts) {
    if (!post.territoryId) continue;
    const terr = territories.get(post.territoryId);
    if (!terr?.parentId) continue;
    const parent = territories.get(terr.parentId);
    if (!parent) continue;
    if (getActualController(parent) === playerId) return true;
  }
  return false;
}

// ── 成功率计算（纯函数） ──────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface FealtyChanceResult {
  chance: number;
  breakdown: {
    base: number;
    opinion: number;
    power: number;
    personality: number;
  };
}

export function calcFealtyChance(
  opinion: number,
  playerMilitary: number,
  targetMilitary: number,
  personality: Personality,
): FealtyChanceResult {
  const base = 50;

  // 好感度 → ±30
  const opinionBonus = clamp(opinion / 3, -30, 30);

  // 兵力比 → ±20
  let powerBonus: number;
  if (playerMilitary + targetMilitary > 0) {
    const ratio = playerMilitary / (playerMilitary + targetMilitary);
    powerBonus = (ratio - 0.5) * 40;
  } else {
    powerBonus = 10;
  }

  // 性格 → ±15
  const personalityRaw = -personality.honor * 5 + -personality.boldness * 5 + personality.rationality * 5;
  const personalityBonus = clamp(personalityRaw, -15, 15);

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

// ── 执行 ──────────────────────────────────────────────

export interface DemandFealtyResult {
  success: boolean;
  chance: number;
  breakdown: FealtyChanceResult['breakdown'];
}

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

/** 预览成功率（不执行，不掷骰） */
export function previewDemandFealty(
  playerId: string,
  targetId: string,
): FealtyChanceResult {
  const charStore = useCharacterStore.getState();
  const player = charStore.getCharacter(playerId);
  const target = charStore.getCharacter(targetId);
  if (!player || !target) return { chance: 0, breakdown: { base: 50, opinion: 0, power: 0, personality: 0 } };

  const playerExpectedLeg = useTerritoryStore.getState().expectedLegitimacy.get(playerId) ?? null;
  const opinion = calculateBaseOpinion(target, player, playerExpectedLeg);
  const playerMil = getTotalMilitary(playerId);
  const targetMil = getTotalMilitary(targetId);
  const personality = calcPersonality(target);

  return calcFealtyChance(opinion, playerMil, targetMil, personality);
}

export function executeDemandFealty(
  playerId: string,
  targetId: string,
): DemandFealtyResult {
  const charStore = useCharacterStore.getState();
  const player = charStore.getCharacter(playerId);
  const target = charStore.getCharacter(targetId);
  if (!player || !target) return { success: false, chance: 0, breakdown: { base: 50, opinion: 0, power: 0, personality: 0 } };

  const playerExpectedLeg2 = useTerritoryStore.getState().expectedLegitimacy.get(playerId) ?? null;
  const opinion = calculateBaseOpinion(target, player, playerExpectedLeg2);
  const playerMil = getTotalMilitary(playerId);
  const targetMil = getTotalMilitary(targetId);
  const personality = calcPersonality(target);

  const { chance, breakdown } = calcFealtyChance(opinion, playerMil, targetMil, personality);

  const roll = random() * 100;
  const success = roll < chance;

  if (success) {
    charStore.updateCharacter(targetId, { overlordId: playerId });
    charStore.addOpinion(targetId, playerId, {
      reason: '要求效忠',
      value: -10,
      decayable: true,
    });
  } else {
    charStore.addOpinion(targetId, playerId, {
      reason: '拒绝效忠',
      value: -15,
      decayable: true,
    });
  }

  return { success, chance, breakdown };
}
