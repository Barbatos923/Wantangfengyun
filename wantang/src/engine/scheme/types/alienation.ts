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
import type { LlmPrompt } from '@engine/chronicle/llm/LlmProvider';
import { registerSchemeType } from '../registry';
import { clamp, hasRelationship } from '../schemeCalc';
import { resolveSpymaster } from '../spymasterCalc';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { calcPersonality } from '@engine/character/personalityUtils';
import { getSovereigntyTier, findEmperorId } from '@engine/official/postQueries';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { EventPriority } from '@engine/types';
import { positionMap } from '@data/positions';
import { traitMap } from '@data/traits';

// ── 数值常量（统一参数：方法不影响） ─────────────────

export const ALIENATION_BASE_RATE = 5;
export const ALIENATION_PHASE_DAYS = 30;
export const ALIENATION_PHASES = 3;
export const ALIENATION_COST = 500;
export const ALIENATION_GROWTH_PER_PHASE = 8;
export const ALIENATION_INITIAL_CAP = 80;
export const ALIENATION_FINAL_CAP = 90;

// 失败副作用（统一，方法不影响）
const ALIENATION_FAIL_OPINION = -40;      // 双方对发起人
const ALIENATION_FAIL_PRESTIGE = -20;     // 发起人威望损失
const ALIENATION_SUCCESS_OPINION = -100;  // 双方互相好感（高风险高回报：一次成功即深仇）

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
  // ── v2 AI 方法（玩家自拟，由 LLM 评估）──
  // 故意排在第 1 位：UI 里作为首张卡片展示。
  // NPC 通过 getAvailableAlienationMethods() 的 isAI 过滤永远拿不到此方法。
  {
    id: 'custom',
    name: '自拟妙计',
    description: '自行设计手段，由谋士评议其合理性。',
    hint: '成功率将取决于手段是否合适',
    calcBonus: () => 0,  // never called for AI methods
    isAI: true,
  },
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
];

export function getAlienationMethod(id: string): AlienationMethodDef | undefined {
  return ALIENATION_METHODS.find(m => m.id === id);
}

/**
 * NPC 候选集：过滤掉 AI 方法。
 * NPC 行为（alienateBehavior）必须用此函数获取候选，**禁止**访问 ALIENATION_METHODS 原始数组。
 */
export function getAvailableAlienationMethods(): AlienationMethodDef[] {
  return ALIENATION_METHODS.filter(m => !m.isAI);
}

/**
 * UI 候选集：保留完整列表（含 AI 方法），用于玩家发起向导。
 * UI 侧基于 isAiMethodAvailable() 做 mock 兜底禁用，不在此处过滤。
 */
