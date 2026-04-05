// ===== 调任系统纯函数（不调用 getState） =====
//
// 京官（无地）与有地臣属之间的调任：品级匹配、候选人筛选、成功率计算。

import type { Character } from '@engine/character/types';
import type { Post, Territory } from '@engine/territory/types';
import type { Personality } from '@data/traits';
import { positionMap } from '@data/positions';
import { getEffectiveMinRank } from './selectionCalc';
import { getHeldPosts, findEmperorId } from './postQueries';
import { findAppointRightHolder } from '@engine/character/successionUtils';

// ── 品级匹配 ─────────────────────────────────────────────

type TerritorialTier = 'zhou' | 'dao' | 'guo';

/** 京官最高岗位品级 → 可匹配的地方岗位层级 */
export function getMatchingTier(centralRankLevel: number): TerritorialTier {
  if (centralRankLevel >= 25) return 'guo';
  if (centralRankLevel >= 13) return 'dao';
  return 'zhou';
}

/** 地方岗位层级 → 可匹配的京官品级范围 [min, max] */
export function getCentralRankRange(tier: string): [number, number] {
  if (tier === 'guo') return [25, 29];
  if (tier === 'dao') return [13, 24];
  return [1, 12];
}

// ── 角色分类 ─────────────────────────────────────────────

/** 判断角色是否为京官（持有 central 岗位、不持有 grantsControl 岗位） */
export function isCentralOfficial(
  charId: string,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): boolean {
  const posts = getHeldPosts(charId, territories, centralPosts);
  let hasCentral = false;
  for (const p of posts) {
    const tpl = positionMap.get(p.templateId);
    if (tpl?.grantsControl) return false; // 持有领地岗位 → 不是京官
    if (tpl?.scope === 'central') hasCentral = true;
  }
  return hasCentral;
}

/** 获取京官的最高中央岗位品级 */
export function getCentralMaxRank(
  charId: string,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): number {
  const posts = getHeldPosts(charId, territories, centralPosts);
  let maxRank = 0;
  for (const p of posts) {
    const tpl = positionMap.get(p.templateId);
    if (tpl?.scope === 'central') {
      maxRank = Math.max(maxRank, getEffectiveMinRank(p));
    }
  }
  return maxRank;
}

/** 获取京官持有的中央岗位列表（用于调任时移交） */
export function getCentralPostsHeld(
  charId: string,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): Post[] {
  const posts = getHeldPosts(charId, territories, centralPosts);
  return posts.filter(p => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.scope === 'central';
  });
}

// ── 候选人筛选 ─────────────────────────────────────────

export interface ReassignCandidate {
  character: Character;
  /** 京官候选人：持有的最高中央岗位 / 有地候选人：持有的 grantsControl 岗位 */
  post: Post;
  label: string;
  /** 预计算的成功率（有地候选人专用） */
  chance?: number;
}

/**
 * 获取可与指定京官配对的有地臣属候选人。
 * 条件：皇帝直接臣属、持有 grantsControl、无辟署权、品级匹配。
 */
export function getTerritorialCandidates(
  centralCharId: string,
  characters: Map<string, Character>,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): ReassignCandidate[] {
  const centralRank = getCentralMaxRank(centralCharId, territories, centralPosts);
  if (centralRank === 0) return [];

  const matchingTier = getMatchingTier(centralRank);
  const emperorId = findEmperorId(territories, centralPosts);
  if (!emperorId) return [];

  const result: ReassignCandidate[] = [];

  // 用皇帝臣属列表，而非全量遍历 characters
  for (const char of characters.values()) {
    if (!char.alive || !char.official) continue;
    if (char.overlordId !== emperorId) continue;
    if (char.id === centralCharId) continue;

    // 查找匹配层级的 grantsControl 岗位
    const posts = getHeldPosts(char.id, territories, centralPosts);

    // 任一岗位有辟署权 → 整体不可调任
    const hasAppointRight = posts.some(p => {
      const t = positionMap.get(p.templateId);
      return t?.grantsControl && p.territoryId && (p.hasAppointRight || findAppointRightHolder(p.territoryId, territories));
    });
    if (hasAppointRight) continue;

    for (const post of posts) {
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl || !post.territoryId) continue;

      // 层级匹配
      if (tpl.tier !== matchingTier) continue;

      const terr = territories.get(post.territoryId);
      result.push({
        character: char,
        post,
        label: `${terr?.name ?? ''}${tpl.name}`,
      });
      break; // 每人只取一个最匹配的岗位
    }
  }

  return result;
}

