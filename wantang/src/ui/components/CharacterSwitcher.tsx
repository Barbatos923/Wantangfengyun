import React from 'react';
import { Modal } from './base/Modal';
import { ModalHeader } from './base/ModalHeader';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getDynamicTitle, calculateMonthlyLedger } from '@engine/official/officialUtils';
import { useLedgerStore } from '@engine/official/LedgerStore';

interface CharacterSwitcherProps {
  onClose: () => void;
  onSwitched: () => void;
}

const CharacterSwitcher: React.FC<CharacterSwitcherProps> = ({ onClose, onSwitched }) => {
  const characters = useCharacterStore((s) => s.characters);
  const playerId = useCharacterStore((s) => s.playerId);
  const territories = useTerritoryStore((s) => s.territories);

  const switchable = Array.from(characters.values()).filter(
    (c) => c.alive && c.id !== playerId
  );

  function switchPlayer(newId: string) {
    const charStore = useCharacterStore.getState();
    const oldId = charStore.playerId;

    if (oldId) {
      charStore.updateCharacter(oldId, { isPlayer: false });
    }
    charStore.updateCharacter(newId, { isPlayer: true });
    charStore.setPlayerId(newId);

    const newPlayer = charStore.getCharacter(newId);
    if (newPlayer) {
      const territories = useTerritoryStore.getState().territories;
      const characters = charStore.characters;
      const ledger = calculateMonthlyLedger(newPlayer, territories, characters);
      useLedgerStore.getState().updatePlayerLedger(ledger);
    }

    onSwitched();
  }

  return (
    <Modal size="sm" zIndex={65} onOverlayClick={onClose}>
      <ModalHeader title="切换扮演角色" onClose={onClose} />
      <div className="px-3 py-2 max-h-80 overflow-y-auto">
        {switchable.map((c) => (
          <button
            key={c.id}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded transition-colors hover:bg-[var(--color-bg-surface)] text-left"
            onClick={() => switchPlayer(c.id)}
          >
            <div
              className="w-9 h-9 flex items-center justify-center text-sm font-bold shrink-0"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid rgba(184,154,83,0.5)',
                color: 'var(--color-accent-gold)',
              }}
            >
              {c.name[0]}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm text-[var(--color-text)] font-bold truncate">{c.name}</span>
              <span className="text-xs text-[var(--color-text-muted)] truncate">{getDynamicTitle(c, territories)}</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
};

export default CharacterSwitcher;
