// ===== NPC Engine 类型定义 =====

import type { GameDate } from '@engine/types';

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

/** NPC 行为接口 */
export interface NpcBehavior {
  id: string;
  /** 评估该 NPC 是否有事要做，返回待处理数量（0 则跳过） */
  evaluate: (npcId: string) => number;
  /** 执行一轮行为（消耗 1 行动点） */
  execute: (npcId: string) => void;
}
