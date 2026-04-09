import { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getDismissablePosts, executeDismiss } from '@engine/interaction';
import { positionMap } from '@data/positions';
import type { Post } from '@engine/territory/types';

interface DismissFlowProps {
  targetId: string;
  onClose: () => void;
}

export default function DismissFlow({ targetId, onClose }: DismissFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const territories = useTerritoryStore((s) => s.territories);

  const [selected, setSelected] = useState<Post | null>(null);

  if (!player || !target) return null;

  const dismissable = getDismissablePosts(player, target);
  if (dismissable.length === 0) return null;

  const isSingle = dismissable.length === 1;

  function handleDismiss(post: Post) {
    const ok = executeDismiss(post.id, player!.id);
    if (!ok) {
      // eslint-disable-next-line no-alert
      alert('局势已发生变化，罢免未生效。');
      return;
    }
    onClose();
  }

  function renderPostLabel(post: Post) {
    const posName = positionMap.get(post.templateId)?.name ?? post.templateId;
    const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
    return (
      <span className="text-sm text-[var(--color-text)]">
        {terrName ? `${terrName}${posName}` : posName}
      </span>
    );
  }

  return (
    <Modal size="sm" onOverlayClick={onClose}>
      <ModalHeader title={`罢免 ${target.name} 的职位`} onClose={onClose} />
      <div className="px-5 py-4 flex flex-col gap-3">
        {isSingle ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">确认罢免以下职位？</p>
            {renderPostLabel(dismissable[0])}
            <Button variant="danger" className="mt-2 w-full py-2 font-bold" onClick={() => handleDismiss(dismissable[0])}>
              确认罢免
            </Button>
          </>
        ) : selected === null ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">请选择要罢免的职位：</p>
            {dismissable.map((post) => (
              <div
                key={post.id}
                className="flex items-center justify-between rounded px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)]"
              >
                {renderPostLabel(post)}
                <Button variant="danger" size="sm" className="ml-3 shrink-0" onClick={() => setSelected(post)}>
                  选择
                </Button>
              </div>
            ))}
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">确认罢免以下职位？</p>
            {renderPostLabel(selected)}
            <div className="flex gap-2 mt-2">
              <Button variant="default" className="flex-1 py-2 font-bold" onClick={() => setSelected(null)}>返回</Button>
              <Button variant="danger" className="flex-1 py-2 font-bold" onClick={() => handleDismiss(selected)}>确认罢免</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
