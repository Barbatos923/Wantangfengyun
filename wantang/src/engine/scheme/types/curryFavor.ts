// ===== 拉拢（curryFavor）— basic scheme =====
//
// 单阶段倒计时型 scheme：花 200 私产 + 90 天 → 掷骰 → 成功增进双向好感
// 主属性：diplomacy（外交，与"结交"语义一致）

import type { Character } from '@engine/character/types';
import type {
  SchemeTypeDef,
  SchemeContext,
  CurryFavorParams,
  CurryFavorData,
  SchemeTypeData,
  SchemeSnapshot,
  SchemeEffectOutcome,
} from '../types';
import { registerSchemeType } from '../registry';
import { clamp } from '../schemeCalc';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { EventPriority } from '@engine/types';

// ── 数值常量 ────────────────────────────────────────

export const CURRY_FAVOR_DURATION_DAYS = 90;
export const CURRY_FAVOR_COST = 200;
export const CURRY_FAVOR_BASE_RATE = 50;

const SUCCESS_OPINION_TARGET_TO_INITIATOR = 25;
const SUCCESS_OPINION_INITIATOR_TO_TARGET = 15;
const FAILURE_OPINION_PENALTY = -5;

// ── 成功率公式（纯函数） ─────────────────────────────

/**
 * 拉拢初始成功率：base 50 + diplomacy 差 × 4 + 现有好感 × 0.2
 * - dipDiff = initiator.diplomacy - 10（10 为基线）
 * - 系数 4 让外交能力拉开显著差距：dip 18 ~ 82%, dip 14 ~ 66%, dip 6 ~ 34%, dip 4 ~ 26%
 *   （实际 dip 范围 4-20，mean ≈ 12.8，p99 = 18），顶级外交能带来近 ±30 百分点的实感差异
 * - opinion 加成 = target → initiator 现有好感 × 0.2（次要修正）
 */
export function calcCurryFavorRate(
  initiator: Character,
  target: Character,
  ctx: SchemeContext,
): number {
  const dipDiff = initiator.abilities.diplomacy - 10;
  const opinionBonus = ctx.getOpinion(target.id, initiator.id) * 0.2;
  return clamp(CURRY_FAVOR_BASE_RATE + dipDiff * 4 + opinionBonus, 5, 95);
}

// ── SchemeTypeDef 实现 ───────────────────────────────

const curryFavorDef: SchemeTypeDef<CurryFavorParams> = {
  id: 'curryFavor',
  name: '拉拢',
  icon: '🤝',
  category: 'personal',
  isBasic: true,
  baseDurationDays: CURRY_FAVOR_DURATION_DAYS,
  phaseCount: 1,
  costMoney: CURRY_FAVOR_COST,
  description: '通过宴饮、馈赠和私下结交，增进对方对自己的好感。',
  chronicleTypes: { initiate: '发起拉拢', success: '拉拢成功', failure: '拉拢失败' },

  parseParams(raw): CurryFavorParams | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.primaryTargetId !== 'string') return null;
    return { primaryTargetId: r.primaryTargetId };
  },

  getValidPrimaryTargets(initiator, ctx) {
    const result: Character[] = [];
    for (const c of ctx.characters.values()) {
      if (c.alive && c.id !== initiator.id) result.push(c);
    }
    return result;
  },

  canShow(initiator, target) {
    return target.alive && initiator.id !== target.id;
  },

  canInitiate(initiator, params, ctx) {
    const target = ctx.characters.get(params.primaryTargetId);
    if (!target?.alive) return '目标不存在';
    if (target.id === initiator.id) return '不能对自己使用';
    if (initiator.resources.money < CURRY_FAVOR_COST) {
      return `金钱不足（需 ${CURRY_FAVOR_COST}）`;
    }
    return null;
  },

  initInstance(initiator, params, ctx, _precomputedBonus) {
    const target = ctx.characters.get(params.primaryTargetId)!;
    const rate = calcCurryFavorRate(initiator, target, ctx);
    // [TEMP] 调试拉拢频率/成功率，看完删
    // eslint-disable-next-line no-console
    console.log(`[拉拢发起] ${initiator.name} → ${target.name} | 初始成功率 ${Math.round(rate)}%`);
    const data: CurryFavorData = { kind: 'curryFavor' };
    const snapshot: SchemeSnapshot = {
      spymasterId: initiator.id,
      spymasterStrategy: initiator.abilities.diplomacy,  // basic 用 diplomacy
      targetSpymasterId: target.id,
      targetSpymasterStrategy: target.abilities.diplomacy,
      initialSuccessRate: rate,
    };
    return {
      data: data as SchemeTypeData,
      initialSuccessRate: rate,
      snapshot,
    };
  },

  // basic scheme 无 onPhaseComplete

  resolve(scheme, rng, _ctx): SchemeEffectOutcome {
    const cs = useCharacterStore.getState();
    const initiator = cs.characters.get(scheme.initiatorId);
    const target = cs.characters.get(scheme.primaryTargetId);
    const initiatorName = initiator?.name ?? '?';
    const targetName = target?.name ?? '?';

    const success = rng() * 100 < scheme.currentSuccessRate;
    return {
      kind: success ? 'success' : 'failure',
      description: success
        ? `${initiatorName}的拉拢深得${targetName}之心，二人关系大为亲近。`
        : `${initiatorName}的拉拢之意，${targetName}并未领情。`,
    };
  },

  applyEffects(scheme, outcome, _ctx) {
    const cs = useCharacterStore.getState();
    // [TEMP] 调试拉拢频率/成功率，看完删
    {
      const initiator = cs.characters.get(scheme.initiatorId);
      const target = cs.characters.get(scheme.primaryTargetId);
      const mark = outcome.kind === 'success' ? '✓ 成功' : '✗ 失败';
      // eslint-disable-next-line no-console
      console.log(`[拉拢结算] ${initiator?.name ?? '?'} → ${target?.name ?? '?'} | 成功率 ${Math.round(scheme.currentSuccessRate)}% → ${mark}`);
    }
    if (outcome.kind === 'success') {
      // 双向加好感（拉拢是建立关系，是双向的）
      cs.addOpinion(scheme.primaryTargetId, scheme.initiatorId, {
        reason: '受其拉拢',
        value: SUCCESS_OPINION_TARGET_TO_INITIATOR,
        decayable: true,
      });
      cs.addOpinion(scheme.initiatorId, scheme.primaryTargetId, {
        reason: '与其结交',
        value: SUCCESS_OPINION_INITIATOR_TO_TARGET,
        decayable: true,
      });
      emitChronicleEvent({
        type: '拉拢成功',
        actors: [scheme.initiatorId, scheme.primaryTargetId],
        territories: [],
        description: outcome.description,
        priority: EventPriority.Normal,
      });
    } else {
      // 失败：仅 -5 好感（拉拢失败不结仇）
      cs.addOpinion(scheme.primaryTargetId, scheme.initiatorId, {
        reason: '拒其示好',
        value: FAILURE_OPINION_PENALTY,
        decayable: true,
      });
      emitChronicleEvent({
        type: '拉拢失败',
        actors: [scheme.initiatorId, scheme.primaryTargetId],
        territories: [],
        description: outcome.description,
        priority: EventPriority.Normal,
      });
    }
  },
};

registerSchemeType(curryFavorDef);

export { curryFavorDef };
