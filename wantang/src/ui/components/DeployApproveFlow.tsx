// ===== 调兵审批弹窗 =====
// 玩家作为批准人（节度使/皇帝/王/刺史）审批属官草拟的调兵方案。
// 支持逐条删除、编辑目的地（地图选点）、全部批准/驳回。
// 驳回 → 给所有 submission 的 drafter 加 30 天 CD 并通知。

import { useState, useEffect } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useNpcStore } from '@engine/npc/NpcStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import { useStoryEventBus } from '@engine/storyEventBus';
import { EventPriority } from '@engine/types';
import { addDays } from '@engine/dateUtils';
import { usePanelStore } from '@ui/stores/panelStore';
import { executeDeployEntry } from '@engine/npc/behaviors/deployApproveBehavior';
import type { DeploymentEntry, DeploySubmission } from '@engine/military/deployCalc';

interface DeployApproveFlowProps {
  visible: boolean;
  onClose: () => void;
  onOpen: () => void;
}

interface EditableEntry extends DeploymentEntry {
  drafterId: string;
}

export default function DeployApproveFlow({ visible, onClose, onOpen }: DeployApproveFlowProps) {
  const task = useNpcStore((s) => s.playerTasks.find(t => t.type === 'deploy-approve') ?? null);
  const territories = useTerritoryStore((s) => s.territories);
  const armies = useMilitaryStore((s) => s.armies);
  const characters = useCharacterStore((s) => s.characters);
  const date = useTurnManager((s) => s.currentDate);

  // 本地可编辑副本（拍平 submissions，记住每条来自哪个 drafter）
  const [entries, setEntries] = useState<EditableEntry[]>([]);
  const [editedIndices, setEditedIndices] = useState<Set<number>>(new Set());

  // 地图选点：选点期间隐藏 Modal 但保持挂载
  const [selectingIndex, setSelectingIndex] = useState<number | null>(null);
  const mapSelectionActive = usePanelStore((s) => s.mapSelectionActive);
  const mapSelectionResult = usePanelStore((s) => s.mapSelectionResult);

  // 初始化本地副本：拍平 submissions，过滤已失效条目
  useEffect(() => {
    if (task) {
      const data = task.data as { submissions?: DeploySubmission[]; entries?: DeploymentEntry[] };
      const campaignArmyIds = new Set<string>();
      for (const c of useWarStore.getState().campaigns.values()) {
        for (const aid of c.armyIds) campaignArmyIds.add(aid);
        for (const ia of c.incomingArmies) campaignArmyIds.add(ia.armyId);
      }
      const flat: EditableEntry[] = [];
      if (data.submissions) {
        for (const s of data.submissions) {
          for (const e of s.entries) flat.push({ ...e, drafterId: s.drafterId });
        }
      } else if (data.entries) {
        // 兼容旧数据结构（存档迁移期）
        for (const e of data.entries) flat.push({ ...e, drafterId: '' });
      }
      const valid = flat.filter(e => {
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
    onOpen();
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
    onClose();
    usePanelStore.getState().startMapSelection('点击地图选择调兵目的地');
  }

  function notifyDrafterApproved(drafterId: string) {
    const playerId = useCharacterStore.getState().playerId;
    if (drafterId !== playerId || drafterId === actorId) return;
    const ruler = characters.get(actorId);
    const now = useTurnManager.getState().currentDate;
    useTurnManager.getState().addEvent({
      id: crypto.randomUUID(),
      date: { ...now },
      type: '草案批准',
      actors: [actorId, drafterId],
      territories: [],
      description: `${ruler?.name ?? '?'} 批准了你呈递的调兵方案。`,
      priority: EventPriority.Normal,
    });
  }

  function notifyDrafterRejected(drafterId: string) {
    const playerId = useCharacterStore.getState().playerId;
    if (drafterId !== playerId || drafterId === actorId) return;
    const ruler = characters.get(actorId);
    useStoryEventBus.getState().pushStoryEvent({
      id: crypto.randomUUID(),
      title: '草案被驳回',
      description: `${ruler?.name ?? '?'}审阅了你呈递的调兵草案，未予批准。30 日内，你不得再次草拟此事。`,
      actors: [
        { characterId: actorId, role: '审批人' },
        { characterId: drafterId, role: '草拟人（你）' },
      ],
      options: [
        {
          label: '知道了',
          description: '接受驳回，等待 30 日冷却',
          effects: [],
          onSelect: () => { /* no-op */ },
        },
      ],
    });
  }

  function handleApprove() {
    for (const entry of entries) {
      executeDeployEntry(entry, actorId);
    }
    // 通知玩家草拟人（去重）
    const drafterIds = new Set<string>();
    const data = task!.data as { submissions?: DeploySubmission[] };
    if (data.submissions) {
      for (const s of data.submissions) drafterIds.add(s.drafterId);
    }
    for (const did of drafterIds) notifyDrafterApproved(did);
    useNpcStore.getState().removePlayerTask(task!.id);
    onClose();
  }

  function handleReject() {
    // 驳回 = 给 task 中所有 drafter 加 30 天 CD + 通知
    const now = useTurnManager.getState().currentDate;
    const data = task!.data as { submissions?: DeploySubmission[] };
    if (data.submissions) {
      const cdUntil = addDays(now, 30);
      for (const s of data.submissions) {
        useNpcStore.getState().setDeployDrafterCooldown(s.drafterId, cdUntil);
        notifyDrafterRejected(s.drafterId);
      }
    }
    useNpcStore.getState().clearDeployDraft(actorId);
    useNpcStore.getState().removePlayerTask(task!.id);
    onClose();
  }

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
            const drafter = entry.drafterId ? characters.get(entry.drafterId) : null;
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
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-[var(--color-text)] font-medium">
                    {army?.name ?? '未知军队'}
                  </span>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {fromTerr?.name ?? '?'} → {toTerr?.name ?? '?'}
                    {drafter && <span className="ml-2 text-[var(--color-text-muted)]">（{drafter.name} 拟）</span>}
                    {isEdited && <span className="ml-1 text-[var(--color-accent-gold)]">(已修改)</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  title="修改目的地"
                  onClick={() => handleEditTarget(i)}
                >
                  改派
                </Button>
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
