// ===== 岗位查询（纯函数，参数传入） =====

import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { getEffectiveAbilities } from '@engine/character/characterUtils';

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
 * 返回所有由指定角色任命的、仍存活的下属角色列表。
 */
export function getSubordinates(
  charId: string,
  characters: Map<string, Character>,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): Character[] {
  const subordinateIds = new Set<string>();

  for (const t of territories.values()) {
    for (const post of t.posts) {
      if (post.appointedBy === charId && post.holderId && post.holderId !== charId) {
        subordinateIds.add(post.holderId);
      }
    }
  }
  for (const post of centralPosts) {
    if (post.appointedBy === charId && post.holderId && post.holderId !== charId) {
      subordinateIds.add(post.holderId);
    }
  }

  const result: Character[] = [];
  for (const sid of subordinateIds) {
    const c = characters.get(sid);
    if (c?.alive) result.push(c);
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
