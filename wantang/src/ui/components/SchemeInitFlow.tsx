// ===== 计谋发起向导 =====
//
// 从交互菜单选"计谋"后打开。两种计谋的流程：
//   - 拉拢（basic）: pickType → confirm（直接发起）
//   - 离间（complex）: pickType → pickSecondary → pickMethod → confirm
//
// 订阅 volatile state（characters / currentDate / schemes），按 execute 契约处理 stale。

import { useMemo, useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import {
  buildSchemeContext,
  calcSchemeLimit,
  getAllSchemeTypes,
  getSchemeType,
  useSchemeStore,
} from '@engine/scheme';
import { CURRY_FAVOR_COST, calcCurryFavorRate } from '@engine/scheme/types/curryFavor';
import {
  ALIENATION_COST,
  ALIENATION_PHASE_DAYS,
  ALIENATION_PHASES,
  calcAlienationInitialRate,
  getAvailableAlienationMethods,
  getValidSecondaryAlienationTargets,
} from '@engine/scheme/types/alienation';
import { executeInitiateScheme } from '@engine/interaction/schemeAction';
import type { Character } from '@engine/character/types';

interface SchemeInitFlowProps {
  targetId: string;
  onClose: () => void;
}

type Phase = 'pickType' | 'pickSecondary' | 'pickMethod' | 'confirm' | 'result';

export default function SchemeInitFlow({ targetId, onClose }: SchemeInitFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));
  // 订阅 volatile state（按 execute 契约：弹窗打开期间外部状态变化要触发 useMemo 重算）
  const currentDate = useTurnManager((s) => s.currentDate);
  const schemes = useSchemeStore((s) => s.schemes);
  void currentDate;
  void schemes;

  const [phase, setPhase] = useState<Phase>('pickType');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedSecondaryId, setSelectedSecondaryId] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // 收集所有可显示的计谋类型
  const availableTypes = useMemo(() => {
    if (!player || !target) return [];
    const ctx = buildSchemeContext();
    return getAllSchemeTypes().filter((def) => def.canShow(player, target, ctx));
  }, [player, target]);

  // 拉拢预览
  const curryFavorPreview = useMemo(() => {
    if (!player || !target) return null;
    const ctx = buildSchemeContext();
    return {
      rate: Math.round(calcCurryFavorRate(player, target, ctx)),
      cost: CURRY_FAVOR_COST,
    };
  }, [player, target]);

  // 离间次要目标候选集
  const alienationSecondaries: Character[] = useMemo(() => {
    if (!player || !target) return [];
    if (selectedTypeId !== 'alienation') return [];
    const ctx = buildSchemeContext();
    return getValidSecondaryAlienationTargets(target, player, ctx);
  }, [player, target, selectedTypeId]);

  // 离间方法 + 模糊预览（每个方法的 calcBonus）
  const alienationMethodPreviews = useMemo(() => {
    if (!player || !target || !selectedSecondaryId) return [];
    const ctx = buildSchemeContext();
    const secondary = ctx.characters.get(selectedSecondaryId);
    if (!secondary) return [];
    return getAvailableAlienationMethods().map((m) => {
      const bonus = m.calcBonus(target, secondary, player, ctx);
      const rate = Math.round(calcAlienationInitialRate(player, target, bonus));
      return { method: m, bonus, rate };
    });
  }, [player, target, selectedSecondaryId]);

  if (!playerId || !player || !target) return null;

  const limit = calcSchemeLimit(player.abilities.strategy);
  const activeCount = useSchemeStore.getState().getActiveSchemeCount(playerId);
  const limitFull = activeCount >= limit;

  function handlePickType(typeId: string) {
    setSelectedTypeId(typeId);
    if (typeId === 'curryFavor') {
      setPhase('confirm');
    } else if (typeId === 'alienation') {
      setPhase('pickSecondary');
    }
  }

  function handlePickSecondary(secondaryId: string) {
    setSelectedSecondaryId(secondaryId);
    setPhase('pickMethod');
  }

  function handlePickMethod(methodId: string) {
    setSelectedMethodId(methodId);
    setPhase('confirm');
  }

  function handleConfirm() {
    if (!selectedTypeId) return;
    let rawParams: Record<string, unknown>;
    if (selectedTypeId === 'curryFavor') {
      rawParams = { primaryTargetId: targetId };
    } else if (selectedTypeId === 'alienation') {
      if (!selectedSecondaryId || !selectedMethodId) return;
      rawParams = {
        primaryTargetId: targetId,
        secondaryTargetId: selectedSecondaryId,
        methodId: selectedMethodId,
      };
    } else {
      return;
    }
    const ok = executeInitiateScheme(playerId!, selectedTypeId, rawParams);
    if (!ok) {
      setResultMsg('局势已发生变化，计谋未能发起。');
    } else {
      const def = getSchemeType(selectedTypeId);
      setResultMsg(`${def?.name ?? '计谋'}已发起。`);
    }
    setPhase('result');
  }

  // ── 渲染 ──

  if (phase === 'result') {
    return (
      <Modal size="sm" onOverlayClick={onClose}>
        <ModalHeader title="计谋" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm text-[var(--color-text)]">{resultMsg}</p>
          <Button variant="default" className="w-full py-2 font-bold" onClick={onClose}>
            关闭
          </Button>
        </div>
      </Modal>
    );
  }

  if (phase === 'pickType') {
    return (
      <Modal size="md" onOverlayClick={onClose}>
        <ModalHeader title={`对 ${target.name} 施展计谋`} onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          <div className="text-xs text-[var(--color-text-muted)]">
            谋力：{activeCount}/{limit}
            {limitFull && (
              <span className="text-[var(--color-accent-red)] ml-2">已达上限</span>
            )}
          </div>
          {availableTypes.length === 0 && (
            <div className="text-xs text-[var(--color-text-muted)]">无可用计谋</div>
          )}
          {availableTypes.map((def) => {
            const disabled = limitFull || player.resources.money < def.costMoney;
            return (
              <button
                key={def.id}
                disabled={disabled}
                onClick={() => handlePickType(def.id)}
                className={`flex flex-col items-start gap-1 rounded p-3 border text-left transition-colors ${
                  disabled
                    ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
                    : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)]'
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-xl">{def.icon}</span>
                  <span className="text-sm font-bold text-[var(--color-text)] flex-1">{def.name}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {def.costMoney} 金 · {def.isBasic ? `${def.baseDurationDays} 天` : `${def.phaseCount} × ${def.baseDurationDays} 天`}
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">{def.description}</div>
              </button>
            );
          })}
        </div>
      </Modal>
    );
  }

  // ── 离间：选次要目标 ──
  if (phase === 'pickSecondary' && selectedTypeId === 'alienation') {
    return (
      <Modal size="md" onOverlayClick={onClose}>
        <ModalHeader title="离间 — 选择次要目标" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">
            主目标：<span className="text-[var(--color-text)] font-bold">{target.name}</span>
            <br />
            选择与 {target.name} 有关系的角色作为离间对象：
          </p>
          {alienationSecondaries.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-4">
              {target.name} 没有可被离间的关系对象。
            </div>
          ) : (
            alienationSecondaries.map((c) => (
              <button
                key={c.id}
                onClick={() => handlePickSecondary(c.id)}
                className="flex items-center justify-between rounded px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] text-left"
              >
                <span className="text-sm font-bold text-[var(--color-text)]">{c.name}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{c.title || ''}</span>
              </button>
            ))
          )}
          <div className="flex gap-2 mt-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase('pickType')}>
              返回
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── 离间：选方法 ──
  if (phase === 'pickMethod' && selectedTypeId === 'alienation' && selectedSecondaryId) {
    const secondary = useCharacterStore.getState().characters.get(selectedSecondaryId);
    return (
      <Modal size="md" onOverlayClick={onClose}>
        <ModalHeader title="离间 — 选择手段" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">
            目标：<span className="text-[var(--color-text)] font-bold">{target.name}</span>
            {' ↔ '}
            <span className="text-[var(--color-text)] font-bold">{secondary?.name ?? '?'}</span>
          </p>
          {alienationMethodPreviews.map(({ method, rate }) => (
            <button
              key={method.id}
              onClick={() => handlePickMethod(method.id)}
              className="flex flex-col items-start gap-1 rounded p-3 border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)] text-left"
            >
              <div className="flex items-center gap-2 w-full">
                <span className="text-sm font-bold text-[var(--color-text)] flex-1">{method.name}</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  初始成功率 <span className="text-[var(--color-accent-gold)] font-bold">{rate}%</span>
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">{method.description}</div>
              <div className="text-[11px] text-[var(--color-text-muted)] italic">{method.hint}</div>
            </button>
          ))}
          <div className="flex gap-2 mt-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase('pickSecondary')}>
              返回
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── confirm: 拉拢 ──
  if (phase === 'confirm' && selectedTypeId === 'curryFavor') {
    return (
      <Modal size="sm" onOverlayClick={onClose}>
        <ModalHeader title="发起拉拢" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="text-sm text-[var(--color-text)]">
            目标：<span className="font-bold">{target.name}</span>
          </div>
          {curryFavorPreview && (
            <div className="text-xs text-[var(--color-text-muted)] space-y-1">
              <div>成功率：<span className="text-[var(--color-text)] font-bold">{curryFavorPreview.rate}%</span></div>
              <div>持续：<span className="text-[var(--color-text)]">90 天</span></div>
              <div>花费：<span className="text-[var(--color-text)]">{curryFavorPreview.cost} 金</span></div>
            </div>
          )}
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            通过宴饮、馈赠和私下结交，增进双方好感。<br />
            成功：双方好感各 +25 / +15。失败：仅 -5 好感。
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase('pickType')}>
              返回
            </Button>
            <Button variant="primary" className="flex-1 py-2 font-bold" onClick={handleConfirm}>
              发起
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── confirm: 离间 ──
  if (phase === 'confirm' && selectedTypeId === 'alienation' && selectedSecondaryId && selectedMethodId) {
    const secondary = useCharacterStore.getState().characters.get(selectedSecondaryId);
    const methodPreview = alienationMethodPreviews.find((p) => p.method.id === selectedMethodId);
    return (
      <Modal size="sm" onOverlayClick={onClose}>
        <ModalHeader title="发起离间" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="text-sm text-[var(--color-text)]">
            离间：<span className="font-bold">{target.name}</span> ↔ <span className="font-bold">{secondary?.name ?? '?'}</span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            手段：<span className="text-[var(--color-text)] font-bold">{methodPreview?.method.name ?? '?'}</span>
          </div>
          {methodPreview && (
            <div className="text-xs text-[var(--color-text-muted)] space-y-1">
              <div>初始成功率：<span className="text-[var(--color-text)] font-bold">{methodPreview.rate}%</span></div>
              <div>阶段：<span className="text-[var(--color-text)]">{ALIENATION_PHASES} × {ALIENATION_PHASE_DAYS} 天</span>（共 {ALIENATION_PHASES * ALIENATION_PHASE_DAYS} 天，每阶段成功率 +8）</div>
              <div>花费：<span className="text-[var(--color-text)]">{ALIENATION_COST} 金</span></div>
            </div>
          )}
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            成功：双方互相好感 -30。失败：双方对你各 -40，威望 -20。
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="default" className="flex-1 py-2" onClick={() => setPhase('pickMethod')}>
              返回
            </Button>
            <Button variant="primary" className="flex-1 py-2 font-bold" onClick={handleConfirm}>
              发起
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return null;
}
