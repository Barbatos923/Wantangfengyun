// ===== 调兵草拟弹窗 =====
// 玩家作为草拟人（都知兵马使/兵部尚书/ruler本人）草拟调兵方案。
// 显示引擎建议 + 威胁评估，支持编辑/添加/删除条目，呈报后写入 deploymentDrafts。

import { useState, useEffect, useMemo } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useNpcStore } from '@engine/npc/NpcStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTurnManager } from '@engine/TurnManager';
import { usePanelStore } from '@ui/stores/panelStore';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import {
  resolveDeployDrafter,
  assessBorderThreats,
  planDeployments,
  type DeploymentEntry,
  type BorderThreat,
} from '@engine/military/deployCalc';
import { getCampaignArmyIds } from '@engine/npc/behaviors/deployDraftBehavior';
import type { Personality } from '@data/traits';

interface DeployDraftFlowProps {
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/** 从 store 构建简易 getOpinion（无缓存，草拟界面调用次数少） */
function makeGetOpinion() {
  const chars = useCharacterStore.getState().characters;
  const terrState = useTerritoryStore.getState();
  return (aId: string, bId: string): number => {
    const a = chars.get(aId);
    const b = chars.get(bId);
    if (!a || !b) return 0;
    return calculateBaseOpinion(a, b, terrState.expectedLegitimacy.get(bId) ?? null, terrState.policyOpinionCache.get(aId) ?? null);
  };
}

export default function DeployDraftFlow({ visible, onOpen, onClose }: DeployDraftFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const territories = useTerritoryStore((s) => s.territories);
  const centralPosts = useTerritoryStore((s) => s.centralPosts);
  const characters = useCharacterStore((s) => s.characters);
  const armies = useMilitaryStore((s) => s.armies);
  const date = useTurnManager((s) => s.currentDate);

  // 解析草拟人身份
  const drafterResult = useMemo(
    () => playerId ? resolveDeployDrafter(playerId, territories, centralPosts) : null,
    [playerId, territories, centralPosts],
  );
  const rulerId = drafterResult?.rulerId ?? null;

  // 本地可编辑的调兵方案
  const [entries, setEntries] = useState<DeploymentEntry[]>([]);
  const [initialized, setInitialized] = useState(false);

  // 添加新条目的临时状态
  const [addingArmyId, setAddingArmyId] = useState('');

  // 地图选点
  const [selectingIndex, setSelectingIndex] = useState<number | null>(null); // 编辑已有条目
  const [selectingNewArmy, setSelectingNewArmy] = useState(false); // 添加新条目的目的地选择
  const mapSelectionActive = usePanelStore((s) => s.mapSelectionActive);
  const mapSelectionResult = usePanelStore((s) => s.mapSelectionResult);

  // 威胁评估
  const threats = useMemo((): BorderThreat[] => {
    if (!rulerId) return [];
    return assessBorderThreats(rulerId, territories, characters, makeGetOpinion());
  }, [rulerId, territories, characters]);

  // 初始化引擎建议
  useEffect(() => {
    if (!visible || initialized || !rulerId || !playerId) return;
    const milStore = useMilitaryStore.getState();
    const rulerArmies = milStore.getArmiesByOwner(rulerId);
    if (rulerArmies.length === 0) { setInitialized(true); return; }

    const charMap = useCharacterStore.getState().characters;
    // 构建一个默认 personality（玩家手动控制，用中间值）
    const defaultPersonality: Personality = {
      boldness: 0.5, rationality: 0.5, compassion: 0.5, greed: 0.5,
      honor: 0.5, sociability: 0.5, vengefulness: 0.5, energy: 0.5,
    };
    const campaignIds = getCampaignArmyIds();
    const suggestion = planDeployments(
      rulerId, rulerArmies, milStore.battalions,
      territories, charMap, makeGetOpinion(), campaignIds, defaultPersonality,
    );
    setEntries(suggestion);
    setInitialized(true);
  }, [visible, initialized, rulerId, playerId, territories]);

  // 重置 initialized 当弹窗关闭（排除地图选点期间的临时关闭）
  const isSelecting = selectingIndex !== null || selectingNewArmy;
  useEffect(() => {
    if (!visible && !isSelecting) setInitialized(false);
  }, [visible, isSelecting]);

  // 地图选择完成回调
  useEffect(() => {
    if (selectingIndex === null && !selectingNewArmy) return;
    if (mapSelectionActive) return;

    if (mapSelectionResult) {
      if (selectingIndex !== null) {
        // 编辑已有条目
        const idx = selectingIndex;
        const tid = mapSelectionResult;
        setEntries(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], targetLocationId: tid };
          return next;
        });
      } else if (selectingNewArmy && addingArmyId) {
        // 添加新条目
        const army = armies.get(addingArmyId);
        if (army) {
          setEntries(prev => [...prev, {
            armyId: addingArmyId,
            fromLocationId: army.locationId,
            targetLocationId: mapSelectionResult!,
          }]);
        }
        setAddingArmyId('');
      }
    }
    setSelectingIndex(null);
    setSelectingNewArmy(false);
    onOpen();
  }, [mapSelectionActive, mapSelectionResult, selectingIndex, selectingNewArmy, addingArmyId, armies, onOpen]);

  // 可用军队：ruler 名下，排除已在行营 + 已在方案中的
  const campaignArmyIds = useMemo(() => getCampaignArmyIds(), []);
  const entryArmyIds = useMemo(() => new Set(entries.map(e => e.armyId)), [entries]);
  const availableArmies = useMemo(() => {
    if (!rulerId) return [];
    return useMilitaryStore.getState().getArmiesByOwner(rulerId)
      .filter(a => !campaignArmyIds.has(a.id) && !entryArmyIds.has(a.id));
  }, [rulerId, campaignArmyIds, entryArmyIds]);

  if (!rulerId || !visible || isSelecting) return null;

  function handleRemoveEntry(index: number) {
    setEntries(prev => prev.filter((_, i) => i !== index));
  }

  function handleEditTarget(index: number) {
    setSelectingIndex(index);
    onClose();
    usePanelStore.getState().startMapSelection('点击地图选择调兵目的地');
  }

  function handleAddEntry() {
    if (!addingArmyId) return;
    setSelectingNewArmy(true);
    onClose();
    usePanelStore.getState().startMapSelection('点击地图选择调兵目的地');
  }

  function handleSubmit() {
    if (entries.length === 0) return;
    useNpcStore.getState().addDeploymentDraft(rulerId!, entries);
    onClose();
  }

  function handleCancel() {
    onClose();
  }

  const rulerChar = characters.get(rulerId);
  const titleDate = `${date.year}年${date.month}月`;

  return (
    <Modal size="xl" onOverlayClick={onClose}>
      <ModalHeader title={`调兵草拟 — ${titleDate}`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-5 py-3 flex gap-4 min-h-0">
        {/* 左侧：威胁评估 */}
        <div className="w-48 shrink-0 flex flex-col gap-2">
          <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
            为 {rulerChar?.name ?? '?'} 草拟调兵方案
          </div>
          <div className="text-xs font-medium text-[var(--color-text)]">边境威胁</div>
          {threats.length === 0 ? (
            <div className="text-xs text-[var(--color-text-muted)]">当前无边境威胁</div>
          ) : (
            threats.map(t => {
              const terr = territories.get(t.territoryId);
              const level = t.threatLevel >= 50 ? '高' : t.threatLevel >= 25 ? '中' : '低';
              const color = t.threatLevel >= 50
                ? 'var(--color-accent-red)'
                : t.threatLevel >= 25
                  ? 'var(--color-accent-gold)'
                  : 'var(--color-text-muted)';
              return (
                <div key={t.territoryId} className="flex items-center justify-between text-xs px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)]">
                  <span className="text-[var(--color-text)]">{terr?.name ?? '?'}</span>
                  <span style={{ color }}>威胁{level} ({t.threatLevel})</span>
                </div>
              );
            })
          )}
        </div>

        {/* 右侧：调兵方案 */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="text-xs font-medium text-[var(--color-text)]">调兵方案</div>
          {entries.length === 0 ? (
            <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
              暂无调动，请添加条目或由系统建议
            </div>
          ) : (
            entries.map((entry, i) => {
              const army = armies.get(entry.armyId);
              const fromTerr = territories.get(entry.fromLocationId);
              const toTerr = territories.get(entry.targetLocationId);
              return (
                <div
                  key={`${entry.armyId}-${i}`}
                  className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[var(--color-text)] font-medium">
                      {army?.name ?? '未知军队'}
                    </span>
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {fromTerr?.name ?? '?'} → {toTerr?.name ?? '?'}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleEditTarget(i)}>
                    改派
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-accent-red)]"
                    onClick={() => handleRemoveEntry(i)}
                  >
                    删除
                  </Button>
                </div>
              );
            })
          )}

          {/* 添加新条目 */}
          {availableArmies.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <select
                className="flex-1 px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-xs"
                value={addingArmyId}
                onChange={(e) => setAddingArmyId(e.target.value)}
              >
                <option value="">-- 选择军队 --</option>
                {availableArmies.map(a => {
                  const loc = territories.get(a.locationId);
                  return (
                    <option key={a.id} value={a.id}>
                      {a.name}（{loc?.name ?? '?'}）
                    </option>
                  );
                })}
              </select>
              <Button
                variant="default"
                size="sm"
                disabled={!addingArmyId}
                onClick={handleAddEntry}
              >
                + 选目的地
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 section-divider border-t shrink-0 flex gap-2">
        <Button variant="default" className="flex-1 py-2" onClick={handleCancel}>
          放弃草拟
        </Button>
        <Button
          variant="primary"
          className="flex-1 py-2 font-bold"
          disabled={entries.length === 0}
          onClick={handleSubmit}
        >
          呈报草案（{entries.length}项）
        </Button>
      </div>
    </Modal>
  );
}
