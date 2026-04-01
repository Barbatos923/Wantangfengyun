// ===== 战争计算（纯函数） =====

import type { CasusBelli, WarContext, CasusBelliEval, PeaceProposalContext, PeaceAcceptanceContext, PeaceResult } from './types';
import { CASUS_BELLI_NAMES } from './types';
import type { Territory } from '@engine/territory/types';
import { Era } from '@engine/types';
import { positionMap } from '@data/positions';
import { isVassalOf } from '@engine/character/successionUtils';
import { ALL_EDGES } from '@data/mapTopology';

/** 检查角色是否持有任何拥有辟署权的岗位 */
function hasAppointRightPost(charId: string, territories: Map<string, Territory>): boolean {
  for (const t of territories.values()) {
    for (const p of t.posts) {
      if (p.holderId === charId && p.hasAppointRight) return true;
    }
  }
  return false;
}

// ── 核心 API ──────────────────────────────────────────────────────────────────

/**
 * 评估 attacker 对 defender 的所有宣战理由。
 * 返回所有可见理由及其判定结果（可用 / 灰显+原因）。
 */
export function evaluateAllCasusBelli(ctx: WarContext): CasusBelliEval[] {
  const results: CasusBelliEval[] = [];
  for (const def of CASUS_BELLI_DEFS) {
    if (!def.canShow(ctx)) continue;
    results.push({
      id: def.id,
      name: CASUS_BELLI_NAMES[def.id],
      failureReason: def.getFailureReason(ctx),
      cost: getWarCost(def.id, ctx.era),
    });
  }
  return results;
}

// ── 各理由定义 ────────────────────────────────────────────────────────────────

interface CasusBelliDef {
  id: CasusBelli;
  canShow: (ctx: WarContext) => boolean;
  getFailureReason: (ctx: WarContext) => string | null;
}

const CASUS_BELLI_DEFS: CasusBelliDef[] = [
  // 武力兼并
  {
    id: 'annexation',
    canShow: (ctx) => ctx.era !== Era.ZhiShi,
    getFailureReason: (ctx) => {
      if (isVassalOf(ctx.defenderId, ctx.attackerId, ctx.characters)) {
        return '该角色是你的附庸';
      }
      if (ctx.era === Era.WeiShi && !hasAppointRightPost(ctx.attackerId, ctx.territories)) {
        return '危世下仅辟署权持有者可武力兼并';
      }
      if (getAnnexTargets(ctx.attackerId, ctx.defenderId, ctx.territories).length === 0) {
        return '你与该角色没有相邻领地';
      }
      return null;
    },
  },
  // 法理宣称
  {
    id: 'deJureClaim',
    canShow: () => true,
    getFailureReason: (ctx) => {
      if (isVassalOf(ctx.defenderId, ctx.attackerId, ctx.characters)) {
        return '该角色是你的附庸';
      }
      if (getDeJureTargets(ctx.attackerId, ctx.defenderId, ctx.territories).length === 0) {
        return '你对该角色没有法理宣称';
      }
      return null;
    },
  },
  // 独立
  {
    id: 'independence',
    canShow: (ctx) => isVassalOf(ctx.attackerId, ctx.defenderId, ctx.characters),
    getFailureReason: () => null,
  },
  // 以下理由暂未实现
  // { id: 'personalClaim', canShow: () => false, getFailureReason: () => null },
  // { id: 'pushingClaim', canShow: () => false, getFailureReason: () => null },
  // { id: 'imperialOrder', canShow: () => false, getFailureReason: () => null },
  // { id: 'forgedMandate', canShow: () => false, getFailureReason: () => null },
  // { id: 'expansion', canShow: () => false, getFailureReason: () => null },
];

// ── 辅助纯函数 ───────────────────────────────────────────────────────────────

/**
 * 获取武力兼并可选的目标州列表。
 * 即 defender 控制的州中与 attacker 控制的州相邻的。
 */
export function getAnnexTargets(
  attackerId: string,
  defenderId: string,
  territories: Map<string, Territory>,
): string[] {
  const attackerZhouIds = new Set<string>();
  const defenderZhouIds: string[] = [];

  for (const t of territories.values()) {
    if (t.tier !== 'zhou') continue;
    const mainPost = t.posts.find((p) => positionMap.get(p.templateId)?.grantsControl === true);
    if (!mainPost?.holderId) continue;
    if (mainPost.holderId === attackerId) attackerZhouIds.add(t.id);
    if (mainPost.holderId === defenderId) defenderZhouIds.push(t.id);
  }

  return defenderZhouIds.filter((defId) =>
    ALL_EDGES.some(
      (e) =>
        (e.from === defId && attackerZhouIds.has(e.to)) ||
        (e.to === defId && attackerZhouIds.has(e.from)),
    ),
  );
}

