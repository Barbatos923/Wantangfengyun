import React from 'react';
import type { Character } from '@engine/character/types';
import { getOpinionBreakdown, calculateBaseOpinion } from '@engine/character/characterUtils';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';

interface OpinionPopupProps {
  from: Character;    // who holds the opinion
  toward: Character;  // who the opinion is about
  onClose: () => void;
}

const OpinionPopup: React.FC<OpinionPopupProps> = ({ from, toward, onClose }) => {
  const expectedLeg = useTerritoryStore(s => s.expectedLegitimacy.get(toward.id) ?? null);
  const entries = getOpinionBreakdown(from, toward, expectedLeg);
  const total = calculateBaseOpinion(from, toward, expectedLeg);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-4 max-w-xs w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--color-text)]">
            {from.name} → {toward.name}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Breakdown list */}
        <div className="space-y-1 mb-3">
          {entries.length === 0 && (
            <div className="text-xs text-[var(--color-text-muted)] text-center py-2">无特殊好感修正</div>
          )}
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">{entry.label}</span>
              <span className={`font-bold ${entry.value >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
                {entry.value >= 0 ? '+' : ''}{entry.value}
              </span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
          <span className="text-xs font-bold text-[var(--color-text)]">总计</span>
          <span className={`text-sm font-bold ${total >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
            {total >= 0 ? '+' : ''}{total}
          </span>
        </div>
      </div>
    </div>
  );
};

export default OpinionPopup;
