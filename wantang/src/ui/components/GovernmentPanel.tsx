import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getHeldPosts } from '@engine/official/officialUtils';
import { ALL_POSITIONS } from '@data/positions';
import { rankMap } from '@data/ranks';
import { usePanelStore } from '@ui/stores/panelStore';

interface GovernmentPanelProps {
  onClose: () => void;
}

type TabKey = 'capital';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'capital', label: '京官' },
];

// 机构显示顺序（排除皇室）
const INSTITUTION_ORDER = [
  '中书门下', '翰林院', '枢密院', '神策军',
  '三司', '中书省', '门下省', '尚书省',
  '御史台', '秘书省', '三公',
];

const GovernmentPanel: React.FC<GovernmentPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('capital');
  const characters = useCharacterStore((s) => s.characters);

  // 构建职位→持有人映射（中央职位）
  const positionHolders = new Map<string, { charId: string; charName: string }>();
  for (const c of characters.values()) {
    if (!c.alive || !c.official) continue;
    for (const h of getHeldPosts(c.id)) {
      if (!positionHolders.has(h.templateId)) {
        positionHolders.set(h.templateId, { charId: c.id, charName: c.name });
      }
    }
  }

  // 按机构分组中央职位（排除皇帝）
  const centralByInstitution = new Map<string, typeof ALL_POSITIONS>();
  for (const pos of ALL_POSITIONS) {
    if (pos.scope !== 'central') continue;
    if (pos.id === 'pos-emperor') continue;
    if (!centralByInstitution.has(pos.institution)) {
      centralByInstitution.set(pos.institution, []);
    }
    centralByInstitution.get(pos.institution)!.push(pos);
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-5 max-w-lg w-full mx-4 shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-lg font-bold text-[var(--color-accent-gold)]">政体</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)] mb-4 shrink-0">
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
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'capital' && (
            <div className="space-y-4">
              {INSTITUTION_ORDER.map((inst) => {
                const positions = centralByInstitution.get(inst);
                if (!positions || positions.length === 0) return null;
                return (
                  <div key={inst}>
                    <h3 className="text-xs font-bold text-[var(--color-accent-gold)] mb-1.5 px-1">{inst}</h3>
                    <div className="space-y-1">
                      {positions.map((pos) => {
                        const holder = positionHolders.get(pos.id);
                        const rDef = holder
                          ? (() => {
                              const c = characters.get(holder.charId);
                              return c?.official ? rankMap.get(c.official.rankLevel) : undefined;
                            })()
                          : undefined;
                        return (
                          <button
                            key={pos.id}
                            className="w-full flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors text-left"
                            onClick={() => {
                              if (holder) {
                                usePanelStore.getState().pushCharacter(holder.charId);
                                onClose();
                              }
                            }}
                          >
                            <div className="flex flex-col min-w-0 mr-2">
                              <span className="text-sm text-[var(--color-text)]">{pos.name}</span>
                              {holder ? (
                                <span className="text-xs text-[var(--color-accent-gold)]">{holder.charName}</span>
                              ) : (
                                <span className="text-xs text-[var(--color-text-muted)] italic">暂缺</span>
                              )}
                            </div>
                            <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                              {holder && rDef ? rDef.name : `需 ${rankMap.get(pos.minRank)?.name ?? ''}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GovernmentPanel;
