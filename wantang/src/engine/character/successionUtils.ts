import type { Character } from './types';
import type { Post, Territory } from '../territory/types';
import { positionMap } from '@data/positions';

/**
 * overlordId 链上溯：charId 是否（直接或间接）效忠 targetId。
 * maxDepth 防止循环引用，默认 10。
 */
export function isVassalOf(
  charId: string,
  targetId: string,
  characters: Map<string, Character>,
  maxDepth: number = 10,
): boolean {
  let current = charId;
  for (let i = 0; i < maxDepth; i++) {
    const c = characters.get(current);
    if (!c?.overlordId) return false;
    if (c.overlordId === targetId) return true;
    current = c.overlordId;
  }
  return false;
}

/**
 * 宗法继承人决算（纯函数）。
 * 优先级：
 *   1. 留后（post.designatedHeirId，存活）
 *   2. 最年长存活子嗣（family.childrenIds 按 birthYear 升序，取第一个存活者）
 *   3. 同族存活角色（clan 相同 且 isVassalOf(id, deadCharId)），按年龄降序取最年长
 * 返回继承人 charId 或 null
 */
export function resolveHeir(
  deadCharId: string,
  post: Post,
  characters: Map<string, Character>,
): string | null {
  const dead = characters.get(deadCharId);
  if (!dead) return null;

  // 1. 留后
  if (post.designatedHeirId) {
    const heir = characters.get(post.designatedHeirId);
    if (heir?.alive) return post.designatedHeirId;
  }

  // 2. 最年长存活男性子嗣
  const children = dead.family.childrenIds
    .map(id => characters.get(id))
    .filter((c): c is Character => !!c && c.alive && c.gender === '男')
    .sort((a, b) => a.birthYear - b.birthYear); // 升序 = 最年长优先
  if (children.length > 0) return children[0].id;

  // 3. 同族男性 + overlordId 链指向死者
  const clanMembers: Character[] = [];
  for (const c of characters.values()) {
    if (!c.alive || c.id === deadCharId || c.clan !== dead.clan || c.gender !== '男') continue;
    if (isVassalOf(c.id, deadCharId, characters)) {
      clanMembers.push(c);
    }
  }
  clanMembers.sort((a, b) => a.birthYear - b.birthYear);
  if (clanMembers.length > 0) return clanMembers[0].id;

  return null;
}

// ── NPC 留后评分 ──────────────────────────────────────────────────────────────

/**
 * 留后候选人评分（纯函数）。
 *
 * score = age × 3 + totalAbility × abilityFactor
 *
 * abilityFactor = clamp((boldness - honor + 2) / 4, 0, 1)
 *   传统（honor=+1, boldness=-1）→ 0，纯看年龄
 *   中性（均=0）                 → 0.5
 *   胆大（boldness=+1, honor=-1）→ 1.0，能力权重最大
 *
 * 备注：嫡出权重待家庭/生育系统完善后加入。
 */
export function scoreHeirCandidate(
  candidate: Character,
  rulerBoldness: number,
  rulerHonor: number,
  currentYear: number,
): number {
  const age = currentYear - candidate.birthYear;
  const { military, administration, strategy, diplomacy, scholarship } = candidate.abilities;
  const totalAbility = military + administration + strategy + diplomacy + scholarship;
  const abilityFactor = Math.max(0, Math.min(1, (rulerBoldness - rulerHonor + 2) / 4));
  return age * 3 + totalAbility * abilityFactor;
}

/**
 * NPC 选择最佳留后（纯函数）。
 * 规则：有子嗣则只考虑子嗣，无子嗣才考虑同族附庸。
 * 备注：宗族判定目前用 clan 相同，待家族系统完善后细化。
 */
export function selectDesignatedHeir(
  ruler: Character,
  characters: Map<string, Character>,
  rulerBoldness: number,
  rulerHonor: number,
  currentYear: number,
): string | null {
  // 1. 男性子嗣优先
  const children = ruler.family.childrenIds
    .map(id => characters.get(id))
    .filter((c): c is Character => !!c && c.alive && c.gender === '男');

  if (children.length > 0) {
    return pickBestCandidate(children, rulerBoldness, rulerHonor, currentYear);
  }

  // 2. 无男性子嗣 → 同族男性附庸
  const clanVassals: Character[] = [];
  for (const c of characters.values()) {
    if (!c.alive || c.id === ruler.id || c.clan !== ruler.clan || c.gender !== '男') continue;
    if (isVassalOf(c.id, ruler.id, characters)) {
      clanVassals.push(c);
    }
  }

  if (clanVassals.length > 0) {
    return pickBestCandidate(clanVassals, rulerBoldness, rulerHonor, currentYear);
  }

  return null;
}

/** 从候选人中选出评分最高者，同分取年长 */
function pickBestCandidate(
  candidates: Character[],
  boldness: number,
  honor: number,
  currentYear: number,
): string {
  let bestId = candidates[0].id;
  let bestScore = scoreHeirCandidate(candidates[0], boldness, honor, currentYear);
  let bestBirth = candidates[0].birthYear;

  for (let i = 1; i < candidates.length; i++) {
    const score = scoreHeirCandidate(candidates[i], boldness, honor, currentYear);
    if (score > bestScore || (score === bestScore && candidates[i].birthYear < bestBirth)) {
      bestId = candidates[i].id;
      bestScore = score;
      bestBirth = candidates[i].birthYear;
    }
  }

  return bestId;
}

/**
 * 沿领地 parentId 链向上找第一个有 holderId 的 grantsControl 主岗位持有人。
 * 用于绝嗣上交：当宗法继承无人时，岗位交给法理上级。
 * 从 post 所在领地的 **父领地** 开始查找（跳过自身）。
 */
export function findParentAuthority(
  post: Post,
  territories: Map<string, Territory>,
): string | null {
  if (!post.territoryId) return null;
  const selfTerritory = territories.get(post.territoryId);
  let parentId = selfTerritory?.parentId;

  while (parentId) {
    const parent = territories.get(parentId);
    if (!parent) return null;
    const mainPost = parent.posts.find(p => {
      const tpl = positionMap.get(p.templateId);
      return tpl?.grantsControl === true;
    });
    if (mainPost?.holderId) return mainPost.holderId;
    parentId = parent.parentId;
  }
  return null;
}

/**
 * 沿领地 parentId 链向上找辟署权持有人（含自身领地）。
 * 返回最近的 hasAppointRight=true 的 grantsControl 主岗位的 holderId，或 null。
 */
export function findAppointRightHolder(
  territoryId: string,
  territories: Map<string, Territory>,
): string | null {
  let current: string | undefined = territoryId;
  while (current) {
    const territory = territories.get(current);
    if (!territory) return null;
    const mainPost = territory.posts.find(p => {
      const tpl = positionMap.get(p.templateId);
      return tpl?.grantsControl === true;
    });
    if (mainPost?.holderId && mainPost.hasAppointRight) {
      return mainPost.holderId;
    }
    current = territory.parentId;
  }
  return null;
}
