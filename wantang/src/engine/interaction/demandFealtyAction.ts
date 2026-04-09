// ===== "要求效忠"交互 =====

import type { Character } from '@engine/character/types';
import type { Post, Territory } from '@engine/territory/types';
import type { War } from '@engine/military/types';
import type { Personality } from '@data/traits';
import { getWarSide } from '@engine/military/warParticipantUtils';
import { registerInteraction } from './registry';
import { debugLog } from '@engine/debugLog';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { toAbsoluteDay } from '@engine/dateUtils';
import { calcPersonality } from '@engine/character/personalityUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { getActualController } from '@engine/official/postQueries';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { positionMap } from '@data/positions';
import { random } from '@engine/random';

/** 要求效忠冷却天数（约半年） */
export const DEMAND_FEALTY_COOLDOWN_DAYS = 180;

/** 注册要求效忠交互 */
registerInteraction({
  id: 'demandFealty',
  name: '要求效忠',
  icon: '🤝',
  canShow: (player, target) => {
    // 宽松：target 有地 + 非自己臣属 + 非自己 + 玩家有更高品级岗位
    if (player.id === target.id) return false;
    if (!target.alive || !target.isRuler) return false;
    if (target.overlordId === player.id) return false;
    const terrStore = useTerritoryStore.getState();
    const targetPosts = terrStore.getPostsByHolder(target.id);
    const playerPosts = terrStore.getPostsByHolder(player.id);
    const targetHasMain = targetPosts.some(p => positionMap.get(p.templateId)?.grantsControl);
    if (!targetHasMain) return false;
    const playerMaxRank = Math.max(0, ...playerPosts.map(p => positionMap.get(p.templateId)?.minRank ?? 0));
    const targetMaxRank = Math.max(0, ...targetPosts.filter(p => positionMap.get(p.templateId)?.grantsControl).map(p => positionMap.get(p.templateId)?.minRank ?? 0));
    return playerMaxRank > targetMaxRank;
  },
  canExecuteCheck: (player, target) => {
    if (canDemandFealty(player, target)) return null;
    const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
    if (player.lastDemandFealtyDay != null && currentDay - player.lastDemandFealtyDay < DEMAND_FEALTY_COOLDOWN_DAYS) {
      return '冷却中';
    }
    const activeWars = useWarStore.getState().getActiveWars();
    if (activeWars.some(w => {
      if (w.status !== 'active') return false;
      const pSide = getWarSide(player.id, w);
      const tSide = getWarSide(target.id, w);
      return pSide && tSide && pSide !== tSide;
    })) return '与对方交战中';
    return '非法理上级';
  },
  paramType: 'none',
});

// ── canShow 严格版（便捷版：读 Store） ──────────────────────────

function canDemandFealty(player: Character, target: Character): boolean {
  // 冷却检查：半年内不可重复使用
  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  if (player.lastDemandFealtyDay != null && currentDay - player.lastDemandFealtyDay < DEMAND_FEALTY_COOLDOWN_DAYS) {
    return false;
  }

  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const targetPosts = terrStore.getPostsByHolder(target.id);
  const playerPosts = terrStore.getPostsByHolder(player.id);
  const activeWars = useWarStore.getState().getActiveWars();
  return canDemandFealtyPure(player, target, terrStore.territories, targetPosts, playerPosts, activeWars, charStore.characters);
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
  characters?: Map<string, Character>,
): boolean {
  if (!target.alive) return false;
  if (player.id === target.id) return false;
  if (target.overlordId === player.id) return false;

  // 防环：target 不能是 player 的效忠链上的祖先（否则会形成环）
  if (characters) {
    let current = player.overlordId;
    const visited = new Set<string>();
    while (current) {
      if (current === target.id) return false;
      if (visited.has(current)) break;
      visited.add(current);
      current = characters.get(current)?.overlordId;
    }
  }

  // 双方在同一战争中处于对立面时不可要求效忠
  if (activeWars?.some(w => {
    if (w.status !== 'active') return false;
    const playerSide = getWarSide(player.id, w);
    const targetSide = getWarSide(target.id, w);
    return playerSide && targetSide && playerSide !== targetSide;
  })) return false;

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
  /** 执行瞬时校验失败（stale）：UI 应显示"局势已发生变化"，不要按 success=false 当作概率落败处理 */
  stale?: true;
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

  const terrState = useTerritoryStore.getState();
  const playerExpectedLeg = terrState.expectedLegitimacy.get(playerId) ?? null;
  const opinion = calculateBaseOpinion(target, player, playerExpectedLeg, terrState.policyOpinionCache.get(targetId) ?? null);
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
  if (!player?.alive || !target?.alive) {
    return { success: false, chance: 0, breakdown: { base: 50, opinion: 0, power: 0, personality: 0 }, stale: true };
  }

  // 瞬时重校验：弹窗打开后关系/资格可能变化，必须再跑一次 canDemandFealty
  if (!canDemandFealty(player, target)) {
    return { success: false, chance: 0, breakdown: { base: 50, opinion: 0, power: 0, personality: 0 }, stale: true };
  }

  const terrState2 = useTerritoryStore.getState();
  const playerExpectedLeg2 = terrState2.expectedLegitimacy.get(playerId) ?? null;
  const opinion = calculateBaseOpinion(target, player, playerExpectedLeg2, terrState2.policyOpinionCache.get(targetId) ?? null);
  const playerMil = getTotalMilitary(playerId);
  const targetMil = getTotalMilitary(targetId);
  const personality = calcPersonality(target);

  const { chance, breakdown } = calcFealtyChance(opinion, playerMil, targetMil, personality);

  const roll = random() * 100;
  const success = roll < chance;

  // 记录冷却
  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  charStore.updateCharacter(playerId, { lastDemandFealtyDay: currentDay });

  debugLog('interaction', `[要求效忠] ${player.name} → ${target.name} | chance=${chance}% → ${success ? '成功' : '失败'}`);

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
