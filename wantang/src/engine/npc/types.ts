// ===== NPC Engine 类型定义 =====

import type { GameDate, Era } from '@engine/types';
import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import type { Personality } from '@data/traits';
import type { War } from '@engine/military/types';

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
   * 玩家处理模式：
   * - 'push-task': 生成 PlayerTask 推送给玩家（铨选、考课审批）
   * - 'skip': 玩家跳过此行为，由玩家自己主动发起（宣战、要求效忠）
   * - 'auto-execute': 即使是玩家也自动执行（未来被动行为）
   */
  playerMode: 'push-task' | 'skip' | 'auto-execute';

  /** 纯函数：评估 actor 是否应触发此行为。返回 null 表示不触发 */
  generateTask: (actor: Character, context: NpcContext) => BehaviorTaskResult<TData> | null;

  /** 副作用：NPC 自动执行 */
  executeAsNpc: (actor: Character, data: TData, context: NpcContext) => void;

  /** 仅 playerMode='push-task' 时需要实现，生成玩家待处理任务 */
  generatePlayerTask?: (actor: Character, data: TData, context: NpcContext) => PlayerTask | null;
}

// ── NPC 决策上下文（月结快照） ───────────────────────────

/**
 * 每月初构建一次的全局快照，避免在 N×M 决策循环中高频读 Store。
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

  // 战争状态
  activeWars: War[];

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
}
