// ===== "罢免职位"交互 =====

import type { Character } from '@engine/character/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';

/** 注册罢免交互 */
registerInteraction({
  id: 'dismiss',
  name: '罢免职位',
  icon: '❌',
  canShow: (player, target) => {
    // target 必须有由 player 任命的职位
    if (!target.official) return false;
    return target.official.positions.some((p) => p.appointedBy === player.id);
  },
  paramType: 'dismiss',
});

/** 获取 target 中由 player 任命的所有职位 */
export function getDismissablePositions(
  player: Character,
  target: Character,
): { positionId: string; territoryId?: string }[] {
  if (!target.official) return [];
  return target.official.positions
    .filter((p) => p.appointedBy === player.id)
    .map((p) => ({ positionId: p.positionId, territoryId: p.territoryId }));
}

/** 执行罢免 */
export function executeDismiss(
  playerId: string,
  targetId: string,
  positionId: string,
  territoryId?: string,
): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const date = useTurnManager.getState().currentDate;

  if (positionId === 'pos-cishi' && territoryId) {
    // 刺史罢免：领地回收
    // 1. 移除 target 的刺史职位
    charStore.removePositionByTerritory(targetId, 'pos-cishi', territoryId);
    // 2. 回收领地控制权
    const target = charStore.getCharacter(targetId);
    const player = charStore.getCharacter(playerId);
    if (target) {
      charStore.updateCharacter(targetId, {
        controlledTerritoryIds: target.controlledTerritoryIds.filter((id) => id !== territoryId),
      });
    }
    if (player) {
      charStore.updateCharacter(playerId, {
        controlledTerritoryIds: [...(player.controlledTerritoryIds || []), territoryId],
      });
    }
    terrStore.updateTerritory(territoryId, { actualControllerId: playerId });
    // 3. 玩家自动获得该州刺史
    charStore.appointPosition(playerId, {
      positionId: 'pos-cishi',
      appointedBy: player?.overlordId ?? 'system',
      appointedDate: { year: date.year, month: date.month },
      territoryId,
    });
  } else {
    // 普通职位罢免
    charStore.removePosition(targetId, positionId);
  }
}
