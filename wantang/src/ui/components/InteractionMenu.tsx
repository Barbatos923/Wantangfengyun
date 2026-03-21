import React from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getAvailableInteractions } from '@engine/interaction';

interface InteractionMenuProps {
  targetId: string;
  onClose: () => void;
  onSelect: (interactionId: string) => void;
}

const InteractionMenu: React.FC<InteractionMenuProps> = ({ targetId, onClose, onSelect }) => {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));

  const interactions =
    player && target ? getAvailableInteractions(player, target) : [];

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg shadow-xl p-3 min-w-[200px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs text-[var(--color-text-muted)] mb-2">
          对 {target?.name ?? targetId} 的交互
        </div>

        {interactions.length > 0 ? (
          <div className="flex flex-col gap-1">
            {interactions.map((interaction) => (
              <button
                key={interaction.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-accent-gold)] transition-colors text-left w-full"
                onClick={() => onSelect(interaction.id)}
              >
                <span className="text-base leading-none">{interaction.icon}</span>
                <span>{interaction.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-[var(--color-text-muted)] text-center py-2">
            无可用交互
          </div>
        )}
      </div>
    </div>
  );
};

export default InteractionMenu;
