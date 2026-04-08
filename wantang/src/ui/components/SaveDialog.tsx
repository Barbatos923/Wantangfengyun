// ===== 创建命名存档对话框 =====
//
// 玩家输入存档名（默认值 = 玩家名+游戏年月），点确认创建一个新槽位。

import React, { useState } from 'react';
import { Modal } from './base/Modal';
import { ModalHeader } from './base/ModalHeader';
import { Button } from './base/Button';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import { createNamedSave } from '@engine/persistence/saveManager';
import { useSaveStatusStore } from '@ui/stores/saveStatusStore';

interface SaveDialogProps {
  onClose: () => void;
  onSaved: () => void;
}

const SaveDialog: React.FC<SaveDialogProps> = ({ onClose, onSaved }) => {
  const player = useCharacterStore((s) => (s.playerId ? s.characters.get(s.playerId) : undefined));
  const date = useTurnManager((s) => s.currentDate);
  const defaultName = `${player?.name ?? '存档'} ${date.year}年${date.month}月`;
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await createNamedSave(name);
      onSaved();
    } catch (e) {
      useSaveStatusStore.getState().setError(`存档失败：${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  };

  return (
    <Modal size="sm" zIndex={70} onOverlayClick={onClose}>
      <ModalHeader title="创建存档" onClose={onClose} />
      <div className="px-5 py-5 flex flex-col gap-4">
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">存档名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            autoFocus
            className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-text)] text-sm focus:border-[var(--color-accent-gold)] focus:outline-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default SaveDialog;
