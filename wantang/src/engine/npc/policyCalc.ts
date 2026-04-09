// ===== NPC 政策行为纯函数 =====

import type { NpcContext } from './types';
import type { Post, Territory, TerritoryTier, TerritoryType } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { MILITARY_TO_CIVIL, CIVIL_TO_MILITARY } from '@engine/interaction/centralizationAction';

// ── 通用讨好评估（可复用于送礼等行为） ──────────────────────────────────────

export interface AppeasementTarget {
  vassalId: string;
  /** 正=需讨好，负=安全可集权 */
  urgency: number;
}

/**
 * 评估 actor 的每个臣属是否需要讨好。
 * urgency > 0 表示需讨好（放权），< 0 表示安全（可集权）。
 */
export function evaluateAppeasementTargets(
  actorId: string,
  ctx: NpcContext,
): AppeasementTarget[] {
  const personality = ctx.personalityCache.get(actorId);
  if (!personality) return [];

  const actorStr = ctx.getMilitaryStrength(actorId);
  const targets: AppeasementTarget[] = [];

  const vassalIds = ctx.vassalIndex.get(actorId);
  if (!vassalIds) return targets;

  for (const vId of vassalIds) {
    const vassal = ctx.characters.get(vId);
    if (!vassal || !vassal.alive) continue;

    // 跳过正在交战的臣属
    const atWar = ctx.activeWars.some(w =>
      (w.attackerId === actorId && w.defenderId === vassal.id) ||
      (w.attackerId === vassal.id && w.defenderId === actorId),
    );
    if (atWar) continue;

    const opinion = ctx.getOpinion(actorId, vassal.id);
    const vassalStr = ctx.getMilitaryStrength(vassal.id);

    // 好感基底：好感 -40 → urgency +20；好感 +40 → urgency -20
    let urgency = -opinion * 0.5;

    // 兵力威胁
    const ratio = actorStr > 0 ? vassalStr / actorStr : (vassalStr > 0 ? 2 : 0);
    if (ratio > 1.0) urgency += 30;
    else if (ratio > 0.5) urgency += 15;

    // 性格调整
    urgency += personality.boldness * -3;       // 大胆者不惧
    urgency += personality.rationality * 3;     // 理性者谨慎
    urgency += personality.honor * 2;           // 荣誉者偏向维持秩序

    targets.push({ vassalId: vassal.id, urgency });
  }

  return targets;
}

// ── 岗位信息查询 ────────────────────────────────────────────────────────────

export interface PolicyPost {
  postId: string;
  territoryId: string;
  tier: TerritoryTier;
  capitalZhouId?: string;
  territoryType: TerritoryType;
  successionLaw: 'clan' | 'bureaucratic';
  hasAppointRight: boolean;
}

/**
 * 判定一个 territory 是否是某个父道的治所州。
 * 治所州主岗在政策层不是独立目标——所有 post 政策（successionLaw / hasAppointRight /
 * territoryType / designatedHeirId）都必须从道主岗发起、由 executeToggleX 内部联动写入治所州。
 * 详见 CLAUDE.md `### 治所州联动` 章节。
 */
export function isCapitalZhouOfDao(
  territoryId: string,
  territories: Map<string, Territory>,
): boolean {
  const t = territories.get(territoryId);
  if (!t || t.tier !== 'zhou' || !t.parentId) return false;
  const parent = territories.get(t.parentId);
  return parent?.tier === 'dao' && parent.capitalZhouId === territoryId;
}

/** 获取臣属持有的 grantsControl 岗位 + 所属领地信息（已过滤治所州主岗） */
export function getVassalPolicyPosts(vassalId: string, ctx: NpcContext): PolicyPost[] {
  const postIds = ctx.holderIndex.get(vassalId);
  if (!postIds) return [];

  const result: PolicyPost[] = [];
  for (const pid of postIds) {
    const post = ctx.postIndex.get(pid);
    if (!post?.territoryId) continue;
    const tpl = positionMap.get(post.templateId);
    if (!tpl?.grantsControl) continue;
    const terr = ctx.territories.get(post.territoryId);
    if (!terr) continue;
    // 过滤治所州主岗：它不是独立政策目标，由父道主岗的 executeToggleX 联动
    if (isCapitalZhouOfDao(terr.id, ctx.territories)) continue;

    result.push({
      postId: post.id,
      territoryId: terr.id,
      tier: terr.tier,
      capitalZhouId: terr.capitalZhouId,
      territoryType: terr.territoryType,
      successionLaw: post.successionLaw,
      hasAppointRight: post.hasAppointRight,
    });
  }
  return result;
}

/** 获取角色自身持有的 grantsControl 岗位（用于自调政策） */
export function getOwnPolicyPosts(actorId: string, ctx: NpcContext): PolicyPost[] {
  return getVassalPolicyPosts(actorId, ctx);
}

// ── 辟署权权限校验 ──────────────────────────────────────────────────────────

/**
 * 检查 operatorId 是否有权设置目标领地岗位的辟署权/继承法/职类。
 * 条件：operatorId 在目标领地的上级领地链上持有带辟署权的岗位。
 * 纯函数版本，NPC 行为和 UI 共用。
 */
export function hasAuthorityOverPost(
  operatorId: string,
  territoryId: string,
  territories: Map<string, Territory>,
): boolean {
  const terr = territories.get(territoryId);
  let parentId = terr?.parentId;
  while (parentId) {
    const parent = territories.get(parentId);
    if (!parent) return false;
    const authorityPost = parent.posts.find(
      p => p.hasAppointRight && p.holderId === operatorId,
    );
    if (authorityPost) return true;
    parentId = parent.parentId;
  }
  return false;
}

// ── 军/民切换可行性（从 centralizationAction 映射推导） ──────────────────

/** 检查岗位是否支持军/民职类切换 */
export function canSwitchType(post: Post): boolean {
  return post.templateId in MILITARY_TO_CIVIL || post.templateId in CIVIL_TO_MILITARY;
}

// ── 阈值常量 ────────────────────────────────────────────────────────────────

/** 放权阈值：最高 urgency 超过此值才考虑放权 */
export const APPEASE_THRESHOLD = 15;
/** 集权阈值：最低 urgency 低于此值才考虑集权（负值） */
export const CENTRALIZE_THRESHOLD = -15;
