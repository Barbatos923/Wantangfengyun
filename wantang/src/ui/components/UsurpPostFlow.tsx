import { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getUsurpablePosts, previewUsurp, executeUsurp } from '@engine/interaction';
import type { Post } from '@engine/territory/types';
import { formatAmount } from '@ui/utils/formatAmount';
import { getCapitalBalance } from '@engine/territory/treasuryUtils';

interface UsurpPostFlowProps {
  targetId: string;
  onClose: () => void;
}

export default function UsurpPostFlow({ targetId, onClose }: UsurpPostFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));

  const [selected, setSelected] = useState<Post | null>(null);
  const [executed, setExecuted] = useState<'success' | 'stale' | null>(null);

  if (!player || !target || !playerId) return null;

  const usurpable = getUsurpablePosts(player, target);
  if (usurpable.length === 0) return null;

  const previews = previewUsurp(playerId, targetId);
  const isSingle = usurpable.length === 1;
  const activePost = selected ?? (isSingle ? usurpable[0] : null);
  const activePreview = activePost ? previews.find(p => p.post.id === activePost.id) : null;

  function handleUsurp(post: Post) {
    const ok = executeUsurp(post.id, player!.id);
    setExecuted(ok ? 'success' : 'stale');
  }

  if (executed !== null) {
    return (
      <Modal size="sm" onOverlayClick={onClose}>
        <ModalHeader title={executed === 'stale' ? '操作未生效' : '篡夺结果'} onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          {executed === 'success' ? (
            <p className="text-sm text-[var(--color-success, #22c55e)]">
              篡夺成功！{activePreview?.territoryName}{activePreview?.postName}已归于你手。
            </p>
          ) : (
            <p className="text-sm text-[var(--color-accent-red)]">
              局势已发生变化，篡夺未生效。
            </p>
          )}
          <Button variant="default" className="w-full py-2 font-bold" onClick={onClose}>
            关闭
          </Button>
        </div>
      </Modal>
    );
  }

  const capitalMoney = getCapitalBalance(playerId).money;
  const canAffordActive = activePreview ? capitalMoney >= activePreview.cost.money && (player?.resources.prestige ?? 0) >= activePreview.cost.prestige : false;

  function renderPreview() {
    if (!activePreview) return null;
    const moneyShort = capitalMoney < activePreview.cost.money;
    return (
      <div className="space-y-2">
        <div className="text-sm text-[var(--color-text)]">
          {activePreview.territoryName} {activePreview.postName}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <span>控制比例：</span>
          <span className="font-bold text-[var(--color-text)]">{Math.round(activePreview.controlRatio * 100)}%</span>
        </div>
        <div className="flex gap-3 text-xs">
          {activePreview.cost.money > 0 && (
            <span className={moneyShort ? 'text-[var(--color-accent-red,#e74c3c)]' : 'text-[var(--color-accent-gold)]'}>
              金钱 -{formatAmount(activePreview.cost.money)}（治所国库 {formatAmount(capitalMoney)}）
            </span>
          )}
          {activePreview.cost.prestige > 0 && (
            <span className="text-[var(--color-text)]">名望 -{activePreview.cost.prestige}</span>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {target!.name}将对你产生"篡夺者"好感 -40。
        </p>
        <p className="text-xs text-[var(--color-accent-green,#22c55e)]">
          篡夺后正统性将提升至与岗位匹配的水平（受品位上限约束）。
        </p>
      </div>
    );
  }

  return (
    <Modal size="sm" onOverlayClick={onClose}>
      <ModalHeader title={`篡夺 ${target.name} 的头衔`} onClose={onClose} />
      <div className="px-5 py-4 flex flex-col gap-3">
        {isSingle ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">确认篡夺以下头衔？</p>
            {renderPreview()}
            <Button variant="danger" className="mt-2 w-full py-2 font-bold" disabled={!canAffordActive} onClick={() => handleUsurp(usurpable[0])}>
              {canAffordActive ? '确认篡夺' : '资源不足'}
            </Button>
          </>
        ) : selected === null ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">请选择要篡夺的头衔：</p>
            {previews.map((preview) => (
              <div
                key={preview.post.id}
                className="flex items-center justify-between rounded px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)]"
              >
                <div>
                  <span className="text-sm text-[var(--color-text)]">{preview.territoryName} {preview.postName}</span>
                  <span className="text-xs text-[var(--color-text-muted)] ml-2">
                    控制 {Math.round(preview.controlRatio * 100)}%
                  </span>
                </div>
                <Button variant="danger" size="sm" className="ml-3 shrink-0" onClick={() => setSelected(preview.post)}>
                  选择
                </Button>
              </div>
            ))}
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">确认篡夺以下头衔？</p>
            {renderPreview()}
            <div className="flex gap-2 mt-2">
              <Button variant="default" className="flex-1 py-2 font-bold" onClick={() => setSelected(null)}>返回</Button>
              <Button variant="danger" className="flex-1 py-2 font-bold" disabled={!canAffordActive} onClick={() => handleUsurp(selected)}>{canAffordActive ? '确认篡夺' : '资源不足'}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
