import React, { useEffect, useState } from 'react';
import ResourceBar from '../components/ResourceBar';
import SideMenu from '../components/SideMenu';
import AlertBar from '../components/AlertBar';
import EventToast from '../components/EventToast';
import EventModal from '../components/EventModal';
import MapPlaceholder from '../components/MapPlaceholder';
import PlayerIdentityCard from '../components/PlayerIdentityCard';
import TimeControl from '../components/TimeControl';
import LeftPanel from '../components/LeftPanel';
import WarOverlay from '../components/WarOverlay';
import DrafterTokenOverlay from '../components/DrafterTokenOverlay';
import SaveErrorToast from '../components/SaveErrorToast';
import SystemMenu from '../components/SystemMenu';
import GameOverScreen from '../components/GameOverScreen';
import ChronicleButton from '../components/chronicle/ChronicleButton';
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
    <div className="w-screen h-screen flex flex-row overflow-hidden">
      {/* Left panel — 全高度，独立于资源栏 */}
      {panelOpen && <LeftPanel />}

      {/* 右侧：资源栏 + 地图 + 侧栏 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top: 资源栏横梁（右对齐，左侧透出地图） */}
        <div className="flex items-stretch justify-end shrink-0 relative z-20"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #151110 30%)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }} className="flex items-stretch">
            <ResourceBar />
            <div className="flex items-center gap-1 px-2 shrink-0"
              style={{
                background: 'linear-gradient(180deg, #1e1a14 0%, #151110 100%)',
                borderBottom: '1px solid var(--color-border)',
                borderLeft: '1px solid var(--color-border)',
              }}
            >
              <ChronicleButton />
              <button
                onClick={() => setShowSystemMenu(true)}
                className="w-9 h-9 rounded bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors flex items-center justify-center text-lg"
                title="系统菜单 (ESC)"
              >
                ⚙
              </button>
            </div>
          </div>
        </div>

        {/* Middle: Map + Side Menu */}
        <div className="flex-1 flex flex-row min-h-0 relative">
          {/* Map area with overlays */}
          <div className="flex-1 relative flex">
            {/* Alert bar overlaid top-left（行政任务通知） */}
            <div className="absolute top-0 left-0 z-10">
              <AlertBar />
            </div>
            {/* Event toast overlaid right-center-low */}
            <div className="absolute right-2 z-10" style={{ bottom: '15%' }}>
              <EventToast />
            </div>
            {/* 战争悬浮图标（右下角，TimeControl 上方） */}
            <div className="absolute right-16 bottom-16 z-10">
              <WarOverlay />
            </div>
            {/* 草拟人令牌 */}
            <DrafterTokenOverlay />

            {/* 左下：玩家身份牌 */}
            <div className="absolute bottom-3 left-2 z-10">
              <PlayerIdentityCard onClick={() => usePanelStore.getState().goToPlayer()} />
            </div>

            {/* 右下：时间管理器 */}
            <div className="absolute bottom-3 right-2 z-10">
              <TimeControl />
            </div>

            <MapPlaceholder />
          </div>

          {/* Right side menu */}
          <SideMenu />
        </div>
      </div>

      {/* 中心弹出框（最高层级） */}
      <EventModal />

      {/* 系统菜单 */}
      {showSystemMenu && <SystemMenu onClose={() => setShowSystemMenu(false)} />}

      {/* 存档失败提示 */}
      <SaveErrorToast />

      {/* 王朝覆灭终局屏 */}
      <GameOverScreen />
    </div>
  );
};

export default GameLayout;