/**
 * 获取可与指定有地臣属配对的京官候选人。
 * 条件：持有 central 岗位、不持有 grantsControl、品级在匹配范围内。
 */
export function getCentralCandidates(
  targetPost: Post,
  characters: Map<string, Character>,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): ReassignCandidate[] {
  const tpl = positionMap.get(targetPost.templateId);
  if (!tpl?.grantsControl || !tpl.tier) return [];

  const [minRank, maxRank] = getCentralRankRange(tpl.tier);

  const result: ReassignCandidate[] = [];

  // 从 centralPosts（~50个）入手提取持有人，而非全量遍历 characters
  const seenHolders = new Set<string>();
  for (const cp of centralPosts) {
    if (!cp.holderId) continue;
    if (seenHolders.has(cp.holderId)) continue;
    seenHolders.add(cp.holderId);

    const cpTpl = positionMap.get(cp.templateId);
    if (!cpTpl || cpTpl.scope !== 'central') continue;

    const char = characters.get(cp.holderId);
    if (!char?.alive || !char.official) continue;
    if (char.id === targetPost.holderId) continue;

    // 不持有 grantsControl 岗位（纯京官）
    if (!isCentralOfficial(char.id, territories, centralPosts)) continue;

    // 品级匹配
    const rank = getCentralMaxRank(char.id, territories, centralPosts);
    if (rank < minRank || rank > maxRank) continue;

    // 获取最高中央岗位（用于展示）
    const cPosts = getCentralPostsHeld(char.id, territories, centralPosts);
    const bestPost = cPosts.reduce<Post | undefined>((best, p) =>
      !best || getEffectiveMinRank(p) > getEffectiveMinRank(best) ? p : best,
    undefined);
    if (!bestPost) continue;

    const postTpl = positionMap.get(bestPost.templateId);
    result.push({
      character: char,
      post: bestPost,
      label: postTpl?.name ?? '',
    });
  }

  // 按能力排序（文/武按目标岗位类型）
  const isMilitary = tpl.territoryType === 'military';
  result.sort((a, b) => {
    const aAbil = isMilitary ? a.character.abilities.military : a.character.abilities.administration;
    const bAbil = isMilitary ? b.character.abilities.military : b.character.abilities.administration;
    return bAbil - aAbil;
  });

  return result;
}

// ── 成功率计算 ─────────────────────────────────────────

/**
 * 计算调任成功率（纯函数，复用剥夺领地的结构）。
 * 影响因素：好感、军力比、品级差、正统性、荣誉/胆识。
 */
export function calcReassignChance(
  targetOpinion: number,
  actorStrength: number,
  targetStrength: number,
  actorRankLevel: number,
  targetRankLevel: number,
  actorLegitimacy: number,
  targetPersonality: Personality,
): number {
  const ratio = targetStrength > 0 ? actorStrength / targetStrength : 2;

  let chance = 50;

  // 好感方向：target 对 actor 好感越高越服从
  chance += Math.max(-30, Math.min(30, targetOpinion * 0.5));

  // 兵力对比
  if (ratio >= 2) chance += 20;
  else if (ratio >= 1.5) chance += 10;
  else if (ratio < 0.8) chance -= 20;

  // 品级差：上级品级优势
  chance += (actorRankLevel - targetRankLevel) * 2;

  // 正统性
  if (actorLegitimacy > 60) chance += 10;
  else if (actorLegitimacy < 30) chance -= 10;

  // 被调任者性格
  chance += targetPersonality.honor * 10;       // 荣誉高→服从
  chance -= targetPersonality.boldness * 15;    // 胆大→反抗

  return Math.max(10, Math.min(95, Math.round(chance)));
}
