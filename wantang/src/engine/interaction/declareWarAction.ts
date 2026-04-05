// ===== "宣战"交互 =====

import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority } from '@engine/types';
import type { CasusBelli } from '@engine/military/types';
import { ensureAppointRight } from '@engine/official/postTransfer';

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
  date: { year: number; month: number; day: number },
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

  // ── 宣战事件（无条件记录，UI 层筛选显示） ──
  {
    const charStore = useCharacterStore.getState();
    const attackerName = charStore.getCharacter(playerId)?.name ?? '???';
    const defenderName = charStore.getCharacter(targetId)?.name ?? '???';
    const CB_LABELS: Record<string, string> = { annexation: '武力兼并', claim: '法理宣称', independence: '独立' };
    console.log(`[战争] 宣战：${attackerName} → ${defenderName}（${CB_LABELS[casusBelli] ?? casusBelli}）`);

    useTurnManager.getState().addEvent({
      id: crypto.randomUUID(),
      date: { ...date },
      type: '宣战',
      actors: [playerId, targetId],
      territories: targetTerritoryIds,
      description: `${attackerName}向${defenderName}宣战`,
      priority: EventPriority.Normal,
    });
  }

  // 独立战争：宣战即脱离效忠关系
  if (casusBelli === 'independence') {
    const attacker = useCharacterStore.getState().getCharacter(playerId);
    if (attacker?.overlordId === targetId) {
      useWarStore.getState().updateWar(war.id, { previousOverlordId: targetId });
      useCharacterStore.getState().updateCharacter(playerId, { overlordId: undefined });
      ensureAppointRight(playerId);
    }
  }
}
