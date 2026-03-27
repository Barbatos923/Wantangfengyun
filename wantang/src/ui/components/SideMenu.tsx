import React, { useState } from 'react';
import RealmPanel from './RealmPanel';
import OfficialPanel from './OfficialPanel';
import GovernmentPanel from './GovernmentPanel';
import MilitaryPanel from './MilitaryPanel';

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

  const handleClick = (label: string) => {
    if (label === '政体') {
      setShowGovernmentPanel(true);
    } else if (label === '领地') {
      setShowRealmPanel(true);
    } else if (label === '军事') {
      setShowMilitaryPanel(true);
    } else if (label === '官职') {
      setShowOfficialPanel(true);
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
      {showMilitaryPanel && <MilitaryPanel onClose={() => setShowMilitaryPanel(false)} />}
    </div>
  );
};

export default SideMenu;
