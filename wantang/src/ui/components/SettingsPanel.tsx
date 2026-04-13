import React from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useUiSettingsStore } from '@ui/stores/uiSettingsStore';

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const uiScale = useUiSettingsStore((s) => s.uiScale);
  const manualScale = useUiSettingsStore((s) => s.manualScale);
  const setUiScale = useUiSettingsStore((s) => s.setUiScale);
  const resetToAuto = useUiSettingsStore((s) => s.resetToAuto);

  const pct = Math.round(uiScale * 100);

  return (
    <Modal size="sm" zIndex={70} onOverlayClick={onClose}>
      <ModalHeader title="设置" onClose={onClose} />
      <div className="px-5 py-5 space-y-5">
        {/* UI 缩放 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[var(--color-text)]">界面缩放</span>
            <span className="text-sm text-[var(--color-accent-gold)] font-bold">{pct}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={150}
            step={5}
            value={pct}
            onChange={(e) => setUiScale(Number(e.target.value) / 100)}
            className="w-full accent-[var(--color-accent-gold)]"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-[var(--color-text-muted)]">50%</span>
            <span className="text-xs text-[var(--color-text-muted)]">150%</span>
          </div>
          {manualScale && (
            <button
              onClick={resetToAuto}
              className="mt-2 text-xs text-[var(--color-accent-gold)] hover:underline"
            >
              重置为自动适配
            </button>
          )}
        </div>

        <div className="border-t border-[var(--color-border)]" />
        <Button variant="ghost" onClick={onClose}>返回</Button>
      </div>
    </Modal>
  );
};

export default SettingsPanel;
