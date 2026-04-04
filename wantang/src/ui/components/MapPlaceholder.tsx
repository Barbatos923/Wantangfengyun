import React, { useState, useEffect, useCallback } from 'react';
import GameMap from './GameMap';
import TerritoryPanel from './TerritoryPanel';
import CampaignPopup from './CampaignPopup';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import type { Character } from '@engine/character/types';
import { usePanelStore } from '@ui/stores/panelStore';
import { getActualController } from '@engine/official/officialUtils';
import { findTopLord } from '@engine/character/characterUtils';
import { findPath } from '@engine/military/marchCalc';
import { useWarStore } from '@engine/military/WarStore';
import { executeSetCampaignTarget } from '@engine/interaction/campaignAction';

/**
 * 沿 overlordId 链找到 controllerId 在 lordId 下的一级封臣。
 * 如果 controllerId === lordId，返回 lordId（直辖）。
 */
function findFirstVassalOf(
  controllerId: string,
  lordId: string,
  characters: Map<string, Character>,
): string {
  let current = controllerId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) return current;
    visited.add(current);
    const char = characters.get(current);
    if (!char) return current;
    if (current === lordId) return lordId;
    if (char.overlordId === lordId) return current;
    if (!char.overlordId) return current;
    current = char.overlordId;
  }
}

