// ===== 铨选系统（纯函数，不调用 getState） =====

import type { Character } from '@engine/character/types';
import type { Post, Territory } from '@engine/territory/types';
import type { GameDate } from '@engine/types';
import { positionMap } from '@data/positions';
import { isVassalOf, findAppointRightHolder } from '@engine/character/successionUtils';
import { getHeldPosts, findEmperorId } from './postQueries';

/** 候选人层次 */
export type CandidateTier = 'promote' | 'transfer' | 'fresh';

/** 候选人条目 */
export interface CandidateEntry {
  character: Character;
  tier: CandidateTier;
  score: number;
  currentPost?: Post;
}

/** 获取岗位的有效 minRank（minRankOverride 优先） */
export function getEffectiveMinRank(post: Post): number {
  if (post.minRankOverride != null) return post.minRankOverride;
  const tpl = positionMap.get(post.templateId);
  return tpl?.minRank ?? 1;
}

/**
 * 确定某空缺岗位的铨选经办人 ID。
 *
 * 规则：
 * 1. 辟署权保护 → 辟署权持有人（>=18品本人，<18品查节度判官 pos-panguan，判官空缺 fallback 本人）
 * 2. 朝廷直辖 → >=18品查宰相 pos-zaixiang，<18品查吏部尚书 pos-guanlibu-shangshu，空缺 fallback 皇帝
 */
export function resolveAppointAuthority(
  post: Post,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): string | null {
  const effectiveRank = getEffectiveMinRank(post);

  // 1. 辟署权检查：辟署权持有人直接经办所有域内岗位
  if (post.territoryId) {
    const rightHolder = findAppointRightHolder(post.territoryId, territories);
    if (rightHolder) return rightHolder;
  }

  // 2. 朝廷直辖
  const emperor = findEmperorId(territories, centralPosts);
  if (effectiveRank >= 17) {
    const zaixiang = centralPosts.find(p => p.templateId === 'pos-zaixiang')?.holderId;
    return zaixiang ?? emperor ?? null;
  }
  const libu = centralPosts.find(p => p.templateId === 'pos-guanlibu-shangshu')?.holderId;
  return libu ?? emperor ?? null;
}

/**
 * 从铨选经办人推导法理任命主体。
 * - 朝廷体系（吏部/宰相经办）→ 皇帝 ID
 * - 辟署权体系（节度判官经办）→ 辟署权持有人 ID
 * - 本人就是最终主体 → 本人 ID
 */
export function resolveLegalAppointer(
  executorId: string,
  post: Post,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): string {
  // 检查岗位是否在辟署权范围内
  if (post.territoryId) {
    const rightHolder = findAppointRightHolder(post.territoryId, territories);
    if (rightHolder) return rightHolder; // 辟署权持有人是法理主体
  }
  // 朝廷体系：法理主体是皇帝
  const emperor = findEmperorId(territories, centralPosts);
  return emperor ?? executorId;
}

/**
 * 沿效忠链上溯到 appointerId，检查中间是否经过其他辟署权持有人。
 * 若经过则返回 true（被辟署权保护，不可调用）。
 */
function isBlockedByAppointRight(
  charId: string,
  appointerId: string,
  characters: Map<string, Character>,
  appointRightHolders: Set<string>,
): boolean {
  let current = charId;
  for (let i = 0; i < 10; i++) {
    const c = characters.get(current);
    if (!c?.overlordId) return false;
    if (c.overlordId === appointerId) return false; // 到达法理主体，链上没有阻断
    if (appointRightHolders.has(c.overlordId)) return true; // 经过了别人的辟署权
    current = c.overlordId;
  }
  return false;
}

/**
 * 生成候选人池。
 *
 * 硬性前提：
 * - alive && official 存在
 * - overlordId 追溯链指向 legalAppointerId（法理主体，不是经办人）
 * - rankLevel >= 空缺岗位的有效 minRank
 *
 * 三层分组 + 综合评分。
 *
 * 注意：appointerId 参数应传法理主体 ID（皇帝/辟署权持有人），不传经办人 ID。
 */
