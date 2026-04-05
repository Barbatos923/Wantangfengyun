// ===== "逼迫授权"交互 =====

import type { Character } from '@engine/character/types';
import type { Territory, TerritoryTier } from '@engine/territory/types';
import type { Personality } from '@data/traits';
import type { NpcContext } from '@engine/npc/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTurnManager } from '@engine/TurnManager';
import { toAbsoluteDay } from '@engine/dateUtils';
import { calcPersonality } from '@engine/character/personalityUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { hasAuthorityOverPost } from '@engine/npc/policyCalc';
import { executeToggleAppointRight, executeToggleSuccession } from './centralizationAction';
import { positionMap } from '@data/positions';
import { random } from '@engine/random';

/** 逼迫授权冷却天数（约一年） */
export const DEMAND_RIGHTS_COOLDOWN_DAYS = 360;

// ── 类型 ──────────────────────────────────────────────────

export type DemandableRight = 'appointRight' | 'clanSuccession';

export interface DemandablePost {
  postId: string;
  territoryId: string;
  territoryName: string;
  postName: string;
  tier: TerritoryTier;
  capitalZhouId?: string;
  availableRights: DemandableRight[];
}

export interface DemandRightsChanceResult {
  chance: number;
  breakdown: {
    base: number;
    opinion: number;
    power: number;
    personality: number;
  };
}

export interface DemandRightsResult {
  success: boolean;
  chance: number;
  breakdown: DemandRightsChanceResult['breakdown'];
}

// ── 注册交互 ──────────────────────────────────────────────

registerInteraction({
  id: 'demandRights',
  name: '逼迫授权',
  icon: '📜',
  canShow: (player, target) => canDemandRights(player, target),
  paramType: 'demandRights',
});

// ── canShow（便捷版：读 Store） ──────────────────────────

function canDemandRights(player: Character, target: Character): boolean {
  // 必须是 player 的领主
  if (player.overlordId !== target.id) return false;

  // 冷却检查
  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  if (player.lastDemandRightsDay != null && currentDay - player.lastDemandRightsDay < DEMAND_RIGHTS_COOLDOWN_DAYS) {
    return false;
  }

  const territories = useTerritoryStore.getState().territories;
  return canDemandRightsPure(player, target, territories);
}

// ── canDemandRights 纯函数版（供 NPC Engine 使用） ────────

/**
 * 判断 actor 能否逼迫 overlord 授权（纯函数）。
 * - actor 必须是 overlord 的臣属（actor.overlordId === overlord.id）
 * - actor 必须是统治者（isRuler）
 * - overlord 必须存活
 * - 至少有一个可逼迫的岗位
 */
export function canDemandRightsPure(
  actor: Character,
  overlord: Character,
  territories: Map<string, Territory>,
): boolean {
  if (!actor.alive || !overlord.alive) return false;
  if (!actor.isRuler) return false;
  if (actor.overlordId !== overlord.id) return false;

  // 检查是否有可逼迫的岗位
  return getDemandablePostsFromTerritories(actor.id, overlord.id, territories).length > 0;
}

// ── 可逼迫岗位查询 ──────────────────────────────────────

