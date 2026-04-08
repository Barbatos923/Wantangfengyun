// ===== 草拟人令牌悬浮入口 =====
// 玩家担任 NPC ruler 的草拟人岗位时（三司使/国长史/节度判官/录事参军），
// 在左下角显示一个"职"令牌，点击可看到自动推荐的国库调拨方案，编辑后提交进 buffer。
//
// A 范式：玩家是某 NPC ruler 的草拟人 → 提交草案 → 等待 NPC ruler 自动审批。
// 玩家自己当 ruler 时，应使用 TerritoryPanel 上现有的"调拨"按钮（直接调拨，不走草案）。

import React, { useMemo, useState, useEffect } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useNpcStore } from '@engine/npc/NpcStore';
import {
  resolveTreasuryDrafter,
  planTreasuryDraft,
  type TreasuryEntry,
} from '@engine/official/treasuryDraftCalc';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { submitTreasuryDraftAction } from '@engine/interaction';
import { useTurnManager } from '@engine/TurnManager';
import { diffDays } from '@engine/dateUtils';
import { Modal, ModalHeader, Button } from './base';

// ── 主组件 ────────────────────────────────────────────

const DrafterTokenOverlay: React.FC = () => {
  const playerId = useCharacterStore((s) => s.playerId);
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const centralPosts = useTerritoryStore((s) => s.centralPosts);
  const holderIndex = useTerritoryStore((s) => s.holderIndex);
  const postIndex = useTerritoryStore((s) => s.postIndex);
  const controllerIndex = useTerritoryStore((s) => s.controllerIndex);
  const treasuryHistory = useLedgerStore((s) => s.treasuryHistory);
  const treasuryDrafts = useNpcStore((s) => s.treasuryDrafts);
  const drafterCooldowns = useNpcStore((s) => s.treasuryDrafterCooldowns);
  const currentDate = useTurnManager((s) => s.currentDate);

  const [open, setOpen] = useState(false);

  // ── 玩家是否持有草拟人岗位 + 服务的 ruler ──
  const drafterInfo = useMemo(() => {
    if (!playerId) return null;
    const player = characters.get(playerId);
    if (!player?.alive) return null;
    return resolveTreasuryDrafter(playerId, territories, centralPosts, holderIndex, postIndex);
  }, [playerId, characters, territories, centralPosts, holderIndex, postIndex]);

  // ── ruler 直辖州 ──
  const rulerZhous = useMemo(() => {
    if (!drafterInfo) return [];
    const ids = controllerIndex.get(drafterInfo.rulerId);
    if (!ids) return [];
    const out = [];
    for (const id of ids) {
      const t = territories.get(id);
      if (!t || t.tier !== 'zhou' || !t.treasury) continue;
      out.push(t);
    }
    return out;
  }, [drafterInfo, controllerIndex, territories]);

  // ── 推荐方案（点开时实时算） ──
  const recommended = useMemo(() => {
    if (!open || !drafterInfo) return { entries: [], urgencyMonths: Infinity };
    return planTreasuryDraft(rulerZhous, treasuryHistory);
  }, [open, drafterInfo, rulerZhous, treasuryHistory]);

  // ── 编辑中的 entries（初始化为推荐方案） ──
  const [editingEntries, setEditingEntries] = useState<TreasuryEntry[]>([]);
  useEffect(() => {
    if (open) setEditingEntries(recommended.entries);
  }, [open, recommended.entries]);

  // 玩家不是任何 ruler 的草拟人 → 不显示
  if (!drafterInfo) return null;

  const ruler = characters.get(drafterInfo.rulerId);
  const playerIsRuler = drafterInfo.rulerId === playerId;
  // 该 ruler 当前 buffer 中所有 submission 的 entries 总数
  const submissions = treasuryDrafts.get(drafterInfo.rulerId) ?? [];
  const pendingCount = submissions.reduce((acc, s) => acc + s.entries.length, 0);
  // 玩家自己是否有 pending submission
  const playerHasPending = playerId ? submissions.some((s) => s.drafterId === playerId) : false;
  // CD 剩余天数
  const cdUntil = playerId ? drafterCooldowns.get(playerId) : undefined;
  const cdRemaining = (cdUntil && currentDate)
    ? Math.max(0, diffDays(currentDate, cdUntil))
    : 0;
  const onCooldown = cdRemaining > 0;

  return (
    <>
      {/* 令牌（左下角，始终显示） */}
      <div className="absolute left-4 bottom-4 z-10">
        <div
          className="flex flex-col items-center cursor-pointer group"
          onClick={() => setOpen(true)}
          title={`国库调度令｜呈 ${ruler?.name ?? '?'}`}
        >
          <div className={`relative w-[72px] h-[72px] rounded-md bg-gradient-to-br from-[#5a3a1c] to-[#2c1a0a] border-2 ${onCooldown ? 'border-[var(--color-accent-red)] opacity-70' : 'border-[var(--color-accent-gold)]'} flex flex-col items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform`}>
            <div className={`${onCooldown ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-accent-gold)]'} text-2xl font-bold leading-none drop-shadow`}>职</div>
            <div className={`${onCooldown ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-accent-gold)]'} text-[9px] mt-1 tracking-wider`}>
              {onCooldown ? `CD ${cdRemaining}日` : '国库调度'}
            </div>
            {pendingCount > 0 && !onCooldown && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--color-accent-red)] text-white text-[10px] font-bold flex items-center justify-center shadow">
                {pendingCount}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 展开 Modal */}
      {open && (
        <Modal size="lg" onOverlayClick={() => setOpen(false)}>
          <ModalHeader
            title={`国库调度草案${playerIsRuler ? '' : ` — 呈 ${ruler?.name ?? '?'}`}`}
            onClose={() => setOpen(false)}
          />
          <DraftEditor
            rulerId={drafterInfo.rulerId}
            zhous={rulerZhous}
            recommended={recommended.entries}
            urgencyMonths={recommended.urgencyMonths}
            entries={editingEntries}
            setEntries={setEditingEntries}
            pendingCount={pendingCount}
            playerHasPending={playerHasPending}
            onCooldown={onCooldown}
            cdRemaining={cdRemaining}
            onSubmit={() => {
              if (!playerId) return;
              const result = submitTreasuryDraftAction(drafterInfo.rulerId, playerId, editingEntries);
              if (result.ok) setOpen(false);
            }}
          />
        </Modal>
      )}
    </>
  );
};

