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

  const entries =
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

        {entries.length > 0 ? (
          <div className="flex flex-col gap-1">
            {entries.map(({ interaction, disabledReason }) => (
              <button
                key={interaction.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left w-full transition-colors ${
                  disabledReason
                    ? 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-accent-gold)]'
                }`}
                onClick={() => !disabledReason && onSelect(interaction.id)}
                title={disabledReason ?? undefined}
              >
                <span className="text-base leading-none">{interaction.icon}</span>
                <span className="flex-1">{interaction.name}</span>
                {disabledReason && (
                  <span className="text-[10px] text-[var(--color-text-muted)] ml-1 max-w-[120px] text-right leading-tight">
                    {disabledReason}
                  </span>
                )}
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