export function getAlienationMethodsForUI(): AlienationMethodDef[] {
  return ALIENATION_METHODS.slice();
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
  attackSpymasterStrategy: number,
  defendSpymasterStrategy: number,
  methodBonus: number,
): number {
  // base 5 + 谋主谋略差 × 3 + 方法加成
  // 基础概率刻意压低：无优势的裸离间只有 5%，叙事上离间本来就是"找到对的条件才出手"
  // 谋略差系数 3：典型 ±10 stratDiff 拉开 ±30 百分点，让外交/战略能力实感化
  const stratDiff = attackSpymasterStrategy - defendSpymasterStrategy;
  const baseRate = ALIENATION_BASE_RATE + stratDiff * 3;
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
  chronicleTypes: { initiate: '发起离间', success: '离间成功', failure: '离间失败', exposed: '离间暴露' },

  exposureConfig: {
    baseDetectionRate: 15,
    opinionPenalty: ALIENATION_FAIL_OPINION,     // -40，等同正常失败
    prestigePenalty: -ALIENATION_FAIL_PRESTIGE,   // 20，等同正常失败（FAIL_PRESTIGE 是 -20）
    getMethodExposureModifier: (scheme) => {
      const data = scheme.data as AlienationData;
      const modifiers: Record<string, number> = {
        rumor: 5,        // 谣言流传广，容易被追溯
        forgedLetter: -5, // 书信一对一，隐蔽性好
        honeyTrap: 10,    // 需要实体接触，暴露风险最高
        custom: 0,        // AI 方法走中性基线
      };
      return modifiers[data.methodId] ?? 0;
    },
  },

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

  canInitiate(initiator, params, ctx, precomputedRateOverride, options) {
    const target = ctx.characters.get(params.primaryTargetId);
    if (!target?.alive) return '目标不存在';
    if (target.id === initiator.id) return '不能对自己使用';
    const secondary = ctx.characters.get(params.secondaryTargetId);
    if (!secondary?.alive) return '次要目标不存在';
    if (secondary.id === initiator.id || secondary.id === target.id) return '次要目标不可重复';
    if (!hasRelationship(target, secondary, ctx)) return '两者之间无可离间的关系';
    const method = getAlienationMethod(params.methodId);
    if (!method) return '手段不存在';
    // AI 方法必须先经 LLM 评估，UI 侧调 evaluateCustomSchemeRate 取得 rate 后透传进来。
    // 任何未带 override 的 AI 方法调用都视为 stale —— 不抛异常，维持 execute 契约（返回 false）。
    // 例外：`options.skipAiGuard` 为 true 时（预评估路径），跳过此守卫但仍跑其余通用校验。
    if (method.isAI && precomputedRateOverride === undefined && !options?.skipAiGuard) {
      return '自拟妙计需先经谋士评议';
    }
    if (initiator.resources.money < ALIENATION_COST) {
      return `金钱不足（需 ${ALIENATION_COST}）`;
    }
    return null;
  },

  initInstance(initiator, params, ctx, precomputedRateOverride) {
    const target = ctx.characters.get(params.primaryTargetId)!;
    const secondary = ctx.characters.get(params.secondaryTargetId)!;
    const method = getAlienationMethod(params.methodId)!;
    const attackSm = resolveSpymaster(initiator.id, ctx.spymasters, ctx.characters, ctx.vassalIndex);
    const defendSm = resolveSpymaster(target.id, ctx.spymasters, ctx.characters, ctx.vassalIndex);

    // 分支 initial rate 计算：
    // - AI 方法（method.isAI）：LLM 返回值作为最终 rate，绕过 stratDiff×3 + base 5 公式。
    //   上下限放宽到 [-20, 100]（预设方法是 [5, 80]）。
    // - 预设方法：同步 calcBonus 后走 calcAlienationInitialRate 公式（使用谋主 strategy）。
    // 防御性兜底：AI 方法进来时 canInitiate 已保证 override 非空，若因调用者绕过校验而缺失，
    // 走 console.error + 0 rate 而非抛异常（保持 execute 契约）。
    let finalRate: number;
    let methodBonus: number;

    if (method.isAI) {
      if (precomputedRateOverride === undefined) {
        // eslint-disable-next-line no-console
        console.error('[alienation] AI 方法 initInstance 缺 precomputedRateOverride，兜底 rate=0', params);
        finalRate = 0;
      } else {
        finalRate = clamp(precomputedRateOverride, -20, 100);
      }
      methodBonus = 0;  // snapshot 字段语义上不适用于 AI 方法，置 0
    } else {
      methodBonus = method.calcBonus(target, secondary, initiator, ctx);
      finalRate = calcAlienationInitialRate(attackSm.abilities.strategy, defendSm.abilities.strategy, methodBonus);
    }

    const data: AlienationData = {
      kind: 'alienation',
      secondaryTargetId: secondary.id,
      methodId: params.methodId,
      methodBonus,
      // 预设方法路径永远 undefined；AI 方法路径由 UI 透传玩家自拟原文
      customDescription: params.customDescription,
      aiReasoning: params.aiReasoning,
    };
    const snapshot: SchemeSnapshot = {
      spymasterId: attackSm.id,
      spymasterStrategy: attackSm.abilities.strategy,
      targetSpymasterId: defendSm.id,
      targetSpymasterStrategy: defendSm.abilities.strategy,
      initialSuccessRate: finalRate,
    };
    return {
      data: data as SchemeTypeData,
      initialSuccessRate: finalRate,
      snapshot,
    };
  },

  onPhaseComplete(scheme, _ctx) {
    // AI 方法的阶段成长 cap 放宽到 100（预设方法是 90）。
    const data = scheme.data as AlienationData;
    const cap = data.methodId === 'custom' ? 100 : ALIENATION_FINAL_CAP;
    return Math.min(cap, scheme.currentSuccessRate + ALIENATION_GROWTH_PER_PHASE);
  },

  /**
   * v2 AI 方法专属：构造 prompt 供 LLM 评估玩家自拟的离间策略。
   * 此方法允许读 live Store（非热路径，玩家主动触发，每次施展最多调用一次）。
   * 见 SchemeTypeDef.buildAiMethodPrompt JSDoc。
   */
  buildAiMethodPrompt(initiator, params, customDescription, ctx): LlmPrompt {
    const primary = ctx.characters.get(params.primaryTargetId);
    const secondary = ctx.characters.get(params.secondaryTargetId);
    if (!primary || !secondary) {
      // 防御：canInitiate 已过，但 ctx 不同步极端边界仍兜底
      return {
        system: '你是一位古代谋士。',
        user: `评估此离间策略的成功率（整数，-20 到 100）：\n${customDescription}`,
      };
    }

    const system = `你是一位精通人心与权谋的古代谋士，擅长评估离间计谋对特定人物组合的有效性。你的任务是根据主谋提供的策略描述，结合三方人物的具体情况（性格、能力、身份、彼此关系），给出该计谋的成功率。

评估准则：
- 策略是否针对直接目标与次要目标之间的真实薄弱点（嫌隙、猜忌、利益冲突）
- 策略是否契合直接目标的性格弱点（多疑、贪婪、怯懦、轻信等）
- 策略的执行成本、暴露风险与主谋的能力是否匹配
- 策略是否符合所处时代（晚唐约 867 年）的实际条件与权力结构
- 针对具体情境、利用真实弱点、执行路径清晰 → 高分（60-100）
- 常规套路、合理但无亮点 → 中等（20-60）
- 天马行空、脱离实际、文采浮夸而无可操作性 → 低分（0-20）
- 荒谬不经或纯粹空想 → 负分（-20 为地板）

输出要求：只输出一个整数百分比，范围 -20 到 100，不要 % 符号，不要任何解释或标点。例如：45`;

    const user = buildAlienationContextBlock(initiator, primary, secondary, ctx)
      + '\n\n【主谋策略】（主谋自拟，最多 400 字）\n'
      + customDescription.trim()
      + '\n\n请评估此策略的成功率（整数，-20 到 100，只输出数字）：';

    return { system, user };
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

  applyEffects(scheme, outcome, ctx) {
    const cs = useCharacterStore.getState();
    const data = scheme.data as AlienationData;

    // 自拟妙计：把玩家自拟内容附加到史书 description
    let description = outcome.description;
    if (data.customDescription) description += `\n策略：${data.customDescription}`;

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

// ── 角色渲染 helpers ────────────────────────────────────
//
// 供 AI 方法 prompt + chronicle 史书 description 共用。
// 允许读 live Store（territories/military/central posts），非热路径（每次 emit 一条）。

function buildAlienationContextBlock(
  initiator: Character,
  primary: Character,
  secondary: Character,
  ctx: SchemeContext,
): string {
  const initiatorBlock = renderCharacterBlock(initiator, '主谋', ctx);
  const primaryBlock = renderCharacterBlock(primary, '直接目标', ctx);
  const secondaryBlock = renderCharacterBlock(secondary, '次要目标', ctx);

  const relations = renderRelations(initiator, primary, secondary, ctx);

  return `${initiatorBlock}\n\n${primaryBlock}\n\n${secondaryBlock}\n\n${relations}`;
}

function renderCharacterBlock(char: Character, role: string, ctx: SchemeContext): string {
  const lines: string[] = [];
  lines.push(`【${role}】${char.name}`);
  lines.push(`  性格特质：${renderTraits(char) || '（无显著特质）'}`);
  lines.push(`  能力：${renderAbilities(char)}`);
  const mainPost = renderMainPost(char.id, ctx);
  if (mainPost) lines.push(`  岗位：${mainPost}`);
  const location = renderLocation(char, ctx);
  if (location) lines.push(`  所在地：${location}`);
  const power = renderPower(char.id, ctx);
  if (power) lines.push(`  势力：${power}`);
  return lines.join('\n');
}

function renderTraits(char: Character): string {
  const names: string[] = [];
  for (const tid of char.traitIds) {
    const t = traitMap.get(tid);
    if (!t) continue;
    if (t.category !== 'innate' && t.category !== 'personality') continue;
    names.push(t.name);
  }
  // 再补充人格维度的 top-3 极端维度（绝对值排序）
  const p = calcPersonality(char);
  const dims: Array<{ key: string; val: number; label: string }> = [
    { key: 'boldness', val: p.boldness, label: p.boldness > 0 ? '果敢' : '怯懦' },
    { key: 'rationality', val: p.rationality, label: p.rationality > 0 ? '理性' : '易感' },
    { key: 'vengefulness', val: p.vengefulness, label: p.vengefulness > 0 ? '记仇' : '宽和' },
    { key: 'greed', val: p.greed, label: p.greed > 0 ? '贪婪' : '清廉' },
    { key: 'honor', val: p.honor, label: p.honor > 0 ? '守信' : '反复' },
    { key: 'sociability', val: p.sociability, label: p.sociability > 0 ? '善交' : '孤僻' },
    { key: 'compassion', val: p.compassion, label: p.compassion > 0 ? '仁厚' : '冷酷' },
  ];
  const top = dims
    .filter(d => Math.abs(d.val) > 0.2)
    .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
    .slice(0, 3)
    .map(d => d.label);
  return [...names, ...top].join('、');
}

function renderAbilities(char: Character): string {
  const { military, administration, strategy, diplomacy, scholarship } = char.abilities;
  const parts = [
    `武${military}`,
    `政${administration}`,
    `谋${strategy}`,
    `交${diplomacy}`,
    `学${scholarship}`,
  ];
  // 标签化卓越项
  const tags: string[] = [];
  if (military >= 8) tags.push('善战');
  if (administration >= 8) tags.push('善治');
  if (strategy >= 8) tags.push('善谋');
  if (diplomacy >= 8) tags.push('善交');
  if (scholarship >= 8) tags.push('博学');
  return parts.join(' ') + (tags.length > 0 ? `（${tags.join('、')}）` : '');
}

function renderMainPost(charId: string, _ctx: SchemeContext): string {
  const ts = useTerritoryStore.getState();
  // 皇帝特判
  const emperor = findEmperorId(ts.territories, ts.centralPosts);
  if (emperor === charId) return '皇帝';

  let bestRank = -1;
  let bestName = '';
  for (const terr of ts.territories.values()) {
    for (const post of terr.posts) {
      if (post.holderId !== charId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      if (tpl.minRank > bestRank) {
        bestRank = tpl.minRank;
        bestName = `${terr.name}${tpl.name}`;
      }
    }
  }
  // 中央岗位兜底
  if (!bestName) {
    for (const post of ts.centralPosts) {
      if (post.holderId !== charId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl) continue;
      if (tpl.minRank > bestRank) {
        bestRank = tpl.minRank;
        bestName = tpl.name;
      }
    }
  }
  return bestName;
}

function renderLocation(char: Character, _ctx: SchemeContext): string {
  if (!char.locationId) return '';
  const ts = useTerritoryStore.getState();
  const terr = ts.territories.get(char.locationId);
  return terr?.name ?? '';
}

function renderPower(charId: string, _ctx: SchemeContext): string {
  const ts = useTerritoryStore.getState();
  const controllerSet = ts.controllerIndex.get(charId);
  const terrCount = controllerSet?.size ?? 0;

  const ms = useMilitaryStore.getState();
  let totalStrength = 0;
  const armyIds = ms.ownerArmyIndex.get(charId);
  if (armyIds) {
    for (const armyId of armyIds) {
      const batIds = ms.armyBattalionIndex.get(armyId);
      if (!batIds) continue;
      for (const batId of batIds) {
        const bat = ms.battalions.get(batId);
        if (bat) totalStrength += bat.currentStrength;
      }
    }
  }

  const parts: string[] = [];
  if (terrCount > 0) parts.push(`直辖 ${terrCount} 州`);
  if (totalStrength > 0) parts.push(`兵力约 ${totalStrength}`);
  if (parts.length === 0) return '无直辖领地与军队';
  return parts.join('，');
}

function renderRelations(
  initiator: Character,
  primary: Character,
  secondary: Character,
  ctx: SchemeContext,
): string {
  const lines: string[] = ['【关系】'];

  // 主↔次 好感（双向）
  const opPS = ctx.getOpinion(primary.id, secondary.id);
  const opSP = ctx.getOpinion(secondary.id, primary.id);
  lines.push(`  ${primary.name} → ${secondary.name}：好感 ${opPS}（${opinionLabel(opPS)}）`);
  lines.push(`  ${secondary.name} → ${primary.name}：好感 ${opSP}（${opinionLabel(opSP)}）`);

  // 主↔次 效忠关系
  const allegiancePS = renderAllegiance(primary, secondary);
  if (allegiancePS) lines.push(`  ${allegiancePS}`);

  // 主↔次 同盟
  if (ctx.hasAlliance(primary.id, secondary.id)) {
    lines.push(`  ${primary.name}与${secondary.name}有同盟关系`);
  } else {
    lines.push(`  ${primary.name}与${secondary.name}无同盟`);
  }

  // 主谋与主目标/次目标的效忠关系
  const allegianceIP = renderAllegiance(initiator, primary);
  if (allegianceIP) lines.push(`  ${allegianceIP}`);
  const allegianceIS = renderAllegiance(initiator, secondary);
  if (allegianceIS) lines.push(`  ${allegianceIS}`);

  // 主谋对两个目标的好感（辅助 LLM 判断主谋立场）
  lines.push(
    `  ${initiator.name} → ${primary.name}：好感 ${ctx.getOpinion(initiator.id, primary.id)}`,
  );
  lines.push(
    `  ${initiator.name} → ${secondary.name}：好感 ${ctx.getOpinion(initiator.id, secondary.id)}`,
  );

  return lines.join('\n');
}

function opinionLabel(op: number): string {
  if (op >= 50) return '亲密';
  if (op >= 20) return '友善';
  if (op >= -20) return '平常';
  if (op >= -50) return '冷淡';
  return '敌视';
}

function renderAllegiance(a: Character, b: Character): string {
  if (a.overlordId === b.id) return `${a.name}是${b.name}的直属臣属`;
  if (b.overlordId === a.id) return `${b.name}是${a.name}的直属臣属`;
  return '';
}

