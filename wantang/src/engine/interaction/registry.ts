// ===== 交互注册表 =====

import type { Character } from '@engine/character/types';
import type { Interaction } from './types';

const interactions: Interaction[] = [];

/** 注册一个交互 */
export function registerInteraction(interaction: Interaction): void {
  interactions.push(interaction);
}

/** 获取 player 对 target 可用的所有交互 */
export function getAvailableInteractions(
  player: Character,
  target: Character,
): Interaction[] {
  return interactions.filter((i) => i.canShow(player, target));
}
