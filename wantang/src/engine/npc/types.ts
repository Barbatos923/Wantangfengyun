// ===== NPC Engine 类型定义 =====

import type { GameDate, Era } from '@engine/types';
import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import type { Personality } from '@data/traits';
import type { War, Army, Battalion } from '@engine/military/types';

// ── 调动方案（铨选系统沿用） ────────────────────────────

/** 调动方案条目 */
export interface TransferEntry {
  postId: string;           // 目标岗位
  appointeeId: string;      // 被任命者
  legalAppointerId: string; // 法理主体（皇帝/辟署权持有人）
  vacateOldPost: boolean;   // 是否需要清空被任命者的当前岗位（升调/平调）
  proposedBy: string;       // 经办人 ID（宰相/吏部尚书）
}

/** 调动方案 */
export interface TransferPlan {
  entries: TransferEntry[];
  date: GameDate;
}

// ── NPC 行为框架 ────────────────────────────────────────

// ── 权重计算（Base + Add + Factor，CK3 模式） ──────────

/** 权重修正项 */
export interface WeightModifier {
  label: string;
  add?: number;      // 加法修正（累加到 base 上）
  factor?: number;   // 乘法修正（0=硬切，连乘到最终结果）
}

/**
 * 计算权重：max(0, sum(adds)) × product(factors)。
 * 结果即百分比概率（weight=10 → 10%）。
 */
export function calcWeight(modifiers: WeightModifier[]): number {
  let sum = 0;
  let factor = 1;
  for (const m of modifiers) {
    if (m.add !== undefined) sum += m.add;
    if (m.factor !== undefined) factor *= m.factor;
  }
  return Math.max(0, sum) * factor;
}

/** 行为生成结果 */
export interface BehaviorTaskResult<TData = unknown> {
  data: TData;
  weight: number;
  /** forced=true 时无视 maxActions 限制（如考课强制触发） */
  forced?: boolean;
}

/**
 * NPC 行为接口。
 * 所有 NPC 行为（铨选/考课/宣战/要求效忠等）实现此接口，
 * 由 NpcEngine 在月结决策循环中统一调度。
 */
export interface NpcBehavior<TData = unknown> {
  id: string;

  /**
   * 岗位门控：非空时，调度器在调用 generateTask 前检查 actor 是否持有其中一个 templateId 的岗位。
   * 用于岗位专属行为（如 'pos-emperor' 限定考课只由皇帝触发），可跳过绝大多数不符合条件的 actor。
   */
  requiredTemplateIds?: string[];

  /**
   * 玩家处理模式：
   * - 'push-task': 生成 PlayerTask 推送给玩家（铨选、考课审批）
   * - 'skip': 玩家跳过此行为，由玩家自己主动发起（宣战、要求效忠）
   * - 'auto-execute': 即使是玩家也自动执行（未来被动行为）
   * - 'standing': 常驻任务，引擎自动维护 PlayerTask 存在性，玩家随时可打开处理
   */
  playerMode: 'push-task' | 'skip' | 'auto-execute' | 'standing';

  /**
   * 调度频率（日结化）：
   * - 'daily': 每天对所有 actor 检测（行政职责，需及时推送）
   * - 'monthly-slot': 按哈希槽位+品级分档每月触发若干次（自愿行为）
   * 默认从 playerMode 推断：push-task → daily, skip/auto-execute → monthly-slot。
   * forced 行为的 forced 分支始终每天检测，不受此字段影响。
   */
  schedule?: 'daily' | 'monthly-slot';

  /** 纯函数：评估 actor 是否应触发此行为。返回 null 表示不触发 */
  generateTask: (actor: Character, context: NpcContext) => BehaviorTaskResult<TData> | null;

  /** 副作用：NPC 自动执行 */
  executeAsNpc: (actor: Character, data: TData, context: NpcContext) => void;

  /** playerMode='push-task'|'standing' 时需要实现，生成玩家待处理任务 */
  generatePlayerTask?: (actor: Character, data: TData, context: NpcContext) => PlayerTask | null;
}

// ── NPC 决策上下文（月结快照） ───────────────────────────

/**
 * 每日 NPC tick 开始时构建的全局快照，避免在 N×M 决策循环中高频读 Store，
 * 并保证同一 tick 内所有 behavior 看到一致的世界状态（不被前序 executeAsNpc 干扰）。
 * generateTask 必须只用 context 参数，不直接调 getState()。
 */
export interface NpcContext {
  date: GameDate;
  era: Era;
  characters: Map<string, Character>;
  territories: Map<string, Territory>;
  centralPosts: Post[];
  playerId: string | null;

  // 预计算缓存
  personalityCache: Map<string, Personality>;
  rankLevelCache: Map<string, number>;            // charId → official.rankLevel（无官为 0）
  expectedLegitimacyCache: Map<string, number>;   // charId → 最高岗位 baseLegitimacy

  // lazy-cached 查询
  getOpinion: (aId: string, bId: string) => number;
  getMilitaryStrength: (charId: string) => number;
  hasTruce: (a: string, b: string) => boolean;

  // 臣属索引
  vassalIndex: Map<string, Set<string>>;  // overlordId → Set<vassalId>

  // 军事快照
  armies: Map<string, Army>;
  battalions: Map<string, Battalion>;
  controllerIndex: Map<string, Set<string>>;  // controllerId → Set<territoryId>
  postIndex: Map<string, Post>;               // postId → Post
  holderIndex: Map<string, string[]>;         // holderId → postId[]

  // 战争状态
  activeWars: War[];

  // 国库预聚合
  capitalTreasury: Map<string, { money: number; grain: number }>;  // charId → capital 州国库
  totalTreasury: Map<string, { money: number; grain: number }>;    // charId → 所有州国库之和

  // 上月月结账本快照（economySystem 写入 LedgerStore.allLedgers）
  ledgers: Map<string, import('@engine/official/types').MonthlyLedger>;

  // 州国库滚动历史快照（最近 N 月净变动，treasury draft 等行为预测用）
  treasuryHistory: Map<string, { money: number[]; grain: number[] }>;

  // 铨选共享状态（可变，行为 execute 时填充）
  appointedThisRound: Set<string>;
}

// ── 玩家待处理任务 ──────────────────────────────────────

export interface PlayerTask {
  id: string;
  type: string;        // 行为 ID（对应 NpcBehavior.id）
  actorId: string;     // 归属角色 ID
  data: unknown;       // 行为专属数据
  deadline: GameDate;  // 超时后 NPC Engine 兜底执行
  /** 常驻任务标记：由引擎自动维护存在性，无 deadline 紧迫感 */
  standing?: boolean;
}
