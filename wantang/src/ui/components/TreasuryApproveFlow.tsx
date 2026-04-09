// ===== 国库调拨审批弹窗 =====
// 玩家作为批准人（皇帝/王/节度使/刺史）审批属官草拟的国库调拨方案。
// 支持逐条编辑（来源/目标/资源/金额）、删除、全部批准/驳回。

import { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useNpcStore } from '@engine/npc/NpcStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { addDays } from '@engine/dateUtils';
import { executeTreasuryEntry } from '@engine/npc/behaviors/treasuryApproveBehavior';
import type { TreasuryEntry, TreasurySubmission } from '@engine/official/treasuryDraftCalc';
import type { Territory } from '@engine/territory/types';

interface TreasuryApproveFlowProps {
  visible: boolean;
  onClose: () => void;
}

export default function TreasuryApproveFlow({ visible, onClose }: TreasuryApproveFlowProps) {
  const task = useNpcStore((s) => s.playerTasks.find((t) => t.type === 'treasury-approve') ?? null);
  if (!task) return null;
  // 用 task.id 作为 key 让子组件 remount → buffer 自动重置；不再需要 useEffect 同步派生 state。
  return <TreasuryApproveBody key={task.id} task={task} visible={visible} onClose={onClose} />;
}

interface TreasuryApproveBodyProps {
  task: NonNullable<ReturnType<typeof useNpcStore.getState>['playerTasks'][number]>;
  visible: boolean;
  onClose: () => void;
}

function TreasuryApproveBody({ task, visible, onClose }: TreasuryApproveBodyProps) {
  const territories = useTerritoryStore((s) => s.territories);
  const controllerIndex = useTerritoryStore((s) => s.controllerIndex);
  const date = useTurnManager((s) => s.currentDate);

  // 本地可编辑副本：mount 时从 task 一次性派生
  const [entries, setEntries] = useState<TreasuryEntry[]>(() => {
    const data = task.data as { submissions?: TreasurySubmission[]; entries?: TreasuryEntry[] };
    const flat: TreasuryEntry[] = [];
    if (data.submissions) {
      for (const s of data.submissions) flat.push(...s.entries.map((e) => ({ ...e })));
    } else if (data.entries) {
      flat.push(...data.entries.map((e) => ({ ...e })));
    }
    return flat;
  });

  const actorId = task.actorId;

  // 该 ruler 直辖的州（用于下拉）
  const rulerZhouIds = controllerIndex.get(actorId);
  const rulerZhous: Territory[] = [];
  if (rulerZhouIds) {
    for (const id of rulerZhouIds) {
      const t = territories.get(id);
      if (t && t.tier === 'zhou' && t.treasury) rulerZhous.push(t);
    }
  }

  function updateEntry(idx: number, patch: Partial<TreasuryEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function removeEntry(idx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleApprove() {
    for (const entry of entries) {
      executeTreasuryEntry(entry, actorId);
    }
    useNpcStore.getState().removePlayerTask(task.id);
    onClose();
  }

  function handleReject() {
    // 驳回 = 给 task 中所有 drafter 加 30 天 CD
    const now = useTurnManager.getState().currentDate;
    const data = task.data as { submissions?: TreasurySubmission[] };
    if (data.submissions) {
      const cdUntil = addDays(now, 30);
      for (const s of data.submissions) {
        useNpcStore.getState().setTreasuryDrafterCooldown(s.drafterId, cdUntil);
      }
    }
    useNpcStore.getState().clearTreasuryDraft(actorId);
    useNpcStore.getState().removePlayerTask(task.id);
    onClose();
  }

  if (!visible) return null;

  const titleDate = date ? `${date.year}年${date.month}月` : '';
  const invalid = entries.some((e) => e.fromZhouId === e.toZhouId || e.amount <= 0);

  return (
    <Modal size="lg" onOverlayClick={onClose}>
      <ModalHeader title={`国库调拨审批 — ${titleDate}`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
        <div className="text-xs text-[var(--color-text-muted)] mb-1">
          以下为属官草拟的国库调拨方案，请审批：
        </div>
        {entries.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
            所有调拨已被移除
          </div>
        ) : (
          entries.map((e, i) => {
            const fromT = territories.get(e.fromZhouId);
            const balance =
              fromT?.treasury
                ? e.resource === 'money'
                  ? Math.floor(fromT.treasury.money)
                  : Math.floor(fromT.treasury.grain)
                : 0;
            const insufficient = e.amount > balance;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-2 rounded border ${
                  insufficient
                    ? 'border-[var(--color-accent-red)] bg-[var(--color-accent-red)]/5'
                    : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                }`}
              >
                <select
                  value={e.fromZhouId}
                  onChange={(ev) => updateEntry(i, { fromZhouId: ev.target.value })}
                  className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs"
                >
                  {rulerZhous.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
                <span className="text-[var(--color-text-muted)]">→</span>
                <select
                  value={e.toZhouId}
                  onChange={(ev) => updateEntry(i, { toZhouId: ev.target.value })}
                  className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs"
                >
                  {rulerZhous.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
                <select
                  value={e.resource}
                  onChange={(ev) => updateEntry(i, { resource: ev.target.value as 'money' | 'grain' })}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs"
                >
                  <option value="money">钱</option>
                  <option value="grain">粮</option>
                </select>
                <div className="flex flex-col items-end">
                  <input
                    type="number"
                    value={e.amount}
                    onChange={(ev) =>
                      updateEntry(i, { amount: Math.max(0, Number(ev.target.value) || 0) })
                    }
                    className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-right"
                  />
                  <div
                    className={`text-[10px] mt-0.5 ${
                      insufficient ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-muted)]'
                    }`}
                    title={`${fromT?.name ?? '?'} 当前余额`}
                  >
                    余 {balance}
                  </div>
                </div>
                <button
                  onClick={() => removeEntry(i)}
                  className="text-[var(--color-accent-red)] hover:underline text-xs ml-1"
                  title="删除此条"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
        {invalid && (
          <div className="text-xs text-[var(--color-accent-red)] mt-1">
            存在非法 entry（来源=目标 或 金额≤0），请修正后再批准。
          </div>
        )}
      </div>
      <div className="px-5 py-3 section-divider border-t shrink-0 flex gap-2">
        <Button variant="default" className="flex-1 py-2" onClick={handleReject}>
          驳回全部
        </Button>
        <Button
          variant="primary"
          className="flex-1 py-2 font-bold"
          disabled={entries.length === 0 || invalid}
          onClick={handleApprove}
        >
          批准调拨（{entries.length}项）
        </Button>
      </div>
    </Modal>
  );
}
