// ===== "归附"交互 — 玩家主动向相邻更高等级独立统治者宣誓效忠 =====

import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import type { War } from '@engine/military/types';
import type { Personality } from '@data/traits';
import { getWarSide } from '@engine/military/warParticipantUtils';
import { registerInteraction } from './registry';
import { debugLog } from '@engine/debugLog';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { toAbsoluteDay } from '@engine/dateUtils';
import { calcPersonality } from '@engine/character/personalityUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { getActualController, getSovereigntyTier, findEmperorId } from '@engine/official/postQueries';
import { random } from '@engine/random';
import { buildZhouAdjacency } from '@engine/military/deployCalc';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { EventPriority } from '@engine/types';

/** 归附冷却天数（约半年） */
export const PLEDGE_ALLEGIANCE_COOLDOWN_DAYS = 180;

/** 注册归附交互 */
registerInteraction({
  id: 'pledgeAllegiance',
  name: '归附',
  icon: '🏳️',
  canShow: (player, target) => {
    // 宽松：双方独立 + target 主权层级更高
    // 注意：层级口径用 getSovereigntyTier，而不是直辖领地 tier 最大值——后者会丢皇帝身份
    // （pos-emperor 不是 grantsControl），导致独立 dao ruler 看不到归附皇帝的入口。
    if (player.id === target.id) return false;
    if (!target.alive) return false;
    if (player.overlordId != null || target.overlordId != null) return false;
    const terrStore = useTerritoryStore.getState();
    const playerTier = getSovereigntyTier(player.id, terrStore.territories, terrStore.centralPosts);
    const targetTier = getSovereigntyTier(target.id, terrStore.territories, terrStore.centralPosts);
    if (playerTier === 0 || targetTier === 0) return false;
    return targetTier > playerTier;
  },
  canExecuteCheck: (player, target) => {
    if (canPledgeAllegiance(player, target)) return null;
    // 找出原因
    const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
    if (player.lastPledgeAllegianceDay != null && currentDay - player.lastPledgeAllegianceDay < PLEDGE_ALLEGIANCE_COOLDOWN_DAYS) {
      return '冷却中';
    }
    const activeWars = useWarStore.getState().getActiveWars();
    if (activeWars.some(w => {
      if (w.status !== 'active') return false;
      const pSide = getWarSide(player.id, w);
      const tSide = getWarSide(target.id, w);
      return pSide && tSide && pSide !== tSide;
    })) return '与对方交战中';
    return '领地不相邻';
  },
  paramType: 'none',
});

// ── canShow 严格版（便捷版：读 Store） ──────────────────────────

function canPledgeAllegiance(player: Character, target: Character): boolean {
  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  if (player.lastPledgeAllegianceDay != null && currentDay - player.lastPledgeAllegianceDay < PLEDGE_ALLEGIANCE_COOLDOWN_DAYS) {
    return false;
  }

  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const activeWars = useWarStore.getState().getActiveWars();
  return canPledgeAllegiancePure(
    player,
    target,
    terrStore.territories,
    terrStore.controllerIndex,
    charStore.vassalIndex,
    activeWars,
    terrStore.centralPosts,
  );
}

// ── canPledgeAllegiance 纯函数版 ─────────────────────────

/**
 * 判断 player 能否向 target 归附（纯函数，不读 Store）。
 *
 * 规则：
 * - player 必须是独立统治者（无领主）
 * - target 必须是独立统治者（无领主）
 * - target 最高头衔等级(TerritoryTier)严格高于 player
 * - target 控制领地与 player 控制领地相邻
 * - 双方不在对立战争中
 */
