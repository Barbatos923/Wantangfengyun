import { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getRevokablePosts, previewRevokeChance, executeRevoke } from '@engine/interaction';
import { positionMap } from '@data/positions';
import type { Post } from '@engine/territory/types';

interface RevokeFlowProps {
  targetId: string;
  onClose: () => void;
}

export default function RevokeFlow({ targetId, onClose }: RevokeFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const territories = useTerritoryStore((s) => s.territories);

  const [selected, setSelected] = useState<Post | null>(null);
  const [result, setResult] = useState<'success' | 'rebel' | 'stale' | null>(null);

  if (!player || !target) return null;

  const revokable = getRevokablePosts(player, target);
  if (revokable.length === 0) return null;

  const isSingle = revokable.length === 1;
  const activePost = selected ?? (isSingle ? revokable[0] : null);
  const chance = activePost && playerId ? previewRevokeChance(playerId, targetId) : null;

  function handleRevoke(post: Post) {
    const r = executeRevoke(post.id, player!.id);
    setResult(r);
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

  function renderChance() {
    if (chance === null) return null;
    const color = chance >= 70 ? 'var(--color-success, #22c55e)'
      : chance >= 40 ? 'var(--color-warning, #eab308)'
      : 'var(--color-danger, #ef4444)';
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--color-text-muted)]">成功率：</span>
        <span className="font-bold" style={{ color }}>{chance}%</span>
      </div>
    );
  }

  // 结果展示
  if (result !== null) {
    return (
      <Modal size="sm" onOverlayClick={onClose}>
        <ModalHeader title={result === 'stale' ? '操作未生效' : '剥夺结果'} onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          {result === 'success' ? (
            <p className="text-sm text-[var(--color-success, #22c55e)]">
              剥夺成功！{target.name} 的领地已收归麾下。
            </p>
          ) : result === 'rebel' ? (
            <p className="text-sm text-[var(--color-danger, #ef4444)]">
              剥夺失败！{target.name} 不服从命令，发动了独立战争！
            </p>
          ) : (
            <p className="text-sm text-[var(--color-danger, #ef4444)]">
              局势已发生变化，剥夺未生效。
            </p>
          )}
          <Button variant="default" className="w-full py-2 font-bold" onClick={onClose}>
            关闭
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal size="sm" onOverlayClick={onClose}>
      <ModalHeader title={`剥夺 ${target.name} 的领地`} onClose={onClose} />
      <div className="px-5 py-4 flex flex-col gap-3">
        {isSingle ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">确认剥夺以下领地？</p>
            {renderPostLabel(revokable[0])}
            {renderChance()}
            <p className="text-xs text-[var(--color-text-muted)]">
              失败时，{target.name} 将发动独立战争。
            </p>
            <Button variant="danger" className="mt-2 w-full py-2 font-bold" onClick={() => handleRevoke(revokable[0])}>
              确认剥夺
            </Button>
          </>
        ) : selected === null ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">请选择要剥夺的领地：</p>
            {revokable.map((post) => (
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
            <p className="text-sm text-[var(--color-text-muted)]">确认剥夺以下领地？</p>
            {renderPostLabel(selected)}
            {renderChance()}
            <p className="text-xs text-[var(--color-text-muted)]">
              失败时，{target.name} 将发动独立战争。
            </p>
            <div className="flex gap-2 mt-2">
              <Button variant="default" className="flex-1 py-2 font-bold" onClick={() => setSelected(null)}>返回</Button>
              <Button variant="danger" className="flex-1 py-2 font-bold" onClick={() => handleRevoke(selected)}>确认剥夺</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
