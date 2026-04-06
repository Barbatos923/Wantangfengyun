// ===== 岗位管理计算（纯函数，不调用 getState） =====

import type { Territory, Post, TerritoryTier } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import type { War } from '@engine/military/types';
import { Era } from '@engine/types';
import { positionMap } from '@data/positions';

// ── 费用常量 ──────────────────────────────────────────────────

export const POST_MANAGE_COSTS = {
  createKingdom: { money: 500_000, prestige: 200 },
  createDao:    { money: 200_000, prestige: 100 },
  createEmperor: { money: 1_000_000, prestige: 500 },
  usurpGuo:     { money: 400_000, prestige: 150 },
  usurpDao:     { money: 200_000, prestige: 100 },
  destroyGuo:   { money: 0, prestige: 100 },
} as const;

// ── 控制比例阈值 ──────────────────────────────────────────────

const CREATE_KINGDOM_THRESHOLD = 0.5;
const CREATE_EMPEROR_THRESHOLD = 0.8;
const USURP_THRESHOLD = 0.5;

// ── 资格判定结果 ──────────────────────────────────────────────

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

// ── 辅助：判定角色是否在 actor 势力链中 ──────────────────────

/**
 * 沿 overlordId 递归上溯，判定 charId 是否最终效忠于 actorId。
 * charId === actorId 也返回 true（自身属于自己势力）。
 */
export function isInActorRealm(
  charId: string,
  actorId: string,
  characters: Map<string, Character>,
  maxDepth = 20,
): boolean {
  let current = charId;
  for (let i = 0; i <= maxDepth; i++) {
    if (current === actorId) return true;
    const char = characters.get(current);
    if (!char?.overlordId) return false;
    current = char.overlordId;
  }
  return false;
}

// ── 核心：势力范围对目标领地法理州的实际控制比例 ──────────────

/**
 * 计算 actor 势力范围对 targetTerritory 法理下所有 zhou 的控制比例。
 * 统一以州为最小单位：
 * - dao 级目标 → 统计直属 zhou 中有多少在 actor 势力中
 * - guo 级目标 → 递归统计所有下级 dao 下的 zhou（跨道统计）
 */
export function calcRealmControlRatio(
  targetTerritoryId: string,
  actorId: string,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
): number {
  const target = territories.get(targetTerritoryId);
  if (!target) return 0;

  // 收集所有法理 zhou
  const zhouIds = collectDeJureZhou(target, territories);
  if (zhouIds.length === 0) return 0;

  let controlled = 0;
  for (const zhouId of zhouIds) {
    const zhou = territories.get(zhouId);
    if (!zhou) continue;
    const controller = getGrantsControlHolder(zhou);
    if (controller && isInActorRealm(controller, actorId, characters)) {
      controlled++;
    }
  }

  return controlled / zhouIds.length;
}

/** 递归收集领地法理下所有 zhou 级领地 ID */
function collectDeJureZhou(territory: Territory, territories: Map<string, Territory>): string[] {
  if (territory.tier === 'zhou') return [territory.id];
  const result: string[] = [];
  for (const childId of territory.childIds) {
    const child = territories.get(childId);
    if (!child) continue;
    result.push(...collectDeJureZhou(child, territories));
  }
  return result;
}

/** 获取领地的 grantsControl 岗位持有人 */
function getGrantsControlHolder(territory: Territory): string | null {
  for (const p of territory.posts) {
    if (positionMap.get(p.templateId)?.grantsControl === true && p.holderId) {
      return p.holderId;
    }
  }
  return null;
}

/** 获取领地的 grantsControl 岗位（含空缺） */
function getGrantsControlPost(territory: Territory): Post | undefined {
  return territory.posts.find(p => positionMap.get(p.templateId)?.grantsControl === true);
}

// ── 创建岗位资格（guo 称王 / dao 建镇） ─────────────────────

export function canCreatePost(
  actorId: string,
  territoryId: string,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
): EligibilityResult {
  const territory = territories.get(territoryId);
  if (!territory) return { eligible: false, reason: '领地不存在' };
  if (territory.tier !== 'guo' && territory.tier !== 'dao') {
    return { eligible: false, reason: '只能在国级或道级领地创建' };
  }

  // 不能已有 grantsControl 岗位
  const existingPost = getGrantsControlPost(territory);
  if (existingPost) return { eligible: false, reason: '该领地已有主岗位' };

  // dao 级额外条件：必须控制治所州
  if (territory.tier === 'dao' && territory.capitalZhouId) {
    const capitalZhou = territories.get(territory.capitalZhouId);
    if (capitalZhou) {
      const capController = getGrantsControlHolder(capitalZhou);
      if (!capController || !isInActorRealm(capController, actorId, characters)) {
        return { eligible: false, reason: '必须控制治所州' };
      }
    }
  }

  // 势力控制比例
  const threshold = territory.tier === 'guo' ? CREATE_KINGDOM_THRESHOLD : USURP_THRESHOLD;
  const ratio = calcRealmControlRatio(territoryId, actorId, territories, characters);
  if (ratio < threshold) {
    return { eligible: false, reason: `控制比例不足（${Math.round(ratio * 100)}% < ${Math.round(threshold * 100)}%）` };
  }

  return { eligible: true };
}

// ── 称帝资格 ──────────────────────────────────────────────────

