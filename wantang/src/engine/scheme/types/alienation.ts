// ===== 离间（alienation）— complex scheme =====
//
// 多阶段计谋：3 阶段 × 30 天 = 90 天总时长。每阶段完成后 currentSuccessRate += 8。
// 主属性：strategy（谋略）。
//
// 三种方法（差异化全部在 calcBonus 条件加成上，启动期参数和副作用强度统一）：
//   - 散布谣言: 对多疑/胆小/偏听偏信者有效
//   - 伪造书信: 对双方有嫌隙、忌惮上级者有效
//   - 美人计:   对好色/贪婪者有效（贞守者免疫）

import type { Character } from '@engine/character/types';
import type {
  SchemeTypeDef,
  SchemeContext,
  AlienationParams,
  AlienationData,
  SchemeTypeData,
  SchemeSnapshot,
  SchemeEffectOutcome,
} from '../types';
import { registerSchemeType } from '../registry';
import { clamp, hasRelationship } from '../schemeCalc';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { calcPersonality } from '@engine/character/personalityUtils';
import { getSovereigntyTier } from '@engine/official/postQueries';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { EventPriority } from '@engine/types';

// ── 数值常量（统一参数：方法不影响） ─────────────────

export const ALIENATION_BASE_RATE = 35;
export const ALIENATION_PHASE_DAYS = 30;
export const ALIENATION_PHASES = 3;
export const ALIENATION_COST = 500;
export const ALIENATION_GROWTH_PER_PHASE = 8;
export const ALIENATION_INITIAL_CAP = 80;
export const ALIENATION_FINAL_CAP = 90;

// 失败副作用（统一，方法不影响）
const ALIENATION_FAIL_OPINION = -40;     // 双方对发起人
const ALIENATION_FAIL_PRESTIGE = -20;    // 发起人威望损失
const ALIENATION_SUCCESS_OPINION = -30;  // 双方互相好感

// ── 方法定义 ─────────────────────────────────────────

export interface AlienationMethodDef {
  id: string;
  name: string;
  description: string;
  /** UI 提示文案：「适合对付：xxx」 */
  hint: string;
  /**
   * 方法专属条件加成。纯加分（>= 0），不允许负值（避免比 base 还低的反直觉数值）。
   * AI 方法 (isAI=true) 永远返回 0，由 LLM 路径填入 methodBonus。
   */
  calcBonus: (
    primary: Character,
    secondary: Character,
    initiator: Character,
    ctx: SchemeContext,
  ) => number;
  /** v2 标记：AI 方法走独立 UI 流程，不显示在常规方法卡片列表中 */
  isAI?: boolean;
}

// ── 散布谣言：对多疑、胆小、偏听偏信者有效 ──
function rumorBonus(primary: Character): number {
  const p = calcPersonality(primary);
  let bonus = 0;
  // 多疑：vengefulness 高 → 容易猜忌身边人
  if (p.vengefulness > 0.5) bonus += (p.vengefulness - 0.5) * 40;
  // 胆小：boldness 低 → 风吹草动疑神疑鬼
  if (p.boldness < 0.4) bonus += (0.4 - p.boldness) * 30;
  // 偏听偏信：rationality 低 → 听到啥信啥
  if (p.rationality < 0.4) bonus += (0.4 - p.rationality) * 50;
  // 标志特质额外加成
  if (primary.traitIds.includes('trait-suspicious')) bonus += 8;
  if (primary.traitIds.includes('trait-coward')) bonus += 8;
  return clamp(bonus, 0, 50);
}

// ── 伪造书信：对双方有嫌隙、有所忌惮者有效 ──
function forgedLetterBonus(
  primary: Character,
  secondary: Character,
  _initiator: Character,
  ctx: SchemeContext,
): number {
  let bonus = 0;
  // 已有嫌隙：primary 对 secondary 的好感越负越好
  const op = ctx.getOpinion(primary.id, secondary.id);
  if (op < 0) bonus += Math.min(40, -op * 0.4);
  // 忌惮上级：primary 是 secondary 的直属臣属
  if (primary.overlordId === secondary.id) bonus += 15;
  // 实力差：secondary 法理层级显著高于 primary
  const ts = useTerritoryStore.getState();
  const stratGap = getSovereigntyTier(secondary.id, ts.territories, ts.centralPosts)
                 - getSovereigntyTier(primary.id, ts.territories, ts.centralPosts);
  if (stratGap >= 1) bonus += 5 * stratGap;
  return clamp(bonus, 0, 50);
}

