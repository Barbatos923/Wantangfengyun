// ===== 左侧面板容器（纯角色面板） =====

import React from 'react';
import { usePanelCurrent } from '@ui/stores/panelStore';
import CharacterPanel from './CharacterPanel';

const LeftPanel: React.FC = () => {
  const characterId = usePanelCurrent();
  if (!characterId) return null;

  return (
    <div
      className="w-[504px] shrink-0 h-full flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #1a1610 0%, #141110 100%)',
        borderRight: '1px solid var(--color-border)',
        boxShadow: '2px 0 8px rgba(0,0,0,0.3)',
      }}
    >
      <CharacterPanel key={characterId} characterId={characterId} />
    </div>
  );
};

export default LeftPanel;