/** 从 territories Map 获取可逼迫的岗位列表（纯函数，UI 和 NPC 共用） */
function getDemandablePostsFromTerritories(
  actorId: string,
  overlordId: string,
  territories: Map<string, Territory>,
): DemandablePost[] {
  const result: DemandablePost[] = [];

  for (const terr of territories.values()) {
    for (const post of terr.posts) {
      if (post.holderId !== actorId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;

      // overlord 必须有权限修改此岗位政策
      if (!hasAuthorityOverPost(overlordId, terr.id, territories)) continue;

      const rights: DemandableRight[] = [];
      if (!post.hasAppointRight) rights.push('appointRight');
      if (post.successionLaw === 'bureaucratic') rights.push('clanSuccession');

      if (rights.length > 0) {
        result.push({
          postId: post.id,
          territoryId: terr.id,
          territoryName: terr.name,
          postName: tpl.name,
          tier: terr.tier,
          capitalZhouId: terr.capitalZhouId,
          availableRights: rights,
        });
      }
    }
  }

  return result;
}

/** Store 版：供 UI 使用 */
export function getDemandablePosts(actorId: string, overlordId: string): DemandablePost[] {
  const territories = useTerritoryStore.getState().territories;
  return getDemandablePostsFromTerritories(actorId, overlordId, territories);
}

/** NPC Context 版：供 NPC 行为使用（holderIndex 定位，O(N_post_held)） */
export function getDemandablePostsFromCtx(
  actorId: string,
  overlordId: string,
  ctx: NpcContext,
): DemandablePost[] {
  const postIds = ctx.holderIndex.get(actorId);
  if (!postIds) return [];

  const result: DemandablePost[] = [];
  for (const pid of postIds) {
    const post = ctx.postIndex.get(pid);
    if (!post?.territoryId) continue;
    const tpl = positionMap.get(post.templateId);
    if (!tpl?.grantsControl) continue;

    const terr = ctx.territories.get(post.territoryId);
    if (!terr) continue;

    if (!hasAuthorityOverPost(overlordId, terr.id, ctx.territories)) continue;

    const rights: DemandableRight[] = [];
    if (!post.hasAppointRight) rights.push('appointRight');
    if (post.successionLaw === 'bureaucratic') rights.push('clanSuccession');

    if (rights.length > 0) {
      result.push({
        postId: post.id,
        territoryId: terr.id,
        territoryName: terr.name,
        postName: tpl.name,
        tier: terr.tier,
        capitalZhouId: terr.capitalZhouId,
        availableRights: rights,
      });
    }
  }
  return result;
}

// ── 成功率计算（纯函数） ──────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 计算逼迫授权成功率。
 * 设计偏低：基础5%，好感>30才有正加成，上限70%。
 */
export function calcDemandRightsChance(
  opinion: number,
  actorMilitary: number,
  overlordMilitary: number,
  overlordPersonality: Personality,
): DemandRightsChanceResult {
  const base = 5;

  // 好感：>30才有正加成，否则轻微惩罚
  const opinionBonus = opinion > 30
    ? clamp((opinion - 30) / 2.8, 0, 25)
    : clamp(opinion / 5, -10, 0);

  // 兵力比：需要强势优势
  let powerBonus: number;
  if (actorMilitary + overlordMilitary > 0) {
    const ratio = actorMilitary / (actorMilitary + overlordMilitary);
    powerBonus = clamp((ratio - 0.5) * 50, -25, 25);
  } else {
    powerBonus = 0;
  }

  // 目标性格：荣誉/理性更容易让步，胆量更抗拒
  const personalityRaw =
    overlordPersonality.honor * 5 +
    overlordPersonality.rationality * 4 -
    overlordPersonality.boldness * 6;
  const personalityBonus = clamp(personalityRaw, -15, 15);

  const chance = clamp(
    Math.round(base + opinionBonus + powerBonus + personalityBonus),
    5, 70,
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

/** 预览成功率（不执行，不掷骰） */
export function previewDemandRights(
  actorId: string,
  overlordId: string,
): DemandRightsChanceResult {
  const charStore = useCharacterStore.getState();
  const actor = charStore.getCharacter(actorId);
  const overlord = charStore.getCharacter(overlordId);
  if (!actor || !overlord) return { chance: 0, breakdown: { base: 5, opinion: 0, power: 0, personality: 0 } };

  const terrState = useTerritoryStore.getState();
  const overlordExpLeg = terrState.expectedLegitimacy.get(overlordId) ?? null;
  const opinion = calculateBaseOpinion(overlord, actor, overlordExpLeg, terrState.policyOpinionCache.get(overlordId) ?? null);
  const actorMil = getTotalMilitary(actorId);
  const overlordMil = getTotalMilitary(overlordId);
  const overlordPersonality = calcPersonality(overlord);

  return calcDemandRightsChance(opinion, actorMil, overlordMil, overlordPersonality);
}

/** 执行逼迫授权（掷骰 + 记录冷却 + 好感变化 + 授权） */
export function executeDemandRights(
  actorId: string,
  overlordId: string,
  postId: string,
  right: DemandableRight,
): DemandRightsResult {
  const charStore = useCharacterStore.getState();
  const actor = charStore.getCharacter(actorId);
  const overlord = charStore.getCharacter(overlordId);
  if (!actor || !overlord) return { success: false, chance: 0, breakdown: { base: 5, opinion: 0, power: 0, personality: 0 } };

  const terrState = useTerritoryStore.getState();
  const overlordExpLeg = terrState.expectedLegitimacy.get(overlordId) ?? null;
  const opinion = calculateBaseOpinion(overlord, actor, overlordExpLeg, terrState.policyOpinionCache.get(overlordId) ?? null);
  const actorMil = getTotalMilitary(actorId);
  const overlordMil = getTotalMilitary(overlordId);
  const overlordPersonality = calcPersonality(overlord);

  const { chance, breakdown } = calcDemandRightsChance(opinion, actorMil, overlordMil, overlordPersonality);

  const roll = random() * 100;
  const success = roll < chance;

  // 记录冷却
  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  charStore.updateCharacter(actorId, { lastDemandRightsDay: currentDay });

  const rightLabel = right === 'appointRight' ? '辟署权' : '宗法继承权';
  console.log(`[逼迫授权] ${actor.name} → ${overlord.name} (${rightLabel}) | chance=${chance}% → ${success ? '成功' : '失败'}`);

  if (success) {
    // 授权
    if (right === 'appointRight') {
      executeToggleAppointRight(postId);
    } else {
      const post = terrState.findPost(postId);
      const terr = post?.territoryId ? terrState.territories.get(post.territoryId) : undefined;
      executeToggleSuccession(postId, terr?.capitalZhouId, terrState.territories);
    }
    // 上级对下级不满
    charStore.addOpinion(overlordId, actorId, {
      reason: '逼迫授权',
      value: -20,
      decayable: true,
    });
  } else {
    // 失败：大量好感降低
    charStore.addOpinion(overlordId, actorId, {
      reason: '逼迫授权失败',
      value: -35,
      decayable: true,
    });
  }

  return { success, chance, breakdown };
}
