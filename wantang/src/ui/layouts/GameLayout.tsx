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
    <div className="w-screen h-screen flex flex-col overflow-hidden">
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

      {/* Middle: Left Panel + Map + Side Menu */}
      <div className="flex-1 flex flex-row min-h-0 relative">
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

      {/* 史书和系统菜单按钮已移入顶栏右端 */}

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
