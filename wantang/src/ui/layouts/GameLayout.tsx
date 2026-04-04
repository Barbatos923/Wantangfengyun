import React from 'react';
import ResourceBar from '../components/ResourceBar';
import SideMenu from '../components/SideMenu';
import AlertBar from '../components/AlertBar';
import EventToast from '../components/EventToast';
import EventModal from '../components/EventModal';
import MapPlaceholder from '../components/MapPlaceholder';
import BottomBar from '../components/BottomBar';
import LeftPanel from '../components/LeftPanel';
import WarOverlay from '../components/WarOverlay';
import { usePanelOpen, usePanelStore } from '@ui/stores/panelStore';

const GameLayout: React.FC = () => {
  const panelOpen = usePanelOpen();

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
          <MapPlaceholder />
        </div>

        {/* Right side menu */}
        <SideMenu />
      </div>

      {/* Bottom: Info Bar */}
      <BottomBar onClickPlayer={() => usePanelStore.getState().goToPlayer()} />

      {/* 中心弹出框（最高层级） */}
      <EventModal />
    </div>
  );
};

export default GameLayout;