// ── 美人计：对好色、贪婪者有效（贞守者免疫） ──
function honeyTrapBonus(primary: Character): number {
  // 贞守特质：直接 0，整个方法对其无效
  if (primary.traitIds.includes('trait-chaste')) return 0;
  const p = calcPersonality(primary);
  let bonus = 0;
  if (primary.traitIds.includes('trait-lustful')) bonus += 25;
  if (primary.traitIds.includes('trait-gluttonous')) bonus += 15;
  if (p.greed > 0.5) bonus += (p.greed - 0.5) * 40;
  if (primary.traitIds.includes('trait-greedy')) bonus += 10;
  return clamp(bonus, 0, 50);
}

const ALIENATION_METHODS: AlienationMethodDef[] = [
  {
    id: 'rumor',
    name: '散布谣言',
    description: '在市井与官场散播流言，使二人嫌隙渐生。',
    hint: '适合对付：多疑 / 胆小 / 偏听偏信者',
    calcBonus: (p, _s, _i, _c) => rumorBonus(p),
  },
  {
    id: 'forgedLetter',
    name: '伪造书信',
    description: '伪造一方致敌的密信，使之落入另一方手中。',
    hint: '适合对付：与目标已有嫌隙 / 忌惮上级者',
    calcBonus: forgedLetterBonus,
  },
  {
    id: 'honeyTrap',
    name: '美人计',
    description: '以声色之诱，使其沉溺自毁。',
    hint: '适合对付：好色 / 贪婪者（贞守者免疫）',
    calcBonus: (p, _s, _i, _c) => honeyTrapBonus(p),
  },
  // ── v2 预留：AI 方法 ──
  // {
  //   id: 'custom',
  //   name: '自拟妙计',
  //   description: '由你亲自构思一条策略，交由谋士评议',
  //   hint: '由 LLM 评估其合理性与威力',
  //   calcBonus: () => 0,
  //   isAI: true,
  // },
];

export function getAlienationMethod(id: string): AlienationMethodDef | undefined {
  return ALIENATION_METHODS.find(m => m.id === id);
}

/** UI 候选集：v1 过滤掉 isAI 方法 */
export function getAvailableAlienationMethods(): AlienationMethodDef[] {
  return ALIENATION_METHODS.filter(m => !m.isAI);
}

/** 列出所有 primary 候选的 secondary（关系约束：必须有可离间关系） */
export function getValidSecondaryAlienationTargets(
  primary: Character,
  initiator: Character,
  ctx: SchemeContext,
): Character[] {
  const result: Character[] = [];
  for (const c of ctx.characters.values()) {
    if (!c.alive) continue;
    if (c.id === primary.id) continue;
    if (c.id === initiator.id) continue;
    if (!hasRelationship(primary, c, ctx)) continue;
    result.push(c);
  }
  return result;
}

// ── 初始成功率公式（纯函数，UI 预览/NPC 共用） ────────

export function calcAlienationInitialRate(
  initiator: Character,
  primary: Character,
  methodBonus: number,
): number {
  const stratDiff = initiator.abilities.strategy - primary.abilities.strategy;
  const baseRate = ALIENATION_BASE_RATE + stratDiff * 1.5;
  return clamp(baseRate + methodBonus, 5, ALIENATION_INITIAL_CAP);
}

// ── SchemeTypeDef 实现 ───────────────────────────────

