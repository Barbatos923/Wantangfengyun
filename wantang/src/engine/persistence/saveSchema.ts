// ===== 存档数据结构 =====
//
// SaveFile = 把所有 store 的"原始数据"序列化的结果。
// 索引（vassalIndex / postIndex / controllerIndex / aliveSet 等）一律不存，
// 由各 store 的 initXxx() 在反序列化时自动重建。

import type { GameDate, GameEvent, GameSpeed, Era } from '@engine/types';
import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import type { Army, Battalion, War, Campaign, Siege, Truce } from '@engine/military/types';
import type { MonthlyLedger } from '@engine/official/types';
import type { DeploySubmission } from '@engine/military/deployCalc';
import type { TreasurySubmission } from '@engine/official/treasuryDraftCalc';
import type { TransferPlan, PlayerTask } from '@engine/npc/types';
import type { StoryEvent, StoryEventOption } from '@engine/storyEventBus';
import type { MonthDraft, YearChronicle } from '@engine/chronicle/types';

/** 存档 schema 版本号。schema 不兼容变动时自增，并在 migrations.ts 添加迁移逻辑。 */
export const SAVE_VERSION = 5;

/** 存档槽 ID 常量（MVP 期固定单槽） */
export const CURRENT_SAVE_SLOT = 'current';

/** StoryEvent 序列化形式：strip onSelect 函数指针。effectKey + effectData 保留，读档后由 storyEffectResolver 重建回调。 */
export type SerializedStoryEventOption = Omit<StoryEventOption, 'onSelect'>;
export interface SerializedStoryEvent extends Omit<StoryEvent, 'options'> {
  options: SerializedStoryEventOption[];
}

export interface SaveFile {
  version: number;
  savedAt: string;            // ISO timestamp
  // 显示用元信息
  gameDate: GameDate;
  playerName: string;

  // RNG
  rngSeed: string;
  rngState: unknown;          // seedrandom Arc4 state（决定性 RNG 中间态）

  // ── 角色 ──
  characters: Character[];
  playerId: string | null;

  // ── 领地 ──
  territories: Territory[];
  centralPosts: Post[];

  // ── 军事 ──
  armies: Army[];
  battalions: Battalion[];

  // ── 战争 ──
  wars: War[];
  campaigns: Campaign[];
  sieges: Siege[];
  truces: Truce[];

  // ── NPC 缓冲区 ──
  npc: {
    draftPlan: TransferPlan | null;
    deployDrafts: [string, DeploySubmission[]][];
    deployDrafterCooldowns: [string, GameDate][];
    treasuryDrafts: [string, TreasurySubmission[]][];
    treasuryDrafterCooldowns: [string, GameDate][];
    playerTasks: PlayerTask[];
  };

  // ── Ledger ──
  playerLedger: MonthlyLedger | null;
  allLedgers: [string, MonthlyLedger][];
  treasuryHistory: [string, { money: number[]; grain: number[] }][];

  // ── TurnManager ──
  turnState: {
    currentDate: GameDate;
    speed: GameSpeed;
    era: Era;
    stabilityProgress: number;
    collapseProgress: number;
    events: GameEvent[];
    isPaused: boolean;
    seed: string;
    playthroughId: string;
    dynastyExtinct: boolean;
  };

  // ── StoryEventBus ──
  storyEventQueue: SerializedStoryEvent[];
  storySpeedBeforePause: GameSpeed | null;

  // ── AI 史书（不含 LLM apiKey，那个走独立 IndexedDB store） ──
  chronicleState: {
    monthDrafts: Array<[string, MonthDraft]>;
    yearChronicles: Array<[number, YearChronicle]>;
  };
}
