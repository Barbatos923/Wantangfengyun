// ===== 史书事件 emit helper =====
//
// 给 interaction / decision / NPC behavior 用的统一 addEvent 包装。
// 目的：把 id/date/priority 三件套和 useTurnManager.getState() 的样板代码收口，
// 让各 action 只需声明 type/actors/territories/description 四个语义字段。
//
// CLAUDE.md 史书 emit 纪律：
// - 仅在 execute 真正成功后调用（stale 校验通过 + 状态已写入）
// - priority 默认 Normal；主权变动（归附/逼迫授权/称王/称帝/王朝覆灭等）显式传 Major
// - 新增 type 时同步更新 chronicleService.ts 的 CHRONICLE_TYPE_WHITELIST

import { useTurnManager } from '@engine/TurnManager';
import { EventPriority } from '@engine/types';

/**
 * 五品门槛：rankLevel ≥ 17（从五品下）。
 * 用于过滤"任命/罢免"事件——铨选自动填补的低品流官小吏一年可能数十次，
 * 全部入史会淹没月稿。五品以上才算"史官值得着墨"。
 *
 * 大事件（剥夺/调任/转移臣属/归附/逼迫授权/抗命/留后指定）涉及的岗位天然
 * 都是 grantsControl 高品，无需此门槛。
 */
export const CHRONICLE_RANK_THRESHOLD = 17;

export interface EmitChronicleEventInput {
  type: string;
  actors: string[];
  territories: string[];
  description: string;
  priority?: EventPriority;
}

export function emitChronicleEvent(input: EmitChronicleEventInput): void {
  const turn = useTurnManager.getState();
  turn.addEvent({
    id: crypto.randomUUID(),
    date: { ...turn.currentDate },
    type: input.type,
    actors: input.actors,
    territories: input.territories,
    description: input.description,
    priority: input.priority ?? EventPriority.Normal,
  });
}
