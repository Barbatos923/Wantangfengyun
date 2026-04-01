// ===== 岗位查询（纯函数，参数传入） =====

import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { getEffectiveAbilities } from '@engine/character/characterUtils';

/**
 * 查找当前皇帝角色 ID。
 * 优先从 centralPosts 查，fallback 到 territories 中的 tianxia 级领地。
 */
export function findEmperorId(
  territories: Map<string, Territory>,
  centralPosts: Post[],
): string | null {
  const fromCentral = centralPosts.find(p => p.templateId === 'pos-emperor')?.holderId;
  if (fromCentral) return fromCentral;
  for (const t of territories.values()) {
    if (t.tier === 'tianxia') {
      const ep = t.posts.find(p => p.templateId === 'pos-emperor');
      if (ep?.holderId) return ep.holderId;
    }
  }
  return null;
}

/**
 * 获取领地的实际控制人 = 主岗位(grantsControl)的 holderId
 */
export function getActualController(territory: Territory): string | null {
  const mainPost = territory.posts.find(p => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.grantsControl === true;
  });
  return mainPost?.holderId ?? null;
}

/**
 * 收集所有持有 grantsControl 岗位的角色 ID（含皇帝）。
 */
export function collectRulerIds(territories: Map<string, Territory>): Set<string> {
  const ids = new Set<string>();
  for (const t of territories.values()) {
    for (const p of t.posts) {
      if (p.holderId && positionMap.get(p.templateId)?.grantsControl) {
        ids.add(p.holderId);
      }
    }
  }
  // 皇帝也是 ruler（其岗位 grantsControl=false 但身份上是统治者）
  for (const t of territories.values()) {
    if (t.tier === 'tianxia') {
      const ep = t.posts.find(p => p.templateId === 'pos-emperor');
      if (ep?.holderId) ids.add(ep.holderId);
    }
  }
  return ids;
}

/**
 * 获取角色持有的所有岗位（领地岗位 + 中央岗位）
 */
export function getHeldPosts(
  charId: string,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): Post[] {
  const posts: Post[] = [];
  for (const t of territories.values()) {
    for (const p of t.posts) {
      if (p.holderId === charId) posts.push(p);
    }
  }
  for (const p of centralPosts) {
    if (p.holderId === charId) posts.push(p);
  }
  return posts;
}

/**
 * 获取角色直辖的所有 zhou 级领地
 */
export function getControlledZhou(
  charId: string,
  territories: Map<string, Territory>,
): Territory[] {
  const result: Territory[] = [];
  for (const t of territories.values()) {
    if (t.tier === 'zhou' && getActualController(t) === charId) {
      result.push(t);
    }
  }
  return result;
}

/** 角色直辖州上限 = ceil(管理/5) */
export function getDirectControlLimit(char: Character): number {
  const abilities = getEffectiveAbilities(char);
  return Math.ceil(abilities.administration / 5);
}

/** 获取角色直辖的所有 zhou 级领地（参数为 Character 的便捷版本） */
export function getDirectControlledZhou(
  char: Character,
  territories: Map<string, Territory>,
): Territory[] {
  return getControlledZhou(char.id, territories);
}

/** 角色直辖州数是否超过上限 */
export function isOverDirectControlLimit(
  char: Character,
  territories: Map<string, Territory>,
): boolean {
  return getDirectControlledZhou(char, territories).length > getDirectControlLimit(char);
}

/** 直辖超额时的产出折扣系数 min(1, limit/actual) */
export function getDirectControlPenalty(
  char: Character,
  territories: Map<string, Territory>,
): number {
  const directCount = getDirectControlledZhou(char, territories).length;
  if (directCount === 0) return 1;
  const limit = getDirectControlLimit(char);
  return Math.min(1, limit / directCount);
}

/**
 * 返回效忠于指定角色且持有岗位的存活下属角色列表。
 * 判定依据：overlordId === charId + 持有至少一个岗位。
 */
export function getSubordinates(
  charId: string,
  characters: Map<string, Character>,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): Character[] {
  // 收集所有持有岗位的角色ID
  const postHolderIds = new Set<string>();
  for (const t of territories.values()) {
    for (const post of t.posts) {
      if (post.holderId && post.holderId !== charId) {
        postHolderIds.add(post.holderId);
      }
    }
  }
  for (const post of centralPosts) {
    if (post.holderId && post.holderId !== charId) {
      postHolderIds.add(post.holderId);
    }
  }

  // 臣属 = 效忠于我 + 持有岗位
  const result: Character[] = [];
  for (const c of characters.values()) {
    if (c.alive && c.overlordId === charId && postHolderIds.has(c.id)) {
      result.push(c);
    }
  }
  return result;
}

/**
 * 获取所有效忠于指定角色的存活角色（overlordId === charId）。
 */
export function getVassals(charId: string, characters: Map<string, Character>): Character[] {
  const result: Character[] = [];
  for (const c of characters.values()) {
    if (c.alive && c.overlordId === charId) result.push(c);
  }
  return result;
}

/**
 * 递归获取 charId 势力范围内的全部州数（直辖 + 所有层级附庸的直辖）。
 * 用于衡量势力大小、计算围城战争分数比例。
 */
export function getRealmZhouCount(
  charId: string,
  characters: Map<string, Character>,
  territories: Map<string, Territory>,
  visited?: Set<string>,
): number {
  const seen = visited ?? new Set<string>();
  if (seen.has(charId)) return 0;
  seen.add(charId);

  let count = getControlledZhou(charId, territories).length;
  for (const c of characters.values()) {
    if (c.alive && c.overlordId === charId) {
      count += getRealmZhouCount(c.id, characters, territories, seen);
    }
  }
  return count;
}
