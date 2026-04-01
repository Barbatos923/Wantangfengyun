// ===== "宣战"交互 =====

import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useWarStore } from '@engine/military/WarStore';
import type { CasusBelli } from '@engine/military/types';

registerInteraction({
  id: 'declareWar',
  name: '宣战',
  icon: '⚔',
  canShow: (_player, target) => {
    // 对所有统治者都显示宣战按钮（禁用原因在面板中说明）
    return target.isRuler;
  },
  paramType: 'declareWar',
});

/** 执行宣战：扣除资源 + 创建战争 */
export function executeDeclareWar(
  playerId: string,
  targetId: string,
  casusBelli: CasusBelli,
  targetTerritoryIds: string[],
  date: { year: number; month: number },
  cost: { prestige: number; legitimacy: number },
): void {
  // 资源校验：不足则拒绝
  const char = useCharacterStore.getState().getCharacter(playerId);
  if (char) {
    if (char.resources.prestige + cost.prestige < 0) return;
    if (char.resources.legitimacy + cost.legitimacy < 0) return;
  }

  useCharacterStore.getState().addResources(playerId, {
    prestige: cost.prestige,
    legitimacy: cost.legitimacy,
  });
  const war = useWarStore.getState().declareWar(playerId, targetId, casusBelli, targetTerritoryIds, date);

  // 独立战争：宣战即脱离效忠关系
  if (casusBelli === 'independence') {
    const attacker = useCharacterStore.getState().getCharacter(playerId);
    if (attacker?.overlordId === targetId) {
      useWarStore.getState().updateWar(war.id, { previousOverlordId: targetId });
      useCharacterStore.getState().updateCharacter(playerId, { overlordId: undefined });
    }
  }
}