const alienationDef: SchemeTypeDef<AlienationParams> = {
  id: 'alienation',
  name: '离间',
  icon: '🗡',
  category: 'hostile',
  isBasic: false,
  baseDurationDays: ALIENATION_PHASE_DAYS,
  phaseCount: ALIENATION_PHASES,
  costMoney: ALIENATION_COST,
  description: '挑拨两位有关系的人物，使其关系破裂，互相敌视。',
  chronicleTypes: { initiate: '发起离间', success: '离间成功', failure: '离间失败' },

  parseParams(raw): AlienationParams | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.primaryTargetId !== 'string') return null;
    if (typeof r.secondaryTargetId !== 'string') return null;
    if (typeof r.methodId !== 'string') return null;
    return {
      primaryTargetId: r.primaryTargetId,
      secondaryTargetId: r.secondaryTargetId,
      methodId: r.methodId,
      customDescription: typeof r.customDescription === 'string' ? r.customDescription : undefined,
      aiReasoning: typeof r.aiReasoning === 'string' ? r.aiReasoning : undefined,
    };
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
    const secondary = ctx.characters.get(params.secondaryTargetId);
    if (!secondary?.alive) return '次要目标不存在';
    if (secondary.id === initiator.id || secondary.id === target.id) return '次要目标不可重复';
    if (!hasRelationship(target, secondary, ctx)) return '两者之间无可离间的关系';
    const method = getAlienationMethod(params.methodId);
    if (!method) return '手段不存在';
    if (method.isAI) return 'v1 暂不支持自拟妙计';
    if (initiator.resources.money < ALIENATION_COST) {
      return `金钱不足（需 ${ALIENATION_COST}）`;
    }
    return null;
  },

  initInstance(initiator, params, ctx, precomputedBonus) {
    const target = ctx.characters.get(params.primaryTargetId)!;
    const secondary = ctx.characters.get(params.secondaryTargetId)!;
    const method = getAlienationMethod(params.methodId)!;

    // 方法加分：优先用调用方提供的（v2 AI 路径），否则同步计算
    const methodBonus = precomputedBonus !== undefined
      ? precomputedBonus
      : method.calcBonus(target, secondary, initiator, ctx);

    const finalRate = calcAlienationInitialRate(initiator, target, methodBonus);

    const data: AlienationData = {
      kind: 'alienation',
      secondaryTargetId: secondary.id,
      methodId: params.methodId,
      methodBonus,
      // v1 由 UI 永远不传，v2 AI 流程透传
      customDescription: params.customDescription,
      aiReasoning: params.aiReasoning,
    };
    const snapshot: SchemeSnapshot = {
      spymasterId: initiator.id,
      spymasterStrategy: initiator.abilities.strategy,
      targetSpymasterId: target.id,
      targetSpymasterStrategy: target.abilities.strategy,
      initialSuccessRate: finalRate,
    };
    return {
      data: data as SchemeTypeData,
      initialSuccessRate: finalRate,
      snapshot,
    };
  },

  onPhaseComplete(scheme, _ctx) {
    return Math.min(ALIENATION_FINAL_CAP, scheme.currentSuccessRate + ALIENATION_GROWTH_PER_PHASE);
  },

  resolve(scheme, rng, _ctx): SchemeEffectOutcome {
    const cs = useCharacterStore.getState();
    const data = scheme.data as AlienationData;
    const initiator = cs.characters.get(scheme.initiatorId);
    const primary = cs.characters.get(scheme.primaryTargetId);
    const secondary = cs.characters.get(data.secondaryTargetId);
    const method = getAlienationMethod(data.methodId);
    const methodName = method?.name ?? '计谋';
    const initiatorName = initiator?.name ?? '?';
    const primaryName = primary?.name ?? '?';
    const secondaryName = secondary?.name ?? '?';

    const success = rng() * 100 < scheme.currentSuccessRate;
    return {
      kind: success ? 'success' : 'failure',
      description: success
        ? `${initiatorName}的${methodName}计成，${primaryName}与${secondaryName}终于反目。`
        : `${initiatorName}的${methodName}败露，${primaryName}得知此事，怒不可遏。`,
    };
  },

  applyEffects(scheme, outcome, _ctx) {
    const cs = useCharacterStore.getState();
    const data = scheme.data as AlienationData;

    // v2 AI 方法：reasoning 存在时附加到史书 description（v1 永远 undefined）
    let description = outcome.description;
    if (data.aiReasoning) description += `（谋士评议：${data.aiReasoning}）`;

    if (outcome.kind === 'success') {
      // 双向 -30 好感（A↔B）
      cs.addOpinion(scheme.primaryTargetId, data.secondaryTargetId, {
        reason: '受其离间',
        value: ALIENATION_SUCCESS_OPINION,
        decayable: true,
      });
      cs.addOpinion(data.secondaryTargetId, scheme.primaryTargetId, {
        reason: '受其离间',
        value: ALIENATION_SUCCESS_OPINION,
        decayable: true,
      });
      emitChronicleEvent({
        type: '离间成功',
        actors: [scheme.initiatorId, scheme.primaryTargetId, data.secondaryTargetId],
        territories: [],
        description,
        priority: EventPriority.Normal,
      });
    } else {
      // 失败：双方对发起人 -40，发起人 -20 威望
      cs.addOpinion(scheme.primaryTargetId, scheme.initiatorId, {
        reason: '离间败露',
        value: ALIENATION_FAIL_OPINION,
        decayable: true,
      });
      cs.addOpinion(data.secondaryTargetId, scheme.initiatorId, {
        reason: '离间败露',
        value: ALIENATION_FAIL_OPINION,
        decayable: true,
      });
      const initiator = cs.characters.get(scheme.initiatorId);
      if (initiator) {
        cs.updateCharacter(scheme.initiatorId, {
          resources: {
            ...initiator.resources,
            prestige: Math.max(0, initiator.resources.prestige + ALIENATION_FAIL_PRESTIGE),
          },
        });
      }
      emitChronicleEvent({
        type: '离间失败',
        actors: [scheme.initiatorId, scheme.primaryTargetId, data.secondaryTargetId],
        territories: [],
        description,
        priority: EventPriority.Normal,
      });
    }
  },
};

registerSchemeType(alienationDef);

export { alienationDef };
