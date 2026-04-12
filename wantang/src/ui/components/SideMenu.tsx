import React, { useState } from 'react';
import RealmPanel from './RealmPanel';
import OfficialPanel from './OfficialPanel';
import GovernmentPanel from './GovernmentPanel';
import MilitaryPanel from './MilitaryPanel';
import DecisionPanel from './DecisionPanel';
import SchemePanel from './SchemePanel';
import { useStoryEventBus, type StoryEvent } from '@engine/storyEventBus';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { usePanelStore } from '@ui/stores/panelStore';
import {
  IconPalace, IconMap, IconMilitary, IconScroll,
  IconOfficials, IconScheme, IconFaction, IconDecree, IconGoblet,
} from './icons/MenuIcons';

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  key: string;
}

const menuItems: MenuItem[] = [
  { label: '政体', icon: <IconPalace size={28} />, key: 'government' },
  { label: '领地', icon: <IconMap size={28} />, key: 'realm' },
  { label: '军事', icon: <IconMilitary size={28} />, key: 'military' },
  { label: '官职', icon: <IconScroll size={28} />, key: 'official' },
  { label: '廷臣', icon: <IconOfficials size={28} />, key: 'retainers' },
  { label: '计谋', icon: <IconScheme size={28} />, key: 'scheme' },
  { label: '派系', icon: <IconFaction size={28} />, key: 'faction' },
  { label: '决议', icon: <IconDecree size={28} />, key: 'decision' },
  { label: '活动', icon: <IconGoblet size={28} />, key: 'event' },
];

const SideMenu: React.FC = () => {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const mapSelectionActive = usePanelStore((s) => s.mapSelectionActive);

  const handleClick = (key: string) => {
    if (key === 'event') {
      // 测试事件：推入虚拟决策事件
      const playerId = useCharacterStore.getState().playerId;
      if (playerId) {
        const testEvent: StoryEvent = {
          id: crypto.randomUUID(),
          title: '边关急报',
          description: '北方游牧部族大举南下侵扰边境，烽火连绵数百里。边关守将急报朝廷，请求增援。群臣议论纷纷，或主战，或主和，须速作决断。',
          actors: [
            { characterId: playerId, role: '决策者' },
          ],
          options: [
            {
              label: '出兵迎敌',
              description: '调遣精锐北上迎战，若胜则威名远扬。',
              successChance: 70,
              effects: [
                { label: '威望', value: 10, type: 'positive' },
                { label: '金钱', value: -50, type: 'negative' },
              ],
              onSelect: () => {},
            },
            {
              label: '和谈纳贡',
              description: '遣使和谈，以金帛换取边境安宁。',
              successChance: 95,
              effects: [
                { label: '金钱', value: -100, type: 'negative' },
                { label: '威望', value: -5, type: 'negative' },
              ],
              onSelect: () => {},
            },
            {
              label: '按兵不动',
              description: '静观其变，不作回应。',
              effects: [
                { label: '威望', value: -15, type: 'negative' },
              ],
              onSelect: () => {},
            },
          ],
        };
        useStoryEventBus.getState().pushStoryEvent(testEvent);
      }
      return;
    }
    setActivePanel(key);
  };

  const closePanel = () => setActivePanel(null);

  return (
    <div
      className="flex flex-col py-1 shrink-0"
      style={{
        background: 'linear-gradient(180deg, #1a1610 0%, #141110 100%)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: 'inset 1px 0 4px rgba(0,0,0,0.3)',
      }}
    >
      {menuItems.map((item) => {
        const isActive = activePanel === item.key;
        return (
          <button
            key={item.key}
            onClick={() => handleClick(item.key)}
            className="relative flex flex-col items-center justify-center w-16 h-16 transition-colors cursor-pointer select-none group"
            style={{
              color: isActive ? 'var(--color-accent-gold)' : 'var(--color-text)',
              background: isActive ? 'rgba(184,154,83,0.08)' : undefined,
            }}
            title={item.label}
          >
            {/* 左侧金色选中条 */}
            {isActive && (
              <div
                className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r"
                style={{ background: 'var(--color-accent-gold)' }}
              />
            )}
            {/* 图标 */}
            <span className="transition-colors group-hover:text-[var(--color-accent-gold)]">
              {item.icon}
            </span>
            {/* 标签 */}
            <span className="text-[11px] mt-0.5 text-[var(--color-text)] transition-colors">
              {item.label}
            </span>
          </button>
        );
      })}

      {activePanel === 'government' && <GovernmentPanel onClose={closePanel} />}
      {activePanel === 'realm' && <RealmPanel onClose={closePanel} />}
      {activePanel === 'official' && <OfficialPanel onClose={closePanel} />}
      {activePanel === 'military' && (
        <div style={{ display: mapSelectionActive ? 'none' : undefined }}>
          <MilitaryPanel onClose={closePanel} />
        </div>
      )}
      {activePanel === 'decision' && <DecisionPanel onClose={closePanel} />}
      {activePanel === 'scheme' && <SchemePanel onClose={closePanel} />}
    </div>
  );
};

export default SideMenu;
