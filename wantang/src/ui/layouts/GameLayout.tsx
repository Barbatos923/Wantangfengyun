import React, { useEffect, useState } from 'react';
import ResourceBar from '../components/ResourceBar';
import SideMenu from '../components/SideMenu';
import AlertBar from '../components/AlertBar';
import EventToast from '../components/EventToast';
import EventModal from '../components/EventModal';
import MapPlaceholder from '../components/MapPlaceholder';
import BottomBar from '../components/BottomBar';
import LeftPanel from '../components/LeftPanel';
import WarOverlay from '../components/WarOverlay';
import DrafterTokenOverlay from '../components/DrafterTokenOverlay';
import SaveErrorToast from '../components/SaveErrorToast';
import SystemMenu from '../components/SystemMenu';
import GameOverScreen from '../components/GameOverScreen';
import { usePanelOpen, usePanelStore } from '@ui/stores/panelStore';

const GameLayout: React.FC = () => {
  const panelOpen = usePanelOpen();
  const [showSystemMenu, setShowSystemMenu] = useState(false);

  // ESC 键唤起/收起系统菜单
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSystemMenu((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden">
      {/* Top: Resource Bar */}
      <ResourceBar />

      {/* Middle: Left Panel + Map + Side Menu */}
      <div className="flex-1 flex flex-row min-h-0">
        {/* Left panel (character / territory info) */}
        {panelOpen && <LeftPanel />}

        {/* Map area with overlays */}
        <div className="flex-1 relative flex">
          {/* Alert bar overlaid top-left（行政任务通知） */}
          <div className="absolute top-0 left-0 z-10">
            <AlertBar />
          </div>
          {/* Event toast overlaid right-center-low（事件卡片通知，右侧中心偏下） */}
          <div className="absolute right-2 z-10" style={{ bottom: '15%' }}>
            <EventToast />
          </div>
          {/* 战争悬浮图标（右下角） */}
          <div className="absolute right-16 bottom-4 z-10">
            <WarOverlay />
          </div>
          {/* 草拟人令牌（左下角，仅当玩家持有草拟岗位时显示） */}
          <DrafterTokenOverlay />
          <MapPlaceholder />
        </div>

        {/* Right side menu */}
        <SideMenu />
      </div>

      {/* Bottom: Info Bar */}
      <BottomBar onClickPlayer={() => usePanelStore.getState().goToPlayer()} />

      {/* 中心弹出框（最高层级） */}
      <EventModal />

      {/* 右上角系统菜单按钮 */}
      <button
        onClick={() => setShowSystemMenu(true)}
        className="fixed top-2 right-2 z-30 w-9 h-9 rounded bg-[var(--color-bg-panel)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-text)] transition-colors flex items-center justify-center text-lg"
        title="系统菜单 (ESC)"
      >
        ⚙
      </button>

      {/* 系统菜单 */}
      {showSystemMenu && <SystemMenu onClose={() => setShowSystemMenu(false)} />}

      {/* 存档失败提示 */}
      <SaveErrorToast />

      {/* 王朝覆灭终局屏（仅 dynastyExtinct 时显示） */}
      <GameOverScreen />
    </div>
  );
};

export default GameLayout;