export function canPledgeAllegiancePure(
  player: Character,
  target: Character,
  territories: Map<string, Territory>,
  controllerIndex: Map<string, Set<string>>,
  vassalIndex: Map<string, Set<string>>,
  activeWars?: War[],
  centralPosts?: import('@engine/territory/types').Post[],
): boolean {
  if (!target.alive) return false;
  if (player.id === target.id) return false;
  // 双方都必须独立
  if (player.overlordId != null) return false;
  if (target.overlordId != null) return false;

  // 双方在同一战争中处于对立面时不可归附
  if (activeWars?.some(w => {
    if (w.status !== 'active') return false;
    const playerSide = getWarSide(player.id, w);
    const targetSide = getWarSide(target.id, w);
    return playerSide && targetSide && playerSide !== targetSide;
  })) return false;

  // 主权层级检查：target 必须严格高于 player（口径用 getSovereigntyTier，含皇帝身份）
  const cps = centralPosts ?? [];
  const playerTier = getSovereigntyTier(player.id, territories, cps);
  const targetTier = getSovereigntyTier(target.id, territories, cps);
  if (playerTier === 0 || targetTier === 0) return false;
  if (targetTier <= playerTier) return false;

  // 至少各自有一块领地（用于后续邻接检查）
  const playerTerritories = controllerIndex.get(player.id);
  const targetTerritories = controllerIndex.get(target.id);
  if (!playerTerritories?.size || !targetTerritories?.size) return false;

  // 领地相邻检查：player 控制的州 与 target 势力范围内的州 存在邻接边
  // target 势力范围 = target 本人 + 所有直接/间接臣属 控制的州
  const targetRealmZhou = collectRealmZhou(target.id, controllerIndex, vassalIndex, territories);
  const playerZhou = collectZhou(playerTerritories, territories);
  if (!hasAdjacentZhou(playerZhou, targetRealmZhou)) return false;

  return true;
}

/** 收集一组领地 ID 中的州级领地 */
function collectZhou(terrIds: Set<string>, territories: Map<string, Territory>): Set<string> {
  const result = new Set<string>();
  for (const tId of terrIds) {
    const t = territories.get(tId);
    if (t?.tier === 'zhou') result.add(tId);
  }
  return result;
}

/** 递归收集某统治者势力范围内的所有州级领地（本人 + 所有臣属） */
function collectRealmZhou(
  rulerId: string,
  controllerIndex: Map<string, Set<string>>,
  vassalIndex: Map<string, Set<string>>,
  territories: Map<string, Territory>,
): Set<string> {
  const result = new Set<string>();
  const stack = [rulerId];
  while (stack.length > 0) {
    const charId = stack.pop()!;
    const controlled = controllerIndex.get(charId);
    if (controlled) {
      for (const tId of controlled) {
        const t = territories.get(tId);
        if (t?.tier === 'zhou') result.add(tId);
      }
    }
    const vassals = vassalIndex.get(charId);
    if (vassals) {
      for (const vId of vassals) stack.push(vId);
    }
  }
  return result;
}

/** 检查两组州级领地是否存在邻接边 */
function hasAdjacentZhou(zhouA: Set<string>, zhouB: Set<string>): boolean {
  if (zhouA.size === 0 || zhouB.size === 0) return false;
  const adj = buildZhouAdjacency();
  for (const zId of zhouA) {
    const neighbors = adj.get(zId);
    if (!neighbors) continue;
    for (const nId of neighbors) {
      if (zhouB.has(nId)) return true;
    }
  }
  return false;
}

// ── 成功率计算（纯函数） ──────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface PledgeAllegianceChanceResult {
  chance: number;
  breakdown: {
    base: number;
    dejure: number;
    opinion: number;
    personality: number;
  };
}

/**
 * 检查 player 是否是 target 的法理附庸
 * 沿 parentId 链向上遍历，只要链上任一领地由 target 控制即为法理附庸
 * （例：安南州→岭南道→天下，若天下由 target 控制则成立）
 */
function isDejureVassalOf(
  playerId: string,
  targetId: string,
  territories: Map<string, Territory>,
  controllerIndex: Map<string, Set<string>>,
  centralPosts: import('@engine/territory/types').Post[],
): boolean {
  const playerTerritories = controllerIndex.get(playerId);
  if (!playerTerritories) return false;
  // tianxia 父级"控制者"= 当前皇帝（pos-emperor 不是 grantsControl，getActualController 会漏）
  const emperorId = findEmperorId(territories, centralPosts);
  for (const tId of playerTerritories) {
    let current = territories.get(tId);
    const visited = new Set<string>();
    while (current?.parentId) {
      if (visited.has(current.parentId)) break;
      visited.add(current.parentId);
      const parent = territories.get(current.parentId);
      if (!parent) break;
      const parentRuler = parent.tier === 'tianxia' ? emperorId : getActualController(parent);
      if (parentRuler === targetId) return true;
      current = parent;
    }
  }
  return false;
}