// ── 编辑器子组件 ───────────────────────────────────────

interface EditorProps {
  rulerId: string;
  zhous: import('@engine/territory/types').Territory[];
  recommended: TreasuryEntry[];
  urgencyMonths: number;
  entries: TreasuryEntry[];
  setEntries: (e: TreasuryEntry[]) => void;
  pendingCount: number;
  playerHasPending: boolean;
  onCooldown: boolean;
  cdRemaining: number;
  onSubmit: () => void;
}

const DraftEditor: React.FC<EditorProps> = ({
  zhous, recommended, urgencyMonths, entries, setEntries, pendingCount,
  playerHasPending, onCooldown, cdRemaining, onSubmit,
}) => {
  const updateEntry = (idx: number, patch: Partial<TreasuryEntry>) => {
    setEntries(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };
  const removeEntry = (idx: number) => {
    setEntries(entries.filter((_, i) => i !== idx));
  };
  const addEmpty = () => {
    if (zhous.length < 2) return;
    setEntries([
      ...entries,
      {
        fromZhouId: zhous[0].id,
        toZhouId: zhous[1].id,
        resource: 'grain',
        amount: 100,
      },
    ]);
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {/* 状态摘要 */}
      <div className="mb-3 text-xs text-[var(--color-text-muted)]">
        最严重赤字：{urgencyMonths === Infinity ? '无（无州赤字）' : `${urgencyMonths.toFixed(1)} 月`}
        ｜直辖州数：{zhous.length}
        ｜推荐方案：{recommended.length} 条
        {pendingCount > 0 && <span className="text-[var(--color-accent-red)]">｜已有 {pendingCount} 条待批草案</span>}
      </div>

      {onCooldown && (
        <div className="mb-3 text-xs text-[var(--color-accent-red)] bg-[var(--color-accent-red)]/10 border border-[var(--color-accent-red)] rounded p-2">
          ⚠ 你上次的草案被驳回，{cdRemaining} 日内不得再次草拟。
        </div>
      )}
      {!onCooldown && playerHasPending && (
        <div className="mb-3 text-xs text-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)] rounded p-2">
          你已有一份草案在等待审批，无法重复提交。
        </div>
      )}
      {!onCooldown && !playerHasPending && pendingCount > 0 && (
        <div className="mb-3 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded p-2">
          已有其他属官提交的草案在等待审批；你的提交将与之合并。
        </div>
      )}

      {/* entries 列表 */}
      {entries.length === 0 ? (
        <div className="text-sm text-[var(--color-text-muted)] py-6 text-center">
          {recommended.length === 0
            ? '当前无需调度（所有州储备充足）'
            : '推荐方案为空，可手动添加'}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-sm bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded p-2">
              <select
                value={e.fromZhouId}
                onChange={(ev) => updateEntry(i, { fromZhouId: ev.target.value })}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs"
              >
                {zhous.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
              <span className="text-[var(--color-text-muted)]">→</span>
              <select
                value={e.toZhouId}
                onChange={(ev) => updateEntry(i, { toZhouId: ev.target.value })}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs"
              >
                {zhous.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
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
              <input
                type="number"
                value={e.amount}
                onChange={(ev) => updateEntry(i, { amount: Math.max(0, Number(ev.target.value) || 0) })}
                className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-right"
              />
              <button
                onClick={() => removeEntry(i)}
                className="text-[var(--color-accent-red)] hover:underline text-xs"
                title="删除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 操作 */}
      <div className="mt-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={addEmpty} disabled={zhous.length < 2}>
          + 添加一行
        </Button>
        {recommended.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setEntries(recommended)}>
            重置为推荐
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={
            onCooldown
            || playerHasPending
            || entries.length === 0
            || entries.some((e) => e.fromZhouId === e.toZhouId || e.amount <= 0)
          }
        >
          提交草案
        </Button>
      </div>

      {/* 提示：from===to 或 amount=0 时禁用提交 */}
      {entries.some((e) => e.fromZhouId === e.toZhouId) && (
        <div className="mt-2 text-xs text-[var(--color-accent-red)]">
          有 entry 的来源与目标相同，请修正。
        </div>
      )}

      <div className="mt-3 text-[10px] text-[var(--color-text-muted)] leading-relaxed">
        提交后草案进入 ruler 的待批 buffer。NPC ruler 通常会在次日自动审批；玩家 ruler 会收到审批任务通知。
      </div>
    </div>
  );
};

export default DrafterTokenOverlay;
