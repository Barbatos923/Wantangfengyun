// ===== 计谋系统类型定义 =====
//
// SchemeInstance 是运行时实例，全字段 JSON-safe（无 Map/Set/函数指针）。
// SchemeTypeDef 是策略对象（每种计谋自注册到 registry）。
// 鉴别联合 SchemeTypeData 用于类型专属 data，新增计谋时只需扩展联合。

import type { GameDate } from '@engine/types';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import type { LlmPrompt } from '@engine/chronicle/llm/LlmProvider';

// ── 运行时状态 ──────────────────────────────────────────

export type SchemeStatus = 'active' | 'success' | 'failure' | 'exposed' | 'terminated';

/** 阶段进度。basic scheme 也走这个结构（total=1） */
export interface SchemePhase {
  current: number;          // 1-based
  total: number;
  progress: number;         // 0..phaseDuration
  phaseDuration: number;    // 当前阶段总天数
}

/** 代理人/同谋（v2 启用，v1 不写入） */
export interface SchemeAgent {
  characterId: string;
  role: string;
  contribution: 'success' | 'speed' | 'secrecy';
  snapshotStrategy: number;
}

/** 启动时冻结的快照值 */
export interface SchemeSnapshot {
  spymasterId: string;          // v1 = initiatorId
  spymasterStrategy: number;    // v1 直接用 initiator 的相关能力（按计谋类型可能是 strategy 或 diplomacy）
  targetSpymasterId: string;
  targetSpymasterStrategy: number;
  initialSuccessRate: number;
}

// ── 类型专属 data 鉴别联合 ──────────────────────────────

export interface CurryFavorData {
  kind: 'curryFavor';
}

export interface AlienationData {
  kind: 'alienation';
  secondaryTargetId: string;
  /** 'rumor' | 'forgedLetter' | 'honeyTrap' | 'custom'(v2)。string 而非 union 以便扩展 */
  methodId: string;
  /** 启动时快照的方法加分（纯加分）。预定义 init 时算，AI v2 由 LLM 返回 */
  methodBonus: number;
  // ── v2 AI 方法专属，v1 永远 undefined ──
  customDescription?: string;
  aiReasoning?: string;
}

export type SchemeTypeData = CurryFavorData | AlienationData;

// ── SchemeInstance ──────────────────────────────────────

export interface SchemeInstance {
  id: string;
  schemeTypeId: string;
  initiatorId: string;
  primaryTargetId: string;
  startDate: GameDate;
  status: SchemeStatus;

  /** 进度结构。basic = total 1，complex = total >= 2 */
  phase: SchemePhase;

  snapshot: SchemeSnapshot;
  /** complex 随阶段成长，basic 等于 snapshot.initialSuccessRate */
  currentSuccessRate: number;

  /**
   * 结算日期。status 转入 success/failure 时写入，供 per-(initiator,target,type) CD 判定用。
   * terminated（参与者死亡）**不**写入——死亡已使同名 target 的 CD 语义失效。
   * 旧档 / active 状态时为 undefined。
   */
  resolveDate?: GameDate;

  // ── v2 扩展位 ──
  agents?: SchemeAgent[];
  secrecy?: number;
  breaches?: number;

  data: SchemeTypeData;
}

// ── 启动参数（强类型，由 def.parseParams 守卫产出） ──────

/** 所有计谋共享的 params 基础形态 */
export interface BaseSchemeParams {
  primaryTargetId: string;
}

/** 拉拢专用 params（无额外字段） */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CurryFavorParams extends BaseSchemeParams {}

/** 离间专用 params */
export interface AlienationParams extends BaseSchemeParams {
  secondaryTargetId: string;
  methodId: string;
  // v2 AI 方法预留
  customDescription?: string;
  aiReasoning?: string;
}

// ── SchemeContext / 策略对象 ────────────────────────────

/**
 * SchemeContext 是 def 内部纯函数路径用的"快照视图"。
 * lazy 函数避免直接读 store，便于测试与 NPC 路径复用。
 */
export interface SchemeContext {
  characters: Map<string, Character>;
  territories: Map<string, Territory>;
  currentDate: GameDate;
  getOpinion: (a: string, b: string) => number;
  hasAlliance: (a: string, b: string) => boolean;
  vassalIndex: Map<string, Set<string>>;
}

/** 终局 outcome 描述（不直接写状态，由 applyEffects 落地） */
export interface SchemeEffectOutcome {
  kind: 'success' | 'failure';
  description: string;
}

/**
 * 计谋类型策略对象。每种计谋实现一份并自注册到 registry。
 * 泛型 TParams 让 def 内部所有方法拿到强类型 params，
 * 与 executeInitiateScheme 入口的 unknown 之间由 parseParams 一次性桥接。
 */
