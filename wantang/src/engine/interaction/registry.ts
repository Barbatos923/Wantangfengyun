// ===== 交互注册表 =====

import type { Character } from '@engine/character/types';
import type { Interaction, InteractionEntry } from './types';

const interactions: Interaction[] = [];

/** 注册一个交互 */
export function registerInteraction(interaction: Interaction): void {
  interactions.push(interaction);
}

/** 获取 player 对 target 可见的所有交互（含灰显原因） */
export function getAvailableInteractions(
  player: Character,
  target: Character,
): InteractionEntry[] {
  return interactions
    .filter((i) => i.canShow(player, target))
    .map((i) => ({
      interaction: i,
      disabledReason: i.canExecuteCheck?.(player, target) ?? null,
    }));
}
