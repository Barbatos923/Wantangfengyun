// ===== 转移臣属 Flow =====

import { Modal, ModalHeader, Button } from './base';
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
    <Modal size="sm" onOverlayClick={onClose}>
      <ModalHeader title={`转移臣属给 ${target.name}`} onClose={onClose} />
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
            <Button
              variant="primary"
              size="sm"
              className="ml-3 shrink-0 font-bold"
              onClick={() => handleTransfer(c.character.id)}
            >
              转移
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