export interface SchemeTypeDef<TParams extends BaseSchemeParams = BaseSchemeParams> {
  id: string;
  name: string;
  icon: string;
  category: 'hostile' | 'personal' | 'political';
  isBasic: boolean;
  baseDurationDays: number;     // basic = 总天数；complex = 单阶段天数
  phaseCount: number;           // basic = 1
  costMoney: number;

  description: string;
  /** 史书 type 字串（必须在 CHRONICLE_TYPE_WHITELIST 中） */
  chronicleTypes: { initiate: string; success: string; failure: string };

  /**
   * 入口守卫：raw → 强类型 TParams。失败 = null（执行层视为 stale）。
   * 这是动态 unknown 入参与强类型 def 内部的唯一桥梁。
   */
  parseParams(raw: unknown): TParams | null;

  getValidPrimaryTargets(initiator: Character, ctx: SchemeContext): Character[];

  /** 极廉价：仅用于交互菜单显示与否 */
  canShow(initiator: Character, target: Character, ctx: SchemeContext): boolean;

  /**
   * 完整校验：返回 null = 可发起，否则原因字串。
   * @param precomputedRateOverride v2 AI 方法路径的最终 initial rate（UI 侧先调 LLM 取得）。
   *   def 实现应据此判定 AI 方法场景下"未提供 override"的非法路径，返回 stale 原因字串；
   *   不要在此处抛异常——execute 路径契约是"失败返回 false，不抛"。
   * @param options.skipAiGuard v2 AI 方法预评估专用：`evaluateCustomSchemeRate` 在调 LLM
   *   **之前**用此旗标跑一次 canInitiate 做 stale 预校验，此时尚无 override 但需要通过
   *   通用检查（目标存活 / 关系 / 费用 / ...），只有"AI 方法必须带 override"这一条守卫
   *   需要跳过。LLM 返回后进入 executeInitiateScheme，会再跑一次**不带**此旗标的 canInitiate，
   *   届时 AI 守卫正常生效。
   */
  canInitiate(
    initiator: Character,
    params: TParams,
    ctx: SchemeContext,
    precomputedRateOverride?: number,
    options?: { skipAiGuard?: boolean },
  ): string | null;

  /**
   * 启动时构建 data + 计算 initialSuccessRate + snapshot。
   * @param precomputedRateOverride v2 AI 方法路径专用：LLM 评估得到的最终 initial rate，
   *   **绕过**基础公式（stratDiff × k + base）直接作为初始成功率（仍 clamp 到方法上下限）。
   *   语义从 v1 的"bonus 叠加在 base 上"变为"覆盖最终 rate"，故改名。v1 路径 永远 undefined。
   *   初始契约由 canInitiate 保证，initInstance 内部遇到非法输入走兜底而非抛错。
   */
  initInstance(
    initiator: Character,
    params: TParams,
    ctx: SchemeContext,
    precomputedRateOverride?: number,
  ): {
    data: SchemeTypeData;
    initialSuccessRate: number;
    snapshot: SchemeSnapshot;
  };

  /** complex 才实现：阶段完成时回调，返回新的 currentSuccessRate */
  onPhaseComplete?(scheme: SchemeInstance, ctx: SchemeContext): number;

  /** 终局结算（不写状态） */
  resolve(scheme: SchemeInstance, rng: () => number, ctx: SchemeContext): SchemeEffectOutcome;

  /** 真正写状态（addOpinion / 扣威望 / 史书 emit） */
  applyEffects(scheme: SchemeInstance, outcome: SchemeEffectOutcome, ctx: SchemeContext): void;

  /**
   * 构造 AI 方法的 LLM prompt（v2+）。
   * 只有支持 AI 方法的 scheme type 实现此方法；不实现 = 该类型不支持自拟妙计。
   *
   * 实现约定：
   * - system prompt 扮演古代谋士，明确输出格式"只输出一个整数百分比，范围 -20 到 100"。
   * - user prompt 包含完整人物上下文（三方名/特质/能力/关系/身份/势力/所在地）+ 玩家自拟描述。
   * - 不做数值 clamp；由 orchestrator 统一 clamp。
   * - **允许**在此方法内部直接读 live Store（territories/characters/military 等）——此方法
   *   只在玩家主动发起"自拟妙计"时被调用一次，非热路径，不走 NPC/月结/日结 循环。
   *   因此 SchemeContext 不必为了 AI prompt 而膨胀字段。
   */
  buildAiMethodPrompt?(
    initiator: Character,
    params: TParams,
    customDescription: string,
    ctx: SchemeContext,
  ): LlmPrompt;
}
