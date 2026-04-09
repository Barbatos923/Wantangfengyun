// ===== 草拟人令牌悬浮入口 =====
// 玩家担任 NPC ruler 的草拟人岗位时，在左下角显示令牌，
// 点击可看到自动推荐的方案，编辑后提交进 buffer。
//
// 当前承载两个 token：
//  - 国库调度（三司使/国长史/节度判官/录事参军）
//  - 调兵草拟（兵部尚书/国司马/都知兵马使/录事参军）
// 玩家自己当 ruler 时，国库可走 TerritoryPanel 直接调拨；调兵仍走草拟流程（保持单一入口）。

import React, { useMemo, useState, useEffect } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useNpcStore } from '@engine/npc/NpcStore';
import {
  resolveTreasuryDrafter,
  planTreasuryDraft,
  type TreasuryEntry,
} from '@engine/official/treasuryDraftCalc';
import {
  resolveDeployDrafter,
  planDeployments,
  assessBorderThreats,
  type DeploymentEntry,
  type BorderThreat,
} from '@engine/military/deployCalc';
import { getCampaignArmyIds } from '@engine/npc/behaviors/deployDraftBehavior';
import { useWarStore } from '@engine/military/WarStore';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { submitTreasuryDraftAction, submitDeployDraftAction } from '@engine/interaction';
import { useTurnManager } from '@engine/TurnManager';
import { usePanelStore } from '@ui/stores/panelStore';
import { diffDays } from '@engine/dateUtils';
import { Modal, ModalHeader, Button } from './base';
import type { Personality } from '@data/traits';

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
  const treasuryCooldowns = useNpcStore((s) => s.treasuryDrafterCooldowns);
  const deployDrafts = useNpcStore((s) => s.deployDrafts);
  const deployCooldowns = useNpcStore((s) => s.deployDrafterCooldowns);
  const wars = useWarStore((s) => s.wars);
  const currentDate = useTurnManager((s) => s.currentDate);

  const [treasuryOpen, setTreasuryOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);

  // ── 玩家草拟人身份解析 ──
  const treasuryDrafter = useMemo(() => {
    if (!playerId) return null;
    const player = characters.get(playerId);
    if (!player?.alive) return null;
    return resolveTreasuryDrafter(playerId, territories, centralPosts, holderIndex, postIndex);
  }, [playerId, characters, territories, centralPosts, holderIndex, postIndex]);

  const deployDrafter = useMemo(() => {
    if (!playerId) return null;
    const player = characters.get(playerId);
    if (!player?.alive) return null;
    return resolveDeployDrafter(playerId, territories, centralPosts);
  }, [playerId, characters, territories, centralPosts]);

  // ── treasury: ruler 直辖州 ──
  const treasuryRulerZhous = useMemo(() => {
    if (!treasuryDrafter) return [];
    const ids = controllerIndex.get(treasuryDrafter.rulerId);
    if (!ids) return [];
    const out = [];
    for (const id of ids) {
      const t = territories.get(id);
      if (!t || t.tier !== 'zhou' || !t.treasury) continue;
      out.push(t);
    }
    return out;
  }, [treasuryDrafter, controllerIndex, territories]);

  // ── treasury: 推荐方案（点开时实时算） ──
  const treasuryRecommended = useMemo(() => {
    if (!treasuryOpen || !treasuryDrafter) return { entries: [], urgencyMonths: Infinity };
    return planTreasuryDraft(treasuryRulerZhous, treasuryHistory);
  }, [treasuryOpen, treasuryDrafter, treasuryRulerZhous, treasuryHistory]);

  // ── treasury 状态 ──
  // 注：treasuryEntries 不再放在父组件，避免"useEffect 同步初始化"导致编辑期被推荐方案
  // 默默覆盖。改为让 TreasuryDraftEditor 自己持有 buffer，关闭/重开 → 自然 remount → 重新初始化。
  const treasuryRuler = treasuryDrafter ? characters.get(treasuryDrafter.rulerId) : null;
  const treasuryPlayerIsRuler = treasuryDrafter ? treasuryDrafter.rulerId === playerId : false;
  const treasurySubmissions = treasuryDrafter ? (treasuryDrafts.get(treasuryDrafter.rulerId) ?? []) : [];
  const treasuryPendingCount = treasurySubmissions.reduce((acc, s) => acc + s.entries.length, 0);
  const treasuryPlayerHasPending = playerId ? treasurySubmissions.some((s) => s.drafterId === playerId) : false;
  const treasuryCdUntil = playerId ? treasuryCooldowns.get(playerId) : undefined;
  const treasuryCdRemaining = (treasuryCdUntil && currentDate)
    ? Math.max(0, diffDays(currentDate, treasuryCdUntil))
    : 0;
  const treasuryOnCooldown = treasuryCdRemaining > 0;

  // ── deploy 状态 ──
  const deployRuler = deployDrafter ? characters.get(deployDrafter.rulerId) : null;
  const deployPlayerIsRuler = deployDrafter ? deployDrafter.rulerId === playerId : false;
  const deploySubmissions = deployDrafter ? (deployDrafts.get(deployDrafter.rulerId) ?? []) : [];
  const deployPendingCount = deploySubmissions.reduce((acc, s) => acc + s.entries.length, 0);
  const deployPlayerHasPending = playerId ? deploySubmissions.some((s) => s.drafterId === playerId) : false;
  const deployCdUntil = playerId ? deployCooldowns.get(playerId) : undefined;
  const deployCdRemaining = (deployCdUntil && currentDate)
    ? Math.max(0, diffDays(currentDate, deployCdUntil))
    : 0;
  const deployOnCooldown = deployCdRemaining > 0;
  // 战时由战争引擎调度，玩家草拟入口禁用（与 NPC 路径规则一致）
  const deployInWar = useMemo(() => {
    if (!deployDrafter) return false;
    const rid = deployDrafter.rulerId;
    for (const w of wars.values()) {
      if (w.status !== 'active') continue;
      if (w.attackerId === rid || w.defenderId === rid) return true;
      if (w.attackerParticipants.includes(rid)) return true;
      if (w.defenderParticipants.includes(rid)) return true;
    }
    return false;
  }, [deployDrafter, wars]);

  // 两个都没有 → 完全不显示
  if (!treasuryDrafter && !deployDrafter) return null;

  return (
    <>
      {/* 令牌组（左下角，纵向叠放） */}
      <div className="absolute left-4 bottom-4 z-10 flex flex-col gap-2">
        {treasuryDrafter && (
          <TokenButton
            label="国库调度"
            char="职"
            tooltip={`国库调度令｜呈 ${treasuryRuler?.name ?? '?'}`}
            pendingCount={treasuryPendingCount}
            cdRemaining={treasuryCdRemaining}
            onCooldown={treasuryOnCooldown}
            onClick={() => setTreasuryOpen(true)}
          />
        )}
        {deployDrafter && (
          <TokenButton
            label={deployInWar ? '战时' : '调兵草拟'}
            char="兵"
            tooltip={
              deployInWar
                ? `战时由行营系统调度，调兵草拟暂不可用`
                : `调兵草拟令｜呈 ${deployRuler?.name ?? '?'}`
            }
            pendingCount={deployPendingCount}
            cdRemaining={deployCdRemaining}
            onCooldown={deployOnCooldown || deployInWar}
            onClick={() => { if (!deployInWar) setDeployOpen(true); }}
            color="green"
          />
        )}
      </div>

      {/* 国库调度 Modal */}
      {treasuryOpen && treasuryDrafter && (
        <Modal size="lg" onOverlayClick={() => setTreasuryOpen(false)}>
          <ModalHeader
            title={`国库调度草案${treasuryPlayerIsRuler ? '' : ` — 呈 ${treasuryRuler?.name ?? '?'}`}`}
            onClose={() => setTreasuryOpen(false)}
          />
          <TreasuryDraftEditor
            zhous={treasuryRulerZhous}
            recommended={treasuryRecommended.entries}
            urgencyMonths={treasuryRecommended.urgencyMonths}
            pendingCount={treasuryPendingCount}
            playerHasPending={treasuryPlayerHasPending}
            onCooldown={treasuryOnCooldown}
            cdRemaining={treasuryCdRemaining}
            onSubmit={(entries) => {
              if (!playerId) return;
              const result = submitTreasuryDraftAction(treasuryDrafter.rulerId, playerId, entries);
              if (result.ok) setTreasuryOpen(false);
            }}
          />
        </Modal>
      )}

      {/* 调兵草拟 Modal */}
      {deployOpen && deployDrafter && (
        <DeployDraftModal
          rulerId={deployDrafter.rulerId}
          playerId={playerId}
          playerIsRuler={deployPlayerIsRuler}
          rulerName={deployRuler?.name ?? '?'}
          pendingCount={deployPendingCount}
          playerHasPending={deployPlayerHasPending}
          onCooldown={deployOnCooldown}
          cdRemaining={deployCdRemaining}
          onClose={() => setDeployOpen(false)}
          onReopen={() => setDeployOpen(true)}
        />
      )}
    </>
  );
};

