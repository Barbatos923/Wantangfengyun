// ===== 计谋系统类型定义 =====
//
// SchemeInstance 是运行时实例，全字段 JSON-safe（无 Map/Set/函数指针）。
// SchemeTypeDef 是策略对象（每种计谋自注册到 registry）。
// 鉴别联合 SchemeTypeData 用于类型专属 data，新增计谋时只需扩展联合。

import type { GameDate } from '@engine/types';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';

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

  /** 完整校验：返回 null = 可发起，否则原因字串 */
  canInitiate(initiator: Character, params: TParams, ctx: SchemeContext): string | null;

  /**
   * 启动时构建 data + 计算 initialSuccessRate + snapshot。
   * @param precomputedMethodBonus v2 AI 方法路径专用，v1 永远是 undefined。
   */
  initInstance(
    initiator: Character,
    params: TParams,
    ctx: SchemeContext,
    precomputedMethodBonus?: number,
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
}
