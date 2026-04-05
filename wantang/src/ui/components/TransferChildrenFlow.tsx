// ===== 法理下级可选转移弹窗 =====
//
// 任命 grantsControl 岗位后，如存在可转移的法理直接下级，
// 弹窗让玩家勾选要转给新任者的下级。

import { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import type { TransferableChild } from '@engine/official/postTransfer';
import { transferChildren } from '@engine/official/postTransfer';
import { positionMap } from '@data/positions';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';

interface TransferChildrenFlowProps {
  /** 新任者 ID */
  newHolderId: string;
  /** 任命者 ID（用于好感计算） */
  appointerId: string;
  /** 可转移的法理下级列表 */
  children: TransferableChild[];
  /** 关闭回调 */
  onClose: () => void;
}

export default function TransferChildrenFlow({
  newHolderId,
  appointerId,
  children,
  onClose,
}: TransferChildrenFlowProps) {
  const characters = useCharacterStore(s => s.characters);
  const territories = useTerritoryStore(s => s.territories);
  const newHolder = characters.get(newHolderId);

  // 默认全部勾选
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(children.map(c => c.charId)),
  );

  function toggle(charId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  }

  function handleConfirm() {
    const ids = [...selected];
    if (ids.length > 0) {
      transferChildren(ids, newHolderId, appointerId);
    }
    onClose();
  }

  return (
    <Modal size="md" onOverlayClick={onClose}>
      <ModalHeader
        title={`转移法理下级给 ${newHolder?.name ?? '新任者'}`}
        onClose={onClose}
      />
      <div className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
        以下法理下级可转给新任者效忠，取消勾选则保留原效忠关系。
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-2 flex flex-col gap-1.5">
        {children.map(child => {
          const char = characters.get(child.charId);
          const terr = territories.get(child.territoryId);
          const post = useTerritoryStore.getState().findPost(child.postId);
          const tplName = post ? positionMap.get(post.templateId)?.name : undefined;
          const currentOverlord = char?.overlordId ? characters.get(char.overlordId) : undefined;

          return (
            <label
              key={child.charId}
              className="flex items-center gap-3 px-3 py-2 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)]/60 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(child.charId)}
                onChange={() => toggle(child.charId)}
                className="accent-[var(--color-accent-gold)] w-4 h-4 shrink-0"
              />
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--color-text)]">
                    {child.charName}
                  </span>
                  {tplName && (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {terr?.name}{tplName}
                    </span>
                  )}
                </div>
                {currentOverlord && (
                  <span className="text-xs text-[var(--color-text-muted)]">
                    当前效忠: {currentOverlord.name}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
      <div className="px-4 py-3 border-t border-[var(--color-border)] flex gap-2">
        <Button variant="ghost" onClick={onClose} className="flex-1">
          跳过
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          className="flex-1"
        >
          转移{selected.size > 0 ? `（${selected.size}）` : ''}
        </Button>
      </div>
    </Modal>
  );
}