export function canCreateEmperor(
  actorId: string,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  era: Era,
): EligibilityResult {
  if (era !== Era.LuanShi) return { eligible: false, reason: '只有乱世才可称帝' };

  // 检查是否已有皇帝
  for (const t of territories.values()) {
    if (t.tier === 'tianxia') {
      const ep = t.posts.find(p => p.templateId === 'pos-emperor');
      if (ep?.holderId) return { eligible: false, reason: '已有皇帝' };
      if (ep) return { eligible: false, reason: '皇帝岗位已存在' };
    }
  }

  // 统计全部法理 zhou 的实际控制比例
  let totalZhou = 0;
  let controlledZhou = 0;
  for (const t of territories.values()) {
    if (t.tier === 'zhou') {
      totalZhou++;
      const controller = getGrantsControlHolder(t);
      if (controller && isInActorRealm(controller, actorId, characters)) {
        controlledZhou++;
      }
    }
  }
  if (totalZhou === 0) return { eligible: false, reason: '无州级领地' };

  const ratio = controlledZhou / totalZhou;
  if (ratio < CREATE_EMPEROR_THRESHOLD) {
    return { eligible: false, reason: `控制比例不足（${Math.round(ratio * 100)}% < ${Math.round(CREATE_EMPEROR_THRESHOLD * 100)}%）` };
  }

  return { eligible: true };
}

// ── 篡夺资格 ──────────────────────────────────────────────────

export function canUsurpPost(
  actorId: string,
  post: Post,
  territory: Territory,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  wars: War[],
): EligibilityResult {
  const tpl = positionMap.get(post.templateId);
  if (!tpl?.grantsControl) return { eligible: false, reason: '只能篡夺主岗位' };

  if (territory.tier !== 'guo' && territory.tier !== 'dao') {
    return { eligible: false, reason: '只能篡夺国级或道级岗位' };
  }

  if (!post.holderId) return { eligible: false, reason: '岗位无人持有' };
  if (post.holderId === actorId) return { eligible: false, reason: '你已持有此岗位' };

  // 不能篡夺自己势力内的臣属（应走剥夺/罢免流程）
  if (isInActorRealm(post.holderId, actorId, characters)) {
    return { eligible: false, reason: '不能篡夺自己的臣属' };
  }

  // dao 级额外条件：必须控制治所州
  if (territory.tier === 'dao' && territory.capitalZhouId) {
    const capitalZhou = territories.get(territory.capitalZhouId);
    if (capitalZhou) {
      const capController = getGrantsControlHolder(capitalZhou);
      if (!capController || !isInActorRealm(capController, actorId, characters)) {
        return { eligible: false, reason: '必须控制治所州' };
      }
    }
  }

  // 不能在与持有者的战争中篡夺
  const holderId = post.holderId;
  for (const war of wars) {
    if (war.status !== 'active') continue;
    const actorIsAttacker = war.attackerId === actorId || war.attackerParticipants.includes(actorId);
    const actorIsDefender = war.defenderId === actorId || war.defenderParticipants.includes(actorId);
    const holderIsAttacker = war.attackerId === holderId || war.attackerParticipants.includes(holderId);
    const holderIsDefender = war.defenderId === holderId || war.defenderParticipants.includes(holderId);
    if ((actorIsAttacker && holderIsDefender) || (actorIsDefender && holderIsAttacker)) {
      return { eligible: false, reason: '不能篡夺正在交战的对手' };
    }
  }

  // 势力控制比例
  const ratio = calcRealmControlRatio(territory.id, actorId, territories, characters);
  if (ratio < USURP_THRESHOLD) {
    return { eligible: false, reason: `控制比例不足（${Math.round(ratio * 100)}% < ${Math.round(USURP_THRESHOLD * 100)}%）` };
  }

  return { eligible: true };
}

// ── 销毁资格 ──────────────────────────────────────────────────

/**
 * @param actorHeldGrantsPosts - actor 持有的所有 grantsControl 岗位（用于判断是否为唯一最高岗位）
 */
export function canDestroyPost(
  actorId: string,
  post: Post,
  actorHeldGrantsPosts: Post[],
): EligibilityResult {
  if (post.holderId !== actorId) return { eligible: false, reason: '你未持有此岗位' };

  const tpl = positionMap.get(post.templateId);
  if (!tpl?.grantsControl) return { eligible: false, reason: '只能销毁主岗位' };

  // 查找岗位所在领地层级
  if (!tpl.tier || tpl.tier !== 'guo') return { eligible: false, reason: '只能销毁国级岗位' };

  // 不能销毁唯一的 grantsControl 岗位
  if (actorHeldGrantsPosts.length <= 1) {
    return { eligible: false, reason: '不能销毁唯一的主岗位' };
  }

  return { eligible: true };
}

// ── 费用计算 ──────────────────────────────────────────────────

export function calcPostManageCost(
  action: 'create' | 'createEmperor' | 'usurp' | 'destroy',
  tier: TerritoryTier,
): { money: number; prestige: number } {
  switch (action) {
    case 'create': return tier === 'dao'
      ? { ...POST_MANAGE_COSTS.createDao }
      : { ...POST_MANAGE_COSTS.createKingdom };
    case 'createEmperor': return { ...POST_MANAGE_COSTS.createEmperor };
    case 'usurp': return tier === 'guo'
      ? { ...POST_MANAGE_COSTS.usurpGuo }
      : { ...POST_MANAGE_COSTS.usurpDao };
    case 'destroy': return { ...POST_MANAGE_COSTS.destroyGuo };
  }
}
