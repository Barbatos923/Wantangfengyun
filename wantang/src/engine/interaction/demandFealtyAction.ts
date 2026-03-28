// ===== "要求效忠"交互 =====

import type { Character } from '@engine/character/types';
import type { Personality } from '@data/traits';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
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

// ── canShow ──────────────────────────────────────────

function canDemandFealty(player: Character, target: Character): boolean {
  if (!target.alive) return false;
  if (target.overlordId === player.id) return false;

  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(target.id);

  // 只看 grantsControl 岗位（副岗位不算）
  const mainPosts = posts.filter(p => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.grantsControl === true;
  });

  if (mainPosts.length === 0) {
    // 无主岗位角色：无条件可要求
    return true;
  }

  // 有主岗位：检查法理管辖权
  return hasJurisdictionOver(player.id, mainPosts, terrStore);
}

/** 检查 player 是否对 target 的某个主岗位有法理管辖权 */
function hasJurisdictionOver(
  playerId: string,
  targetMainPosts: { territoryId?: string }[],
  terrStore: ReturnType<typeof useTerritoryStore.getState>,
): boolean {
  const territories = terrStore.territories;

  for (const post of targetMainPosts) {
    if (!post.territoryId) continue;
    // 沿 parentId 向上查找，看是否有 player 控制的领地
    let currentId: string | undefined = territories.get(post.territoryId)?.parentId;
    while (currentId) {
      const territory = territories.get(currentId);
      if (!territory) break;
      if (getActualController(territory) === playerId) return true;
      currentId = territory.parentId;
    }
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

  const opinion = calculateBaseOpinion(target, player);
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

  const opinion = calculateBaseOpinion(target, player);
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
