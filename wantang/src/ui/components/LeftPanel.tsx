// ===== 左侧面板容器（纯角色面板） =====

import React from 'react';
import { usePanelCurrent } from '@ui/stores/panelStore';
import CharacterPanel from './CharacterPanel';

const LeftPanel: React.FC = () => {
  const characterId = usePanelCurrent();
  if (!characterId) return null;

  return (
    <div className="w-[360px] shrink-0 h-full bg-[var(--color-bg-panel)] border-r border-[var(--color-border)] flex flex-col overflow-hidden">
      <CharacterPanel key={characterId} characterId={characterId} />
    </div>
  );
};

export default LeftPanel;
