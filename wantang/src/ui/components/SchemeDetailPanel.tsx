// ===== 计谋详情面板（二级 modal） =====
//
// 显示一个 scheme 的全部细节：参与者卡片 / 阶段进度 / 模糊成功率 / 取消按钮。
// 订阅 volatile state（characters / currentDate / schemes），保证阶段推进时实时更新。

import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import {
  useSchemeStore,
  getSchemeType,
  getFuzzySuccess,
  type FuzzySuccess,
  type SchemeInstance,
} from '@engine/scheme';
import { cancelScheme } from '@engine/interaction/schemeAction';
import { getAlienationMethod } from '@engine/scheme/types/alienation';
import { toAbsoluteDay } from '@engine/dateUtils';

interface SchemeDetailPanelProps {
  schemeId: string;
  onClose: () => void;
}

function fuzzyLabel(f: FuzzySuccess): string {
  switch (f.kind) {
    case 'exact': return `${f.value}%`;
    case 'tier': return f.tier;
    case 'rough': return f.tier;
    case 'unknown': return '未知';
  }
}

export default function SchemeDetailPanel({ schemeId, onClose }: SchemeDetailPanelProps) {
  // 订阅 volatile state（直接从 store 读 scheme，方便每次推进自动重渲）
  const schemes = useSchemeStore((s) => s.schemes);
  const characters = useCharacterStore((s) => s.characters);
  const currentDate = useTurnManager((s) => s.currentDate);
  const playerId = useCharacterStore((s) => s.playerId);

  const scheme: SchemeInstance | undefined = schemes.get(schemeId);

  if (!scheme) {
    // scheme 已被结算/终止/取消 → 自动关闭
    return (
      <Modal size="sm" zIndex={50} onOverlayClick={onClose}>
        <ModalHeader title="计谋已结束" onClose={onClose} />
        <div className="px-5 py-4">
          <p className="text-sm text-[var(--color-text-muted)]">该计谋已不在进行中。</p>
          <Button variant="default" className="w-full mt-3 py-2" onClick={onClose}>
            关闭
          </Button>
        </div>
      </Modal>
    );
  }

  const def = getSchemeType(scheme.schemeTypeId);
  const initiator = characters.get(scheme.initiatorId);
  const primary = characters.get(scheme.primaryTargetId);
  const isAlienation = scheme.data.kind === 'alienation';
  const secondary = isAlienation
    ? characters.get((scheme.data as { secondaryTargetId: string }).secondaryTargetId)
    : null;
  const isPlayerInitiator = scheme.initiatorId === playerId;

  // 模糊成功率（用 snapshot 冻结的 spymasterStrategy，与启动口径一致）
  const fuzzy = getFuzzySuccess(
    scheme.snapshot.spymasterStrategy,
    scheme.snapshot.targetSpymasterStrategy,
    scheme.currentSuccessRate,
  );

  // 阶段进度
  const totalDays = scheme.phase.phaseDuration * scheme.phase.total;
  const startDay = toAbsoluteDay(scheme.startDate);
  const currentDay = toAbsoluteDay(currentDate);
  const elapsed = Math.max(0, currentDay - startDay);
  const daysLeft = Math.max(0, totalDays - elapsed);
  const progressPct = Math.min(100, (elapsed / totalDays) * 100);

  // 离间方法名
  const methodName = isAlienation
    ? getAlienationMethod((scheme.data as { methodId: string }).methodId)?.name ?? '?'
    : null;

  return (
    <Modal size="md" zIndex={50} onOverlayClick={onClose}>
      <ModalHeader title={def?.name ?? '计谋详情'} onClose={onClose} />
      <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        {/* 类型 / 方法 */}
        <div>
          <div className="text-base font-bold text-[var(--color-text)]">
            {def?.icon ?? '🎯'} {def?.name ?? scheme.schemeTypeId}
          </div>
          {methodName && (
            <div className="text-xs text-[var(--color-text-muted)] mt-1">
              手段：<span className="text-[var(--color-text)]">{methodName}</span>
            </div>
          )}
        </div>

        {/* 参与者卡片 */}
        <div className="flex flex-col gap-2">
          <div className="text-xs text-[var(--color-text-muted)]">参与者</div>
          <ParticipantCard label="主谋" char={initiator} />
          <ParticipantCard label="目标" char={primary} />
          {secondary && <ParticipantCard label="次要目标" char={secondary} />}
        </div>

        {/* 阶段进度 */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[var(--color-text-muted)]">
              {scheme.phase.total > 1 ? `阶段 ${scheme.phase.current}/${scheme.phase.total}` : '进度'}
            </span>
            <span className="text-[var(--color-text)]">剩余 {daysLeft} 天</span>
          </div>
          <div className="h-2 rounded bg-[var(--color-bg)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent-gold)] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* 成功率 */}
        <div className="rounded p-3 bg-[var(--color-bg)] border border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">当前成功率</span>
            <span className="text-lg font-bold text-[var(--color-accent-gold)]">{fuzzyLabel(fuzzy)}</span>
          </div>
          {fuzzy.kind !== 'exact' && (
            <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
              基于谋主与对方的能力差，仅给出模糊估计。
            </div>
          )}
        </div>

        {/* 操作 */}
        {isPlayerInitiator && (
          <div className="flex gap-2">
            <Button
              variant="default"
              className="flex-1 py-2"
              onClick={() => {
                cancelScheme(schemeId);
                onClose();
              }}
              title="取消计谋（无费用退还）"
            >
              取消计谋
            </Button>
            <Button variant="default" className="flex-1 py-2" onClick={onClose}>
              关闭
            </Button>
          </div>
        )}
        {!isPlayerInitiator && (
          <Button variant="default" className="w-full py-2" onClick={onClose}>
            关闭
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ── 子组件 ──

interface ParticipantCardProps {
  label: string;
  char: { id: string; name: string; abilities: { strategy: number; diplomacy: number } } | undefined;
}

function ParticipantCard({ label, char }: ParticipantCardProps) {
  return (
    <div className="flex items-center justify-between rounded px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)]">
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--color-text-muted)] w-14">{label}</span>
        <span className="text-sm font-bold text-[var(--color-text)]">{char?.name ?? '?'}</span>
      </div>
      {char && (
        <span className="text-[11px] text-[var(--color-text-muted)]">
          谋 {char.abilities.strategy} · 外 {char.abilities.diplomacy}
        </span>
      )}
    </div>
  );
}
