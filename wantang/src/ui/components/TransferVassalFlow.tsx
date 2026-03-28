// ===== 转移臣属 Flow =====

import { useCharacterStore } from '@engine/character/CharacterStore';
import { getTransferCandidates, executeTransferVassal } from '@engine/interaction';

interface TransferVassalFlowProps {
  targetId: string;   // 接收方（如节度使 A）
  onClose: () => void;
}

export default function TransferVassalFlow({ targetId, onClose }: TransferVassalFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const target = useCharacterStore((s) => s.characters.get(targetId));

  if (!playerId || !target) return null;

  const candidates = getTransferCandidates(playerId, targetId);
  if (candidates.length === 0) return null;

  function handleTransfer(vassalId: string) {
    executeTransferVassal(vassalId, targetId, playerId!);
    onClose();
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
            转移臣属给 {target.name}
          </span>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-[var(--color-text-muted)] mb-1">选择要转移的臣属：</p>
          {candidates.map((c) => (
            <div
              key={`${c.character.id}-${c.post.id}`}
              className="flex items-center justify-between rounded px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)]"
            >
              <div className="min-w-0">
                <span className="text-sm font-bold text-[var(--color-text)]">{c.character.name}</span>
                <span className="text-xs text-[var(--color-text-muted)] ml-2">
                  {c.territoryName}{c.positionName}
                </span>
              </div>
              <button
                className="ml-3 rounded px-3 py-1 text-sm font-bold bg-[var(--color-accent-gold)] text-[var(--color-bg)] hover:opacity-80 shrink-0"
                onClick={() => handleTransfer(c.character.id)}
              >
                转移
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