// ── 令牌按钮 ───────────────────────────────────────────

interface TokenButtonProps {
  label: string;
  char: string;
  tooltip: string;
  pendingCount: number;
  cdRemaining: number;
  onCooldown: boolean;
  onClick: () => void;
  color?: 'gold' | 'green';
}

const TokenButton: React.FC<TokenButtonProps> = ({
  label, char, tooltip, pendingCount, cdRemaining, onCooldown, onClick, color = 'gold',
}) => {
  // 两种 token 共用同一深棕底（与 ModalHeader 风格统一），仅边框/文字配色不同
  const accent = color === 'green' ? 'var(--color-accent-green)' : 'var(--color-accent-gold)';

  return (
    <div
      className="flex flex-col items-center cursor-pointer group"
      onClick={onClick}
      title={tooltip}
    >
      <div
        className={`relative w-[72px] h-[72px] rounded-md border-2 flex flex-col items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform bg-gradient-to-br from-[#5a3a1c] to-[#2c1a0a]`}
        style={{
          borderColor: onCooldown ? 'var(--color-accent-red)' : accent,
          opacity: onCooldown ? 0.7 : 1,
        }}
      >
        <div
          className="text-2xl font-bold leading-none drop-shadow"
          style={{ color: onCooldown ? 'var(--color-accent-red)' : accent }}
        >
          {char}
        </div>
        <div
          className="text-[9px] mt-1 tracking-wider"
          style={{ color: onCooldown ? 'var(--color-accent-red)' : accent }}
        >
          {onCooldown ? `CD ${cdRemaining}日` : label}
        </div>
        {pendingCount > 0 && !onCooldown && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--color-accent-red)] text-white text-[10px] font-bold flex items-center justify-center shadow">
            {pendingCount}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 国库调度编辑器（保持原 TreasuryDraftEditor 不变） ─────────────

interface TreasuryEditorProps {
  zhous: import('@engine/territory/types').Territory[];
  recommended: TreasuryEntry[];
  urgencyMonths: number;
  pendingCount: number;
  playerHasPending: boolean;
  onCooldown: boolean;
  cdRemaining: number;
  onSubmit: (entries: TreasuryEntry[]) => void;
}

const TreasuryDraftEditor: React.FC<TreasuryEditorProps> = ({
  zhous, recommended, urgencyMonths, pendingCount,
  playerHasPending, onCooldown, cdRemaining, onSubmit,
}) => {
  // buffer 自管：mount 时一次性从 recommended 取初值，编辑期不会被外部推荐方案覆盖
  const [entries, setEntries] = useState<TreasuryEntry[]>(() => recommended);
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
          onClick={() => onSubmit(entries)}
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

// ── 调兵草拟 Modal（含地图选点） ───────────────────────────

interface DeployDraftModalProps {
  rulerId: string;
  playerId: string | null;
  playerIsRuler: boolean;
  rulerName: string;
  pendingCount: number;
  playerHasPending: boolean;
  onCooldown: boolean;
  cdRemaining: number;
  onClose: () => void;
  onReopen: () => void;
}

/** 简易 getOpinion（供威胁评估/推荐方案使用，调用次数少，不缓存） */
function makeGetOpinion() {
  const chars = useCharacterStore.getState().characters;
  const terrState = useTerritoryStore.getState();
  return (aId: string, bId: string): number => {
    const a = chars.get(aId);
    const b = chars.get(bId);
    if (!a || !b) return 0;
    return calculateBaseOpinion(
      a, b,
      terrState.expectedLegitimacy.get(bId) ?? null,
      terrState.policyOpinionCache.get(aId) ?? null,
    );
  };
}

const DeployDraftModal: React.FC<DeployDraftModalProps> = ({
  rulerId, playerId, playerIsRuler, rulerName,
  pendingCount, playerHasPending, onCooldown, cdRemaining, onClose, onReopen,
}) => {
  const territories = useTerritoryStore((s) => s.territories);
  const characters = useCharacterStore((s) => s.characters);
  const armies = useMilitaryStore((s) => s.armies);
  const date = useTurnManager((s) => s.currentDate);

  const [entries, setEntries] = useState<DeploymentEntry[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [addingArmyId, setAddingArmyId] = useState('');

  // 地图选点
  const [selectingIndex, setSelectingIndex] = useState<number | null>(null);
  const [selectingNewArmy, setSelectingNewArmy] = useState(false);
  const mapSelectionActive = usePanelStore((s) => s.mapSelectionActive);
  const mapSelectionResult = usePanelStore((s) => s.mapSelectionResult);
  const isSelecting = selectingIndex !== null || selectingNewArmy;

  // 威胁评估
  const threats = useMemo((): BorderThreat[] => {
    const milStore = useMilitaryStore.getState();
    return assessBorderThreats(
      rulerId, territories, characters, makeGetOpinion(),
      milStore.armies, milStore.battalions,
    );
  }, [rulerId, territories, characters]);

  // 初始化：跑一次推荐
  useEffect(() => {
    if (initialized) return;
    const milStore = useMilitaryStore.getState();
    const rulerArmies = milStore.getArmiesByOwner(rulerId);
    if (rulerArmies.length === 0) { setInitialized(true); return; }

    const defaultPersonality: Personality = {
      boldness: 0.5, rationality: 0.5, compassion: 0.5, greed: 0.5,
      honor: 0.5, sociability: 0.5, vengefulness: 0.5, energy: 0.5,
    };
    const campaignIds = getCampaignArmyIds();
    const suggestion = planDeployments(
      rulerId, rulerArmies, milStore.battalions,
      territories, characters, makeGetOpinion(), campaignIds, defaultPersonality,
      milStore.armies,
    );
    setEntries(suggestion);
    setInitialized(true);
  }, [initialized, rulerId, territories, characters]);

  // 地图选择回调
  useEffect(() => {
    if (selectingIndex === null && !selectingNewArmy) return;
    if (mapSelectionActive) return;

    if (mapSelectionResult) {
      if (selectingIndex !== null) {
        const idx = selectingIndex;
        const tid = mapSelectionResult;
        setEntries(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], targetLocationId: tid };
          return next;
        });
      } else if (selectingNewArmy && addingArmyId) {
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
    onReopen();
  }, [mapSelectionActive, mapSelectionResult, selectingIndex, selectingNewArmy, addingArmyId, armies, onReopen]);

  // 可用军队（未编入行营、未在方案中）
  const campaignArmyIds = useMemo(() => getCampaignArmyIds(), []);
  const entryArmyIds = useMemo(() => new Set(entries.map(e => e.armyId)), [entries]);
  const availableArmies = useMemo(() => {
    return useMilitaryStore.getState().getArmiesByOwner(rulerId)
      .filter(a => !campaignArmyIds.has(a.id) && !entryArmyIds.has(a.id));
  }, [rulerId, campaignArmyIds, entryArmyIds]);

  function handleRemoveEntry(index: number) {
    setEntries(prev => prev.filter((_, i) => i !== index));
  }
  function handleEditTarget(index: number) {
    setSelectingIndex(index);
    usePanelStore.getState().startMapSelection('点击地图选择调兵目的地');
  }
  function handleAddEntry() {
    if (!addingArmyId) return;
    setSelectingNewArmy(true);
    usePanelStore.getState().startMapSelection('点击地图选择调兵目的地');
  }
  function handleSubmit() {
    if (!playerId || entries.length === 0) return;
    const result = submitDeployDraftAction(rulerId, playerId, entries);
    if (result.ok) onClose();
  }

  if (isSelecting) return null;

  const titleDate = date ? `${date.year}年${date.month}月` : '';

  return (
    <Modal size="xl" onOverlayClick={onClose}>
      <ModalHeader
        title={`调兵草拟${playerIsRuler ? '' : ` — 呈 ${rulerName}`} — ${titleDate}`}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-5 py-3 flex gap-4 min-h-0">
        {/* 左侧：威胁评估 */}
        <div className="w-48 shrink-0 flex flex-col gap-2">
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

          {/* 状态提示 */}
          {onCooldown && (
            <div className="mt-2 text-[10px] text-[var(--color-accent-red)] bg-[var(--color-accent-red)]/10 border border-[var(--color-accent-red)] rounded p-2">
              ⚠ 上次草案被驳回，{cdRemaining} 日内不得再次草拟
            </div>
          )}
          {!onCooldown && playerHasPending && (
            <div className="mt-2 text-[10px] text-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)] rounded p-2">
              你已有一份草案在等待审批
            </div>
          )}
          {!onCooldown && !playerHasPending && pendingCount > 0 && (
            <div className="mt-2 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded p-2">
              已有其他属官提交 {pendingCount} 条；你的提交将与之合并
            </div>
          )}
        </div>

        {/* 右侧：调兵方案 */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="text-xs font-medium text-[var(--color-text)]">调兵方案</div>
          {entries.length === 0 ? (
            <div className="text-xs text-[var(--color-text-muted)] text-center py-4">
              暂无调动，请添加条目
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
        <Button variant="default" className="flex-1 py-2" onClick={onClose}>
          放弃草拟
        </Button>
        <Button
          variant="primary"
          className="flex-1 py-2 font-bold"
          disabled={onCooldown || playerHasPending || entries.length === 0}
          onClick={handleSubmit}
        >
          呈报草案（{entries.length}项）
        </Button>
      </div>
    </Modal>
  );
};

export default DrafterTokenOverlay;
