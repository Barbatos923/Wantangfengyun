import React, { useState, useMemo } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { positionMap } from '@data/positions';
import { usePanelStore } from '@ui/stores/panelStore';
import type { Post } from '@engine/territory/types';
import { ModalHeader } from './base';
import { CapitalOfficialsTab } from './CapitalOfficialsTab';
import { LocalOfficialsTab } from './LocalOfficialsTab';

interface GovernmentPanelProps {
  onClose: () => void;
}

type TabKey = 'capital' | 'local';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'capital', label: '京官' },
  { key: 'local', label: '地方官' },
];

const GovernmentPanel: React.FC<GovernmentPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('capital');
  const [expandedDaos, setExpandedDaos] = useState<Set<string>>(new Set());
  const [expandedZhous, setExpandedZhous] = useState<Set<string>>(new Set());
  const [expandedInsts, setExpandedInsts] = useState<Set<string>>(new Set());

  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const centralPosts = useTerritoryStore((s) => s.centralPosts);

  const centralByInstitution = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of centralPosts) {
      if (post.templateId === 'pos-emperor') continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.institution) continue;
      const inst = tpl.institution;
      if (!map.has(inst)) map.set(inst, []);
      map.get(inst)!.push(post);
    }
    return map;
  }, [centralPosts]);

  const daos = useMemo(
    () => [...territories.values()].filter((t) => t.tier === 'dao').sort((a, b) => a.name.localeCompare(b.name, 'zh')),
    [territories],
  );

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const handleSelectCharacter = (id: string) => {
    usePanelStore.getState().pushCharacter(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex flex-col rounded-lg max-w-lg w-full mx-4 shadow-xl"
        style={{
          background: 'var(--color-bg-panel)',
          border: '1px solid var(--color-border)',
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <ModalHeader title="政体" onClose={onClose} />

        {/* Tabs */}
        <div className="flex shrink-0 px-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2 text-sm font-bold transition-colors ${
                activeTab === key
                  ? 'text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'capital' && (
            <CapitalOfficialsTab
              centralByInstitution={centralByInstitution}
              characters={characters}
              expandedInsts={expandedInsts}
              onToggleInst={(id) => toggle(setExpandedInsts, id)}
              onSelectCharacter={handleSelectCharacter}
            />
          )}
          {activeTab === 'local' && (
            <LocalOfficialsTab
              daos={daos}
              territories={territories}
              characters={characters}
              expandedDaos={expandedDaos}
              expandedZhous={expandedZhous}
              onToggleDao={(id) => toggle(setExpandedDaos, id)}
              onToggleZhou={(id) => toggle(setExpandedZhous, id)}
              onSelectCharacter={handleSelectCharacter}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default GovernmentPanel;
