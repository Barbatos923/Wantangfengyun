import React, { useState } from 'react';
import GameMap from './GameMap';
import TerritoryPanel from './TerritoryPanel';
import CampaignPopup from './CampaignPopup';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import type { Character } from '@engine/character/types';
import { usePanelStore } from '@ui/stores/panelStore';
import { getActualController } from '@engine/official/officialUtils';
import { findTopLord } from '@engine/character/characterUtils';

/**
 * 沿 overlordId 链找到 controllerId 在 lordId 下的一级封臣。
 * 如果 controllerId === lordId，返回 lordId（直辖）。
 */
function findFirstVassalOf(
  controllerId: string,
  lordId: string,
  characters: Map<string, Character>,
): string {
  let current = controllerId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) return current;
    visited.add(current);
    const char = characters.get(current);
    if (!char) return current;
    if (current === lordId) return lordId;
    if (char.overlordId === lordId) return current;
    if (!char.overlordId) return current;
    current = char.overlordId;
  }
}

const MapPlaceholder: React.FC = () => {
  const territories = useTerritoryStore((s) => s.territories);
  const characters = useCharacterStore((s) => s.characters);
  const playerId = useCharacterStore((s) => s.playerId) ?? '';
  const territoryModalId = usePanelStore((s) => s.territoryModalId);
  const territoryForModal = territoryModalId ? territories.get(territoryModalId) : undefined;
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const handleSelectTerritory = (id: string) => {
    const t = territories.get(id);
    const controller = t ? getActualController(t) : null;
    if (!controller) return;

    const playerTopLord = findTopLord(playerId, characters);
    const topLord = findTopLord(controller, characters);
    // 从 Store 读最新值（避免快速双击时 React hook 闭包值滞后）
    const ps = usePanelStore.getState();
    const currentFocus = ps.mapFocusCharId;
    const currentChar = ps.stack[ps.stack.length - 1];

    if (topLord === playerTopLord) {
      // 玩家势力内（已按一级封臣着色）
      const firstVassal = findFirstVassalOf(controller, playerTopLord, characters);

      if (currentFocus === firstVassal) {
        // 该封臣已展开 → 点击内部的州
        if (currentChar === controller) {
          ps.openTerritoryModal(id);
        } else {
          ps.pushCharacter(controller);
        }
      } else {
        // 点击某封臣的领地 → 展开该封臣，显示其面板
        ps.setMapFocus(firstVassal);
        ps.pushCharacter(firstVassal);
      }
    } else if (currentFocus === topLord) {
      // 非玩家势力已展开
      if (currentChar === controller) {
        ps.openTerritoryModal(id);
      } else {
        ps.pushCharacter(controller);
      }
    } else {
      // 点击其他势力 → 展开其顶级领主
      ps.setMapFocus(topLord);
      ps.pushCharacter(topLord);
    }
  };

  return (
    <div className="flex-1 overflow-hidden relative">
      <GameMap
        onSelectTerritory={handleSelectTerritory}
        onSelectCampaign={(id) => setSelectedCampaignId(id)}
      />

      {/* Territory modal popup */}
      {territoryForModal && (
        <TerritoryPanel
          territory={territoryForModal}
          onClose={() => usePanelStore.getState().closeTerritoryModal()}
          onClickRuler={(charId) => {
            usePanelStore.getState().closeTerritoryModal();
            usePanelStore.getState().pushCharacter(charId);
          }}
        />
      )}

      {/* Campaign popup */}
      {selectedCampaignId && (
        <CampaignPopup
          campaignId={selectedCampaignId}
          onClose={() => setSelectedCampaignId(null)}
        />
      )}
    </div>
  );
};

export default MapPlaceholder;
