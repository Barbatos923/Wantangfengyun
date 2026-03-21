// ===== "任命职位"交互 =====

import type { Character } from '@engine/character/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';

/** 注册任命交互 */
registerInteraction({
  id: 'appoint',
  name: '任命职位',
  icon: '📜',
  canShow: (player, target) => {
    // target 必须效忠于 player
    if (target.overlordId !== player.id) return false;
    // target 必须有 official 数据
    if (!target.official) return false;
    // player 必须有至少一个可任命职位
    if (!player.official) return false;
    const canAppointAny = player.official.positions.some((h) => {
      const def = positionMap.get(h.positionId);
      return def && def.canAppoint.length > 0;
    });
    return canAppointAny;
  },
  paramType: 'appoint',
});

/** 获取玩家可以任命的所有职位ID（去重） */
export function getAppointablePositions(player: Character): string[] {
  if (!player.official) return [];
  const ids = new Set<string>();
  for (const h of player.official.positions) {
    const def = positionMap.get(h.positionId);
    if (def) {
      for (const pid of def.canAppoint) ids.add(pid);
    }
  }
  return Array.from(ids);
}

/** 执行任命（普通职位） */
export function executeAppoint(
  playerId: string,
  targetId: string,
  positionId: string,
  territoryId?: string,
): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const date = useTurnManager.getState().currentDate;

  const holding = {
    positionId,
    appointedBy: playerId,
    appointedDate: { year: date.year, month: date.month },
    territoryId,
  };

  if (positionId === 'pos-cishi' && territoryId) {
    // 刺史任命：领地转移
    // 1. 移除玩家对该州的刺史职位
    charStore.removePositionByTerritory(playerId, 'pos-cishi', territoryId);
    // 2. 给 target 添加刺史职位
    charStore.appointPosition(targetId, holding);
    // 3. 转移领地控制权
    const player = charStore.getCharacter(playerId);
    const target = charStore.getCharacter(targetId);
    if (player) {
      charStore.updateCharacter(playerId, {
        controlledTerritoryIds: player.controlledTerritoryIds.filter((id) => id !== territoryId),
      });
    }
    if (target) {
      charStore.updateCharacter(targetId, {
        controlledTerritoryIds: [...(target.controlledTerritoryIds || []), territoryId],
      });
    }
    terrStore.updateTerritory(territoryId, { actualControllerId: targetId });
  } else {
    // 普通职位
    charStore.appointPosition(targetId, holding);
  }

  // 确保效忠关系
  charStore.updateCharacter(targetId, { overlordId: playerId });
}
