// ===== 战争计算（纯函数） =====

import type { CasusBelli, WarContext, CasusBelliEval, PeaceContext, PeaceResult } from './types';
import { CASUS_BELLI_NAMES } from './types';
import type { Territory } from '@engine/territory/types';
import { Era } from '@engine/types';
import { positionMap } from '@data/positions';
import { isVassalOf } from '@engine/character/successionUtils';
import { ALL_EDGES } from '@data/mapTopology';

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
    canShow: () => true,
    getFailureReason: (ctx) => {
      if (isVassalOf(ctx.defenderId, ctx.attackerId, ctx.characters)) {
        return '该角色是你的附庸';
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

const PEACE_THRESHOLD = 50;

/**
 * 计算和谈是否会被对方接受。
 * 返回评分 breakdown 和最终结果。
 */
export function calcPeaceAcceptance(ctx: PeaceContext): PeaceResult {
  const breakdown: Record<string, number> = {};

  // 基础分 = 战争分数对被提议方的有利程度
  // 提议方希望对方接受 → 分数越有利于提议方，对方越不愿接受
  const base = ctx.proposerIsAttacker ? ctx.warScore : -ctx.warScore;
  breakdown['战争形势'] = base;

  // 战争持续时间（越久越愿和谈，max +30）
  const durationBonus = Math.min(30, Math.round(ctx.warDurationMonths * 0.5));
  breakdown['战争持久'] = durationBonus;

  // 兵力对比
  const militaryFactor = ctx.targetMilitary < ctx.proposerMilitary ? 10 : -5;
  breakdown['兵力对比'] = militaryFactor;

  // 提议方外交能力（越高越能说服对方）
  const diplomacyFactor = Math.min(10, Math.round(ctx.proposerDiplomacy * 0.5));
  breakdown['外交能力'] = diplomacyFactor;

  // 对方性格
  const boldnessFactor = -Math.round(ctx.targetPersonality.boldness * 15);
  breakdown['胆识'] = boldnessFactor;

  const honorFactor = Math.round(ctx.targetPersonality.honor * 10);
  breakdown['荣誉'] = honorFactor;

  const greedFactor = -Math.round(ctx.targetPersonality.greed * 8);
  breakdown['贪婪'] = greedFactor;

  const score = base + durationBonus + militaryFactor + diplomacyFactor + boldnessFactor + honorFactor + greedFactor;

  return {
    accept: score >= PEACE_THRESHOLD,
    score,
    threshold: PEACE_THRESHOLD,
    breakdown,
  };
}
