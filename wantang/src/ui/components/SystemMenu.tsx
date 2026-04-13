// ===== 系统菜单（ESC / 右上角 ⚙ 触发） =====
//
// CK3 风格的系统菜单：存档 / 读取存档 / 导出 / 导入 / 新游戏 / 关闭。
// 内部三种子模态：SaveDialog（创建命名存档） / LoadDialog（读取/删除）/ 文件导入隐藏 input。

import React, { useRef, useState } from 'react';
import { Modal } from './base/Modal';
import { ModalHeader } from './base/ModalHeader';
import { Button } from './base/Button';
import SaveDialog from './SaveDialog';
import LoadDialog from './LoadDialog';
import CharacterSwitcher from './CharacterSwitcher';
import SettingsPanel from './SettingsPanel';
import {
  exportToFile,
  importFromFile,
  newGame,
} from '@engine/persistence/saveManager';
import { useSaveStatusStore } from '@ui/stores/saveStatusStore';

interface SystemMenuProps {
  onClose: () => void;
}

const SystemMenu: React.FC<SystemMenuProps> = ({ onClose }) => {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    try {
      exportToFile();
    } catch (e) {
      useSaveStatusStore.getState().setError(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importFromFile(file);
      onClose();
    } catch (err) {
      useSaveStatusStore.getState().setError(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleNewGame = async () => {
    if (!window.confirm('确定丢弃当前进度，开始新游戏？此操作不可撤销。')) return;
    try {
      await newGame();
      onClose();
    } catch (e) {
      useSaveStatusStore.getState().setError(`新游戏失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <>
      <Modal size="sm" zIndex={60} onOverlayClick={onClose}>
        <ModalHeader title="系统菜单" onClose={onClose} />
        <div className="px-5 py-5 flex flex-col gap-3">
          <Button variant="primary" onClick={() => setShowSaveDialog(true)}>
            💾 存档
          </Button>
          <Button variant="primary" onClick={() => setShowLoadDialog(true)}>
            📂 读取存档
          </Button>
          <div className="border-t border-[var(--color-border)] my-1" />
          <Button onClick={handleExport}>📤 导出为文件</Button>
          <Button onClick={() => importInputRef.current?.click()}>📥 从文件导入</Button>
          <div className="border-t border-[var(--color-border)] my-1" />
          <Button onClick={() => setShowSwitcher(true)}>
            🔄 切换角色
          </Button>
          <Button onClick={() => setShowSettings(true)}>
            ⚙ 设置
          </Button>
          <div className="border-t border-[var(--color-border)] my-1" />
          <Button variant="danger" onClick={handleNewGame}>
            🆕 新游戏
          </Button>
          <Button variant="ghost" onClick={onClose}>
            返回游戏
          </Button>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          className="hidden"
        />
      </Modal>

      {showSaveDialog && (
        <SaveDialog
          onClose={() => setShowSaveDialog(false)}
          onSaved={() => {
            setShowSaveDialog(false);
            onClose();
          }}
        />
      )}

      {showLoadDialog && (
        <LoadDialog
          onClose={() => setShowLoadDialog(false)}
          onLoaded={() => {
            setShowLoadDialog(false);
            onClose();
          }}
        />
      )}

      {showSwitcher && (
        <CharacterSwitcher
          onClose={() => setShowSwitcher(false)}
          onSwitched={() => {
            setShowSwitcher(false);
            onClose();
          }}
        />
      )}

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </>
  );
};

export default SystemMenu;