/**
 * 获取某种战争理由在当前时代下的代价。
 */
export function getWarCost(
  casusBelli: CasusBelli,
  era: Era,
): { prestige: number; legitimacy: number } {
  switch (casusBelli) {
    case 'annexation':
      switch (era) {
        case Era.ZhiShi: return { prestige: -40, legitimacy: -20 };
        case Era.WeiShi: return { prestige: -20, legitimacy: -10 };
        case Era.LuanShi: return { prestige: -5, legitimacy: 0 };
      }
      break;
    case 'deJureClaim':
      return { prestige: -5, legitimacy: 0 };
    case 'independence':
      switch (era) {
        case Era.ZhiShi: return { prestige: -30, legitimacy: -15 };
        case Era.WeiShi: return { prestige: -15, legitimacy: -5 };
        case Era.LuanShi: return { prestige: -5, legitimacy: 0 };
      }
      break;
    default:
      return { prestige: -10, legitimacy: -5 };
  }
  return { prestige: -10, legitimacy: -5 };
}

/**
 * 获取法理宣称可以争夺的目标领地列表。
 */
export function getDeJureTargets(
  attackerId: string,
  defenderId: string,
  territories: Map<string, Territory>,
): string[] {
  const targets: string[] = [];

  for (const terr of territories.values()) {
    if (terr.tier !== 'dao') continue;
    const mainPost = terr.posts.find(p => positionMap.get(p.templateId)?.grantsControl === true);
    if (!mainPost || mainPost.holderId !== attackerId) continue;

    for (const childId of terr.childIds) {
      const child = territories.get(childId);
      if (!child || child.tier !== 'zhou') continue;
      const childMainPost = child.posts.find(p => positionMap.get(p.templateId)?.grantsControl === true);
      if (childMainPost?.holderId === defenderId) {
        targets.push(childId);
      }
    }
  }

  return targets;
}

// ── 和谈判定 ─────────────────────────────────────────────────────────────────

/**
 * 计算提议方的和谈意愿权重（NPC behavior 用于掷骰）。
 * 返回值作为 NpcBehavior weight，越高越想和谈。
 */
export function calcPeaceProposalWeight(ctx: PeaceProposalContext): number {
  let score = 0;

  // 基础：默认不太想和谈
  score += -10;

  // 性格驱动
  score += ctx.personality.compassion * 10;  // 仁慈者倾向和平
  score += ctx.personality.boldness * -8;    // 好战者不愿和
  score += ctx.personality.rationality * 8;  // 理性者愿止损

  // 战争局势：输得越多越想和
  if (ctx.myScore < 0) {
    score += Math.abs(ctx.myScore) * 0.3;
  }

  // 战争持续时间
  score += ctx.warDurationMonths * 0.5;

  // 经济压力
  if (ctx.money < 0) score += 15;          // 负债
  if (ctx.monthlyIncome < 0) score += 10;  // 赤字

  return Math.max(0, score);
}

const PEACE_ACCEPTANCE_THRESHOLD = 30;

/**
 * 计算被提议方是否接受和谈（白和）。
 * proposerScore > 0 表示提议方占优 → 被提议方处于劣势 → 更愿接受。
 * proposerScore < 0 表示提议方处于劣势 → 被提议方占优 → 不愿接受。
 */
export function calcPeaceAcceptance(ctx: PeaceAcceptanceContext): PeaceResult {
  const breakdown: Record<string, number> = {};

  // 战争形势：提议方分数越高 → 被提议方越劣势 → 越愿接受
  const warFactor = Math.round(ctx.proposerScore * 0.5);
  breakdown['战争形势'] = warFactor;

  // 持续时间：越久越愿和谈（max +30）
  const durationBonus = Math.min(30, Math.round(ctx.warDurationMonths * 0.8));
  breakdown['战争持久'] = durationBonus;

  // 被提议方性格
  const compassionFactor = Math.round(ctx.targetPersonality.compassion * 8);
  breakdown['仁慈'] = compassionFactor;

  const boldnessFactor = -Math.round(ctx.targetPersonality.boldness * 10);
  breakdown['胆识'] = boldnessFactor;

  const honorFactor = Math.round(ctx.targetPersonality.honor * 5);
  breakdown['荣誉'] = honorFactor;

  const greedFactor = -Math.round(ctx.targetPersonality.greed * 5);
  breakdown['贪婪'] = greedFactor;

  const score = warFactor + durationBonus + compassionFactor + boldnessFactor + honorFactor + greedFactor;

  return {
    accept: score >= PEACE_ACCEPTANCE_THRESHOLD,
    score,
    threshold: PEACE_ACCEPTANCE_THRESHOLD,
    breakdown,
  };
}