const MapPlaceholder: React.FC = () => {
  const territories = useTerritoryStore((s) => s.territories);
  const characters = useCharacterStore((s) => s.characters);
  const playerId = useCharacterStore((s) => s.playerId) ?? '';
  const territoryModalId = usePanelStore((s) => s.territoryModalId);
  const territoryForModal = territoryModalId ? territories.get(territoryModalId) : undefined;
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  // 地图选择模式（从弹窗触发的领地选择）
  const mapSelectionActive = usePanelStore((s) => s.mapSelectionActive);
  const mapSelectionPrompt = usePanelStore((s) => s.mapSelectionPrompt);

  // 行军模式
  const [marchingCampaignId, setMarchingCampaignId] = useState<string | null>(null);
  const [marchError, setMarchError] = useState<string | null>(null);

  // ESC 取消地图选择模式 / 行军模式
  useEffect(() => {
    if (!marchingCampaignId && !mapSelectionActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mapSelectionActive) {
          usePanelStore.getState().finishMapSelection(null);
        }
        if (marchingCampaignId) {
          setMarchingCampaignId(null);
          setMarchError(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [marchingCampaignId, mapSelectionActive]);

  // 错误提示自动消失
  useEffect(() => {
    if (!marchError) return;
    const timer = setTimeout(() => setMarchError(null), 2000);
    return () => clearTimeout(timer);
  }, [marchError]);

  const handleStartMarch = useCallback((campaignId: string) => {
    setSelectedCampaignId(null);
    setMarchingCampaignId(campaignId);
    setMarchError(null);
  }, []);

  const handleCancelMarch = useCallback(() => {
    setMarchingCampaignId(null);
    setMarchError(null);
  }, []);

  const handleCancelSelection = useCallback(() => {
    if (mapSelectionActive) {
      usePanelStore.getState().finishMapSelection(null);
    }
    handleCancelMarch();
  }, [mapSelectionActive, handleCancelMarch]);

  const handleSelectTerritory = (id: string) => {
    // 地图选择模式：点击 = 选择领地
    if (mapSelectionActive) {
      usePanelStore.getState().finishMapSelection(id);
      return;
    }

    // 行军模式：点击 = 选择目的地
    if (marchingCampaignId) {
      const campaign = useWarStore.getState().campaigns.get(marchingCampaignId);
      if (!campaign) { setMarchingCampaignId(null); return; }
      if (id === campaign.locationId) return; // 点击当前位置忽略

      const path = findPath(campaign.locationId, id, playerId, territories, characters);
      if (!path) {
        setMarchError('无法到达该目标（关隘阻挡）');
        return;
      }
      executeSetCampaignTarget(marchingCampaignId, id, path);
      setMarchingCampaignId(null);
      setMarchError(null);
      return;
    }

    // 正常模式：领地查看逻辑
    const t = territories.get(id);
    const controller = t ? getActualController(t) : null;
    if (!controller) return;

    const playerTopLord = findTopLord(playerId, characters);
    const topLord = findTopLord(controller, characters);
    // 从 Store 读最新值（避免快速双击时 React hook 闭包值滞后）
    const ps = usePanelStore.getState();
    const currentFocus = ps.mapFocusCharId;
    const currentChar = ps.stack[ps.stack.length - 1];

    if (topLord === playerTopLord) {
      // 玩家势力内（已按一级封臣着色）
      const firstVassal = findFirstVassalOf(controller, playerTopLord, characters);

      if (currentFocus === firstVassal) {
        // 该封臣已展开 → 点击内部的州
        if (currentChar === controller) {
          ps.openTerritoryModal(id);
        } else {
          ps.pushCharacter(controller);
        }
      } else {
        // 点击某封臣的领地 → 展开该封臣，显示其面板
        ps.setMapFocus(firstVassal);
        ps.pushCharacter(firstVassal);
      }
    } else if (currentFocus === topLord) {
      // 非玩家势力已展开
      if (currentChar === controller) {
        ps.openTerritoryModal(id);
      } else {
        ps.pushCharacter(controller);
      }
    } else {
      // 点击其他势力 → 展开其顶级领主
      ps.setMapFocus(topLord);
      ps.pushCharacter(topLord);
    }
  };

  return (
    <div className="flex-1 overflow-hidden relative">
      <GameMap
        onSelectTerritory={handleSelectTerritory}
        onSelectCampaign={(id) => setSelectedCampaignId(id)}
        marchMode={!!marchingCampaignId || mapSelectionActive}
        onRightClick={handleCancelSelection}
      />

      {/* 地图选择模式提示条 */}
      {mapSelectionActive && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-5 py-2 rounded-lg border text-sm font-bold shadow-lg"
          style={{
            background: 'rgba(26, 26, 46, 0.95)',
            borderColor: 'var(--color-accent-gold)',
            color: 'var(--color-accent-gold)',
          }}
        >
          {mapSelectionPrompt}
          <span className="text-xs font-normal ml-3" style={{ color: 'var(--color-text-muted)' }}>
            ESC / 右键取消
          </span>
        </div>
      )}

      {/* 行军模式提示条 */}
      {marchingCampaignId && !mapSelectionActive && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-5 py-2 rounded-lg border text-sm font-bold shadow-lg"
          style={{
            background: 'rgba(26, 26, 46, 0.95)',
            borderColor: 'var(--color-accent-gold)',
            color: 'var(--color-accent-gold)',
          }}
        >
          点击地图选择行军目的地
          <span className="text-xs font-normal ml-3" style={{ color: 'var(--color-text-muted)' }}>
            ESC / 右键取消
          </span>
          {marchError && (
            <span className="text-xs ml-3" style={{ color: '#e74c3c' }}>
              {marchError}
            </span>
          )}
        </div>
      )}

      {/* Territory modal popup */}
      {territoryForModal && (
        <TerritoryPanel
          territory={territoryForModal}
          onClose={() => usePanelStore.getState().closeTerritoryModal()}
          onClickRuler={(charId) => {
            usePanelStore.getState().closeTerritoryModal();
            usePanelStore.getState().pushCharacter(charId);
          }}
        />
      )}

      {/* Campaign popup */}
      {selectedCampaignId && (
        <CampaignPopup
          campaignId={selectedCampaignId}
          onClose={() => setSelectedCampaignId(null)}
          onStartMarch={handleStartMarch}
        />
      )}
    </div>
  );
};

export default MapPlaceholder;
