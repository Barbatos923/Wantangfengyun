// ===== 调兵审批弹窗 =====
// 玩家作为批准人（节度使/皇帝）审批 NPC 草拟的调兵方案。
// 支持逐条删除、编辑目的地（地图选点）、全部批准/驳回。

import { useState, useEffect } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useNpcStore } from '@engine/npc/NpcStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { addDays } from '@engine/dateUtils';
import { usePanelStore } from '@ui/stores/panelStore';
import { executeDeployEntry } from '@engine/npc/behaviors/deployApproveBehavior';
import type { DeploymentEntry } from '@engine/military/deployCalc';

interface DeployApproveFlowProps {
  visible: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export default function DeployApproveFlow({ visible, onClose, onOpen }: DeployApproveFlowProps) {
  const task = useNpcStore((s) => s.playerTasks.find(t => t.type === 'deploy-approve') ?? null);
  const territories = useTerritoryStore((s) => s.territories);
  const armies = useMilitaryStore((s) => s.armies);
  const date = useTurnManager((s) => s.currentDate);

  // 本地可编辑副本
  const [entries, setEntries] = useState<DeploymentEntry[]>([]);
  const [editedIndices, setEditedIndices] = useState<Set<number>>(new Set());

  // 地图选点：选点期间隐藏 Modal 但保持挂载
  const [selectingIndex, setSelectingIndex] = useState<number | null>(null);
  const mapSelectionActive = usePanelStore((s) => s.mapSelectionActive);
  const mapSelectionResult = usePanelStore((s) => s.mapSelectionResult);

  // 初始化本地副本，过滤掉已失效的 entries（军队不存在/已在行营/不再属于批准人）
  useEffect(() => {
    if (task) {
      const raw = (task.data as { entries: DeploymentEntry[] }).entries;
      const campaignArmyIds = new Set<string>();
      for (const c of useWarStore.getState().campaigns.values()) {
        for (const aid of c.armyIds) campaignArmyIds.add(aid);
        for (const ia of c.incomingArmies) campaignArmyIds.add(ia.armyId);
      }
      const valid = raw.filter(e => {
        const army = armies.get(e.armyId);
        return army && army.ownerId === task.actorId && !campaignArmyIds.has(e.armyId);
      });
      setEntries(valid);
      setEditedIndices(new Set());
    }
  }, [task]);

  // 地图选择完成 → 更新 entry + 恢复显示
  useEffect(() => {
    if (selectingIndex === null) return;
    if (mapSelectionActive) return; // 仍在选择中

    // 选择完成（有结果）或取消（无结果）
    if (mapSelectionResult) {
      const idx = selectingIndex;
      const territoryId = mapSelectionResult;
      setEntries(prev => {
        const next = [...prev];
        if (next[idx] && territoryId !== next[idx].targetLocationId) {
          next[idx] = { ...next[idx], targetLocationId: territoryId };
          setEditedIndices(prev2 => new Set(prev2).add(idx));
        }
        return next;
      });
    }
    setSelectingIndex(null);
    onOpen(); // 选点结束后自动重新打开弹窗
  }, [mapSelectionActive, mapSelectionResult, selectingIndex]);

  if (!task) return null;

  const actorId = task.actorId;
  const isSelecting = selectingIndex !== null;

  function handleRemoveEntry(index: number) {
    setEntries(prev => prev.filter((_, i) => i !== index));
    setEditedIndices(prev => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      }
      return next;
    });
  }

  function handleEditTarget(index: number) {
    setSelectingIndex(index);
    onClose(); // 关闭弹窗让地图可交互
    usePanelStore.getState().startMapSelection('点击地图选择调兵目的地');
  }

  function handleApprove() {
    for (const entry of entries) {
      executeDeployEntry(entry, actorId);
    }
    useNpcStore.getState().removePlayerTask(task!.id);
    onClose();
  }

  function handleReject() {
    // 驳回后设置 6 个月（180 天）冷却
    const now = useTurnManager.getState().currentDate;
    useNpcStore.getState().setDeployRejectCooldown(actorId, addDays(now, 180));
    useNpcStore.getState().removePlayerTask(task!.id);
    onClose();
  }

  // 隐藏条件：未打开 或 选点期间（组件保持挂载以保留 state）
  if (!visible || isSelecting) return null;

  const titleDate = date ? `${date.year}年${date.month}月` : '';

  return (
    <Modal size="lg" onOverlayClick={onClose}>
      <ModalHeader title={`调兵审批 — ${titleDate}`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
        <div className="text-xs text-[var(--color-text-muted)] mb-1">
          以下为属官草拟的调兵方案，请审批：
        </div>
        {entries.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
            所有调动已被移除
          </div>
        ) : (
          entries.map((entry, i) => {
            const army = armies.get(entry.armyId);
            const fromTerr = territories.get(entry.fromLocationId);
            const toTerr = territories.get(entry.targetLocationId);
            const isEdited = editedIndices.has(i);

            return (
              <div
                key={`${entry.armyId}-${i}`}
                className={`flex items-center gap-2 px-3 py-2 rounded border ${
                  isEdited
                    ? 'border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/5'
                    : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                }`}
              >
                {/* 军队名 */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-[var(--color-text)] font-medium">
                    {army?.name ?? '未知军队'}
                  </span>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {fromTerr?.name ?? '?'} → {toTerr?.name ?? '?'}
                    {isEdited && <span className="ml-1 text-[var(--color-accent-gold)]">(已修改)</span>}
                  </div>
                </div>
                {/* 编辑目的地 */}
                <Button
                  variant="ghost"
                  size="sm"
                  title="修改目的地"
                  onClick={() => handleEditTarget(i)}
                >
                  改派
                </Button>
                {/* 删除 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--color-accent-red)]"
                  title="移除此调动"
                  onClick={() => handleRemoveEntry(i)}
                >
                  删除
                </Button>
              </div>
            );
          })
        )}
      </div>
      <div className="px-5 py-3 section-divider border-t shrink-0 flex gap-2">
        <Button variant="default" className="flex-1 py-2" onClick={handleReject}>
          驳回全部
        </Button>
        <Button
          variant="primary"
          className="flex-1 py-2 font-bold"
          disabled={entries.length === 0}
          onClick={handleApprove}
        >
          批准调兵（{entries.length}项）
        </Button>
      </div>
    </Modal>
  );
}
