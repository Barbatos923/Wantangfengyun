// ===== 读取存档对话框 =====
//
// 列出所有命名存档（按时间倒序），玩家点行 → 读取；附带删除按钮。

import React, { useEffect, useState } from 'react';
import { Modal } from './base/Modal';
import { ModalHeader } from './base/ModalHeader';
import { Button } from './base/Button';
import {
  listNamedSaves,
  loadNamedSave,
  deleteNamedSave,
} from '@engine/persistence/saveManager';
import { useSaveStatusStore } from '@ui/stores/saveStatusStore';
import type { SaveListEntry } from '@engine/storage';

interface LoadDialogProps {
  onClose: () => void;
  onLoaded: () => void;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const LoadDialog: React.FC<LoadDialogProps> = ({ onClose, onLoaded }) => {
  const [saves, setSaves] = useState<SaveListEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const list = await listNamedSaves();
      setSaves(list);
    } catch (e) {
      useSaveStatusStore.getState().setError(`读取存档列表失败：${e instanceof Error ? e.message : String(e)}`);
      setSaves([]);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleLoad = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await loadNamedSave(id);
      onLoaded();
    } catch (e) {
      useSaveStatusStore.getState().setError(`读档失败：${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (busy) return;
    if (!window.confirm(`确定删除存档「${name}」？`)) return;
    setBusy(true);
    try {
      await deleteNamedSave(id);
      await refresh();
    } catch (e) {
      useSaveStatusStore.getState().setError(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal size="lg" zIndex={70} onOverlayClick={onClose}>
      <ModalHeader title="读取存档" onClose={onClose} />
      <div className="px-5 py-4 flex-1 overflow-y-auto">
        {saves === null ? (
          <div className="text-center text-[var(--color-text-muted)] py-8">加载中…</div>
        ) : saves.length === 0 ? (
          <div className="text-center text-[var(--color-text-muted)] py-8">尚无存档</div>
        ) : (
          <div className="flex flex-col gap-2">
            {saves.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-3 py-2 border border-[var(--color-border)] rounded hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--color-text)] font-medium truncate">
                    {s.displayName || '(未命名)'}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {s.gameYear}年{s.gameMonth}月{s.gameDay}日 · {s.playerName}
                    <span className="mx-2">·</span>
                    保存于 {formatTimestamp(s.timestamp)}
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleLoad(s.id)}
                  disabled={busy}
                >
                  读取
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(s.id, s.displayName || '(未命名)')}
                  disabled={busy}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-[var(--color-border)] flex justify-end shrink-0">
        <Button variant="ghost" onClick={onClose}>关闭</Button>
      </div>
    </Modal>
  );
};

export default LoadDialog;
