import React from 'react';
import GameMap from './GameMap';
import TerritoryPanel from './TerritoryPanel';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { usePanelStore } from '@ui/stores/panelStore';

const MapPlaceholder: React.FC = () => {
  const territories = useTerritoryStore((s) => s.territories);
  const currentCharacterId = usePanelStore((s) => s.stack[s.stack.length - 1]);
  const territoryModalId = usePanelStore((s) => s.territoryModalId);
  const territoryForModal = territoryModalId ? territories.get(territoryModalId) : undefined;

  const handleSelectTerritory = (id: string) => {
    const t = territories.get(id);
    if (!t?.actualControllerId) return;

    // If the ruler is already shown in the left panel, open territory modal
    if (currentCharacterId === t.actualControllerId) {
      usePanelStore.getState().openTerritoryModal(id);
    } else {
      // First click: show ruler in left panel
      usePanelStore.getState().pushCharacter(t.actualControllerId);
    }
  };

  return (
    <div className="flex-1 overflow-hidden relative">
      <GameMap onSelectTerritory={handleSelectTerritory} />

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
    </div>
  );
};

export default MapPlaceholder;
