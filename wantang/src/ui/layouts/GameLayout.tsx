import React from 'react';
import ResourceBar from '../components/ResourceBar';
import SideMenu from '../components/SideMenu';
import AlertBar from '../components/AlertBar';
import MapPlaceholder from '../components/MapPlaceholder';
import BottomBar from '../components/BottomBar';
import LeftPanel from '../components/LeftPanel';
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

        {/* Map area with alert overlay */}
        <div className="flex-1 relative flex">
          {/* Alert bar overlaid top-left */}
          <div className="absolute top-0 left-0 z-10">
            <AlertBar />
          </div>
          <MapPlaceholder />
        </div>

        {/* Right side menu */}
        <SideMenu />
      </div>

      {/* Bottom: Info Bar */}
      <BottomBar onClickPlayer={() => usePanelStore.getState().goToPlayer()} />
    </div>
  );
};

export default GameLayout;