export function calcPledgeAllegianceChance(
  opinion: number,
  personality: Personality,
  isDejure: boolean,
): PledgeAllegianceChanceResult {
  const base = 70;

  // 法理附庸 +20，非法理 -10
  const dejureBonus = isDejure ? 20 : -10;

  // 好感度 → ±15
  const opinionBonus = clamp(opinion / 6, -15, 15);

  // 性格 → ±10（贪婪+理性 → 接受，荣誉 → 不屑）
  const personalityRaw = personality.greed * 3 + personality.rationality * 3 - personality.honor * 3;
  const personalityBonus = clamp(personalityRaw, -10, 10);

  const chance = clamp(
    Math.round(base + dejureBonus + opinionBonus + personalityBonus),
    5, 95,
  );

  return {
    chance,
    breakdown: {
      base,
      dejure: dejureBonus,
      opinion: Math.round(opinionBonus),
      personality: Math.round(personalityBonus),
    },
  };
}

// ── 执行 ──────────────────────────────────────────────

export interface PledgeAllegianceResult {
  success: boolean;
  chance: number;
  breakdown: PledgeAllegianceChanceResult['breakdown'];
  /** 执行瞬时校验失败（stale）：UI 显示"局势已发生变化"，不要等同于"对方拒绝" */
  stale?: true;
}

/** 预览成功率（不执行，不掷骰） */
export function previewPledgeAllegiance(
  playerId: string,
  targetId: string,
): PledgeAllegianceChanceResult {
  const charStore = useCharacterStore.getState();
  const player = charStore.getCharacter(playerId);
  const target = charStore.getCharacter(targetId);
  if (!player || !target) return { chance: 0, breakdown: { base: 70, dejure: 0, opinion: 0, personality: 0 } };

  const terrState = useTerritoryStore.getState();
  const playerExpectedLeg = terrState.expectedLegitimacy.get(playerId) ?? null;
  const opinion = calculateBaseOpinion(target, player, playerExpectedLeg, terrState.policyOpinionCache.get(targetId) ?? null, terrState.policyOpinionCache.get(playerId) ?? null);
  const personality = calcPersonality(target);
  const isDejure = isDejureVassalOf(player.id, target.id, terrState.territories, terrState.controllerIndex, terrState.centralPosts);

  return calcPledgeAllegianceChance(opinion, personality, isDejure);
}

export function executePledgeAllegiance(
  playerId: string,
  targetId: string,
): PledgeAllegianceResult {
  const charStore = useCharacterStore.getState();
  const player = charStore.getCharacter(playerId);
  const target = charStore.getCharacter(targetId);
  if (!player?.alive || !target?.alive) {
    return { success: false, chance: 0, breakdown: { base: 70, dejure: 0, opinion: 0, personality: 0 }, stale: true };
  }

  // 瞬时重校验：仍独立 / 主权层级仍成立 / 仍相邻 / 不在敌对战争
  if (!canPledgeAllegiance(player, target)) {
    return { success: false, chance: 0, breakdown: { base: 70, dejure: 0, opinion: 0, personality: 0 }, stale: true };
  }

  const terrState = useTerritoryStore.getState();
  const playerExpectedLeg = terrState.expectedLegitimacy.get(playerId) ?? null;
  const opinion = calculateBaseOpinion(target, player, playerExpectedLeg, terrState.policyOpinionCache.get(targetId) ?? null, terrState.policyOpinionCache.get(playerId) ?? null);
  const personality = calcPersonality(target);
  const isDejure = isDejureVassalOf(player.id, target.id, terrState.territories, terrState.controllerIndex, terrState.centralPosts);

  const { chance, breakdown } = calcPledgeAllegianceChance(opinion, personality, isDejure);

  const roll = random() * 100;
  const success = roll < chance;

  // 记录冷却 + 成功时设 overlordId（合并为单次 updateCharacter）
  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  const patch: Partial<typeof player> = { lastPledgeAllegianceDay: currentDay };
  if (success) patch.overlordId = targetId; // overlordId 变更自动重置 centralization 为 undefined（等效默认2级）
  charStore.updateCharacter(playerId, patch);

  debugLog('interaction', `[归附] ${player.name} → ${target.name} | chance=${chance}% → ${success ? '成功' : '失败'}`);

  if (success) {
    charStore.addOpinion(targetId, playerId, {
      reason: '归附',
      value: 10,
      decayable: true,
    });
    // 史书 emit：主权变动，Major
    emitChronicleEvent({
      type: '归附',
      actors: [playerId, targetId],
      territories: [],
      description: `${player.name}率众归附${target.name}`,
      priority: EventPriority.Major,
    });
  } else {
    charStore.addOpinion(playerId, targetId, {
      reason: '拒绝归附',
      value: -5,
      decayable: true,
    });
  }

  return { success, chance, breakdown };
}
