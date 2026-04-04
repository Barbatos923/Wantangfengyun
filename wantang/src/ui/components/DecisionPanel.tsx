import { useState, useMemo } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getAllDecisions } from '@engine/decision';
import type { Decision } from '@engine/decision';
import DecisionDetailModal from './DecisionDetailModal';

interface DecisionPanelProps {
  onClose: () => void;
}

interface DecisionEntry {
  decision: Decision;
  visible: boolean;
  executable: boolean;
}

export default function DecisionPanel({ onClose }: DecisionPanelProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const territories = useTerritoryStore((s) => s.territories);
  const characters = useCharacterStore((s) => s.characters);
  const [activeDecision, setActiveDecision] = useState<Decision | null>(null);

  // 缓存决议状态：仅在 territories/characters 变化时重算
  const entries = useMemo<DecisionEntry[]>(() => {
    if (!playerId) return [];
    return getAllDecisions().map(d => ({
      decision: d,
      visible: d.canShow(playerId),
      executable: d.canExecute(playerId).executable,
    }));
  }, [playerId, territories, characters]);

  if (!playerId) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-30 flex justify-end"
        onClick={onClose}
      >
        <div
          className="bg-[var(--color-bg-panel)] border-l border-[var(--color-border)] w-80 h-full shadow-xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="section-divider px-4 py-3 flex items-center justify-between shrink-0">
            <h2 className="text-base font-bold text-[var(--color-accent-gold)]">决议</h2>
            <button
              onClick={onClose}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none transition-colors"
            >
              ×
            </button>
          </div>

          {/* Decision List */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {entries.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">暂无可用决议</p>
            )}
            {entries.map(({ decision: d, visible, executable }) => {
              if (!visible && !executable) return null;

              return (
                <button
                  key={d.id}
                  onClick={() => setActiveDecision(d)}
                  className={`w-full text-left rounded border px-3 py-3 transition-colors ${
                    executable
                      ? 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{d.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold ${executable ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>
                        {d.name}
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                        {d.description}
                      </div>
                    </div>
                    {executable && (
                      <span className="text-xs text-[var(--color-accent-gold)]">!</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeDecision && (
        <DecisionDetailModal
          decision={activeDecision}
          onClose={() => setActiveDecision(null)}
          onExecuted={() => {
            setActiveDecision(null);
          }}
        />
      )}
    </>
  );
}
