// ===== 正统性计算纯函数 =====

import { Era } from '@engine/types';
import { positionMap } from '@data/positions';
import type { Post } from '@engine/territory/types';

// ── 岗位基础正统性 ──────────────────────────────────────────────────────────────

/** 岗位模板 → 基础正统性（任命时刷新用） */
export function getBaseLegitimacy(templateId: string): number {
  if (templateId === 'pos-emperor') return 95;
  const tpl = positionMap.get(templateId);
  if (!tpl) return 60;
  return getRankLegitimacyCap(tpl.minRank);
}

/** 角色持有岗位中最高的 baseLegitimacy，无岗位返回 null */
export function getHighestBaseLegitimacy(heldPosts: Post[]): number | null {
  if (heldPosts.length === 0) return null;
  let max = -1;
  for (const p of heldPosts) {
    const base = getBaseLegitimacy(p.templateId);
    if (base > max) max = base;
  }
  return max === -1 ? null : max;
}

// ── 品位上限 ────────────────────────────────────────────────────────────────────

/** 品位 → 正统性上限（Cap） */
export function getRankLegitimacyCap(rankLevel: number): number {
  if (rankLevel >= 29) return 100;
  if (rankLevel >= 27) return 95;
  if (rankLevel >= 25) return 90;
  if (rankLevel >= 21) return 85;
  if (rankLevel >= 17) return 80;
  if (rankLevel >= 13) return 70;
  if (rankLevel >= 9) return 60;
  if (rankLevel >= 5) return 50;
  return 40; // rank 1~4
}

// ── 好感传导 ────────────────────────────────────────────────────────────────────

export interface LegitimacyOpinionResult {
  /** 预期差值带来的好感修正 */
  gapValue: number;
  /** 绝对值带来的好感修正（天命所归/名器尽失） */
  absoluteValue: number;
}

/**
 * 计算正统性对好感的影响。
 * @param legitimacy 角色当前正统性 L
 * @param expectedLegitimacy 预期正统性 E（最高岗位 baseLegitimacy），null 表示无岗位
 * @returns null 表示无岗位、不产生好感修正
 */
export function calcLegitimacyOpinion(
  legitimacy: number,
  expectedLegitimacy: number | null,
): LegitimacyOpinionResult | null {
  if (expectedLegitimacy === null) return null;

  const d = legitimacy - expectedLegitimacy;
  let gapValue: number;
  if (d >= 10) gapValue = 10;
  else if (d >= 0) gapValue = 0;
  else if (d >= -10) gapValue = -5;
  else if (d >= -20) gapValue = -15;
  else if (d >= -30) gapValue = -30;
  else gapValue = -50;

  let absoluteValue = 0;
  if (legitimacy >= 90) absoluteValue = 10;
  else if (legitimacy <= 30) absoluteValue = -20;

  return { gapValue, absoluteValue };
}

// ── 时代衰减 ────────────────────────────────────────────────────────────────────

/** 皇帝正统性月度衰减量（负数或零） */
export function calcEraDecay(era: Era): number {
  switch (era) {
    case Era.ZhiShi: return 0;
    case Era.WeiShi: return -0.25;
    case Era.LuanShi: return -1;
  }
}

// ── 铨选品位惩罚 ─────────────────────────────────────────────────────────────────

/** 品位不足时的铨选评分惩罚（charRank < postMinRank 时返回负数） */
export function calcRankMismatchPenalty(charRank: number, postMinRank: number): number {
  if (charRank >= postMinRank) return 0;
  return -50 * (postMinRank - charRank);
}

// ── 宣战资源校验 ─────────────────────────────────────────────────────────────────

/** 校验角色是否有足够的威望和正统性支付宣战花费 */
export function canAffordWarCost(
  resources: { prestige: number; legitimacy: number },
  cost: { prestige: number; legitimacy: number },
): boolean {
  return (
    resources.prestige + cost.prestige >= 0 &&
    resources.legitimacy + cost.legitimacy >= 0
  );
}