export function generateCandidates(
  vacantPost: Post,
  appointerId: string,
  characters: Map<string, Character>,
  territories: Map<string, Territory>,
  centralPosts: Post[],
  currentDate?: GameDate,
): CandidateEntry[] {
  const effectiveRank = getEffectiveMinRank(vacantPost);
  const tpl = positionMap.get(vacantPost.templateId);
  // 判断文武：看模板的 territoryType，military 则取 military 能力，否则取 administration
  const isMillitary = tpl?.territoryType === 'military';

  // 收集所有辟署权持有人 ID（用于排除独立王国内的人）
  const appointRightHolders = new Set<string>();
  for (const t of territories.values()) {
    for (const p of t.posts) {
      if (p.hasAppointRight && p.holderId) {
        const ptpl = positionMap.get(p.templateId);
        if (ptpl?.grantsControl) appointRightHolders.add(p.holderId);
      }
    }
  }

  const result: CandidateEntry[] = [];

  for (const char of characters.values()) {
    // 硬性前提
    if (!char.alive || !char.official) continue;
    if (char.id === appointerId) continue; // 法理主体（皇帝/辟署权持有人）不参与铨选
    if (char.official.rankLevel < effectiveRank) continue;
    // 效忠链必须指向法理主体（appointerId）
    if (!isVassalOf(char.id, appointerId, characters)) continue;
    // 辟署权保护：效忠链上若经过非 appointerId 的辟署权持有人，排除
    if (isBlockedByAppointRight(char.id, appointerId, characters, appointRightHolders)) continue;

    // 综合评分
    const abilityValue = isMillitary ? char.abilities.military : char.abilities.administration;
    let score = Math.round(char.official.virtue * 0.4 + abilityValue * 0.2);

    // 判断层次
    const heldPosts = getHeldPosts(char.id, territories, centralPosts);
    const currentControlPost = heldPosts.find(p => positionMap.get(p.templateId)?.grantsControl);

    // 用于 tier 判定的"当前最高岗位"：优先 grantsControl 主岗位，否则取品级最高的副岗位
    const referencePost = currentControlPost
      ?? heldPosts.reduce<Post | undefined>((best, p) => {
        if (!best) return p;
        return getEffectiveMinRank(p) > getEffectiveMinRank(best) ? p : best;
      }, undefined);

    let tier: CandidateTier;
    if (!referencePost) {
      tier = 'fresh';
    } else {
      const currentRank = getEffectiveMinRank(referencePost);
      if (currentRank < effectiveRank) {
        tier = 'promote';
      } else if (currentRank === effectiveRank && referencePost.id !== vacantPost.id) {
        tier = 'transfer';
      } else {
        continue; // 品级更高或同岗位，不列入
      }
    }

    // 新任减益：最近被任命的角色评分大幅降低，36个月内线性衰减
    if (currentDate && referencePost?.appointedDate) {
      const ad = referencePost.appointedDate;
      const monthsSince = (currentDate.year - ad.year) * 12 + (currentDate.month - ad.month);
      const COOLDOWN_MONTHS = 36;
      if (monthsSince < COOLDOWN_MONTHS) {
        // 0个月 → -100，36个月 → 0
        const penalty = -Math.round(100 * (1 - monthsSince / COOLDOWN_MONTHS));
        score += penalty;
      }
    }

    result.push({ character: char, tier, score, currentPost: referencePost });
  }

  // 排序：纯按分数降序（tier 仅用于 UI 分组展示，不影响排序）
  result.sort((a, b) => b.score - a.score);

  return result;
}

/** 虚衔模板 ID，不进入铨选 */
export const HONORARY_TEMPLATES = new Set([
  'pos-zhongshuling', 'pos-shizhong', 'pos-shangshuling',
  'pos-taishi', 'pos-taifu', 'pos-taibao',
]);

/**
 * 获取所有需要某玩家/NPC 处理的空缺岗位。
 * 扫描地方岗位（主岗+副岗）和中央岗位，排除虚衔。
 * 治所州的 grantsControl 主岗跟随道级联动，不单独铨选。
 */
export function getPendingVacancies(
  playerId: string,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): Post[] {
  const result: Post[] = [];

  // 收集所有道的治所州 ID，治所主岗跟随道级联动
  const capitalZhouIds = new Set<string>();
  for (const t of territories.values()) {
    if (t.tier === 'dao' && t.capitalZhouId) {
      capitalZhouIds.add(t.capitalZhouId);
    }
  }

  // 地方岗位（主岗 + 副岗）
  for (const t of territories.values()) {
    for (const post of t.posts) {
      if (post.holderId !== null) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl) continue;
      if (HONORARY_TEMPLATES.has(post.templateId)) continue;
      // 治所州的 grantsControl 主岗跳过（跟随道级联动）
      if (tpl.grantsControl && capitalZhouIds.has(t.id)) continue;
      const authority = resolveAppointAuthority(post, territories, centralPosts);
      if (authority === playerId) {
        result.push(post);
      }
    }
  }

  // 中央岗位
  for (const post of centralPosts) {
    if (post.holderId !== null) continue;
    if (HONORARY_TEMPLATES.has(post.templateId)) continue;
    const authority = resolveAppointAuthority(post, territories, centralPosts);
    if (authority === playerId) {
      result.push(post);
    }
  }

  return result;
}
