import React, { useState } from 'react';
import type { Territory } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getActualController } from '@engine/official/officialUtils';
import { usePanelStore } from '@ui/stores/panelStore';
import BuildMenu from './BuildMenu';
import TreasuryTransferModal from './TreasuryTransferModal';
import { TerritoryHeader } from './TerritoryHeader';
import { TerritoryChildList } from './TerritoryChildList';
import { TerritoryInfoSections } from './TerritoryInfoSections';

interface TerritoryPanelProps {
  territory: Territory;
  onClose: () => void;
  onClickRuler?: (characterId: string) => void;
}

const TerritoryPanel: React.FC<TerritoryPanelProps> = ({ territory, onClose, onClickRuler }) => {
  const controllerId = getActualController(territory);
  const ruler = useCharacterStore((s) => controllerId ? s.characters.get(controllerId) : undefined);
  const playerId = useCharacterStore((s) => s.playerId);
  const isPlayerTerritory = controllerId === playerId;

  const [buildSlotIndex, setBuildSlotIndex] = useState<number | null>(null);
  const [transferResource, setTransferResource] = useState<'money' | 'grain' | null>(null);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex flex-col rounded-lg p-5 max-w-md w-full mx-4 shadow-xl"
        style={{
          background: 'var(--color-bg-panel)',
          border: '1px solid var(--color-border)',
          maxHeight: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <TerritoryHeader
          territory={territory}
          ruler={ruler}
          onClose={onClose}
          onClickRuler={onClickRuler}
        />

        {territory.tier !== 'zhou' ? (
          <TerritoryChildList
            territory={territory}
            onClickRuler={onClickRuler}
            onClickTerritory={(id) => usePanelStore.getState().openTerritoryModal(id)}
          />
        ) : (
          <TerritoryInfoSections
            territory={territory}
            isPlayerTerritory={isPlayerTerritory}
            onOpenBuildMenu={setBuildSlotIndex}
            onOpenTransfer={setTransferResource}
          />
        )}
      </div>

      {/* Modals — stopPropagation prevents closing parent panel */}
      {buildSlotIndex !== null && (
        <div onClick={(e) => e.stopPropagation()}>
          <BuildMenu
            territory={territory}
            slotIndex={buildSlotIndex}
            onClose={() => setBuildSlotIndex(null)}
          />
        </div>
      )}
      {transferResource && playerId && (
        <div onClick={(e) => e.stopPropagation()}>
          <TreasuryTransferModal
            charId={playerId}
            lockedFromId={territory.id}
            lockedResource={transferResource}
            onClose={() => setTransferResource(null)}
          />
        </div>
      )}
    </div>
  );
};

export default TerritoryPanel;
