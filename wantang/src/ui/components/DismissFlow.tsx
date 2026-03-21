import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getDismissablePositions, executeDismiss } from '@engine/interaction';
import { positionMap } from '@data/positions';

interface DismissFlowProps {
  targetId: string;
  onClose: () => void;
}

export default function DismissFlow({ targetId, onClose }: DismissFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const territories = useTerritoryStore((s) => s.territories);

  const [selected, setSelected] = useState<{ positionId: string; territoryId?: string } | null>(null);

  if (!player || !target) return null;

  const dismissable = getDismissablePositions(player, target);
  if (dismissable.length === 0) return null;

  const isSingle = dismissable.length === 1;

  function handleDismiss(entry: { positionId: string; territoryId?: string }) {
    executeDismiss(player!.id, targetId, entry.positionId, entry.territoryId);
    onClose();
  }

  function renderPositionLabel(entry: { positionId: string; territoryId?: string }) {
    const posName = positionMap.get(entry.positionId)?.name ?? entry.positionId;
    const terrName = entry.territoryId ? territories.get(entry.territoryId)?.name : undefined;
    return (
      <span className="text-sm text-[var(--color-text)]">
        {posName}
        {terrName && <span className="text-[var(--color-text-muted)] ml-1">· {terrName}</span>}
      </span>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-sm mx-4 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-[var(--color-border)]">
          <span className="font-bold text-base text-[var(--color-accent-gold)]">
            罢免 {target.name} 的职位
          </span>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {isSingle ? (
            <>
              <p className="text-sm text-[var(--color-text-muted)]">确认罢免以下职位？</p>
              {renderPositionLabel(dismissable[0])}
              <button
                className="mt-2 rounded px-4 py-2 font-bold text-sm bg-[var(--color-accent-red)] text-white hover:opacity-90"
                onClick={() => handleDismiss(dismissable[0])}
              >
                确认罢免
              </button>
            </>
          ) : selected === null ? (
            <>
              <p className="text-sm text-[var(--color-text-muted)]">请选择要罢免的职位：</p>
              {dismissable.map((entry) => (
                <div
                  key={entry.positionId + (entry.territoryId ?? '')}
                  className="flex items-center justify-between rounded px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)]"
                >
                  {renderPositionLabel(entry)}
                  <button
                    className="ml-3 rounded px-3 py-1 text-sm font-bold bg-[var(--color-accent-red)] text-white hover:opacity-90 shrink-0"
                    onClick={() => setSelected(entry)}
                  >
                    选择
                  </button>
                </div>
              ))}
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-muted)]">确认罢免以下职位？</p>
              {renderPositionLabel(selected)}
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 rounded px-4 py-2 text-sm font-bold border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  onClick={() => setSelected(null)}
                >
                  返回
                </button>
                <button
                  className="flex-1 rounded px-4 py-2 text-sm font-bold bg-[var(--color-accent-red)] text-white hover:opacity-90"
                  onClick={() => handleDismiss(selected)}
                >
                  确认罢免
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
