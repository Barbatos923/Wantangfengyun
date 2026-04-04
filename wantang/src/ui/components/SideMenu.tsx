import React, { useState } from 'react';
import RealmPanel from './RealmPanel';
import OfficialPanel from './OfficialPanel';
import GovernmentPanel from './GovernmentPanel';
import MilitaryPanel from './MilitaryPanel';
import { useNotificationStore, type StoryEvent } from '@ui/stores/notificationStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { usePanelStore } from '@ui/stores/panelStore';

interface MenuItem {
  label: string;
  icon: string;
}

const menuItems: MenuItem[] = [
  { label: '政体', icon: '🏛' },
  { label: '领地', icon: '🗺' },
  { label: '军事', icon: '⚔' },
  { label: '官职', icon: '📜' },
  { label: '廷臣', icon: '👤' },
  { label: '计谋', icon: '🎯' },
  { label: '派系', icon: '🤝' },
  { label: '决议', icon: '📋' },
  { label: '活动', icon: '🎭' },
];

const SideMenu: React.FC = () => {
  const [showRealmPanel, setShowRealmPanel] = useState(false);
  const [showOfficialPanel, setShowOfficialPanel] = useState(false);
  const [showGovernmentPanel, setShowGovernmentPanel] = useState(false);
  const [showMilitaryPanel, setShowMilitaryPanel] = useState(false);
  const mapSelectionActive = usePanelStore((s) => s.mapSelectionActive);

  const handleClick = (label: string) => {
    if (label === '政体') {
      setShowGovernmentPanel(true);
    } else if (label === '领地') {
      setShowRealmPanel(true);
    } else if (label === '军事') {
      setShowMilitaryPanel(true);
    } else if (label === '官职') {
      setShowOfficialPanel(true);
    } else if (label === '活动') {
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
              onSelect: () => console.log('[测试事件] 选择：出兵迎敌'),
            },
            {
              label: '和谈纳贡',
              description: '遣使和谈，以金帛换取边境安宁。',
              successChance: 95,
              effects: [
                { label: '金钱', value: -100, type: 'negative' },
                { label: '威望', value: -5, type: 'negative' },
              ],
              onSelect: () => console.log('[测试事件] 选择：和谈纳贡'),
            },
            {
              label: '按兵不动',
              description: '静观其变，不作回应。',
              effects: [
                { label: '威望', value: -15, type: 'negative' },
              ],
              onSelect: () => console.log('[测试事件] 选择：按兵不动'),
            },
          ],
        };
        useNotificationStore.getState().pushStoryEvent(testEvent);
      }
    } else {
      console.log(`[SideMenu] Clicked: ${label}`);
    }
  };

  return (
    <div className="flex flex-col bg-[var(--color-bg-panel)] border-l border-[var(--color-border)] py-2 shrink-0">
      {menuItems.map((item) => (
        <button
          key={item.label}
          onClick={() => handleClick(item.label)}
          className="flex flex-col items-center justify-center w-16 h-16 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text)] transition-colors"
          title={item.label}
        >
          <span className="text-xl">{item.icon}</span>
          <span className="text-xs mt-0.5">{item.label}</span>
        </button>
      ))}
      {showGovernmentPanel && <GovernmentPanel onClose={() => setShowGovernmentPanel(false)} />}
      {showRealmPanel && <RealmPanel onClose={() => setShowRealmPanel(false)} />}
      {showOfficialPanel && <OfficialPanel onClose={() => setShowOfficialPanel(false)} />}
      {showMilitaryPanel && (
        <div style={{ display: mapSelectionActive ? 'none' : undefined }}>
          <MilitaryPanel onClose={() => setShowMilitaryPanel(false)} />
        </div>
      )}
    </div>
  );
};

export default SideMenu;
