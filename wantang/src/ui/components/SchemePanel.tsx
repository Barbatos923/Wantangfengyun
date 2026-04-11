// ===== 计谋总览面板 =====
//
// 从 SideMenu 「计谋」按钮打开。展示玩家活跃计谋列表 + 谋力上限。
// v1 简化：直接列表展示，无二级详情弹窗（批次 3 加 SchemeDetailPanel）。

import { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import {
  useSchemeStore,
  calcSchemeLimit,
  getSchemeType,
  getFuzzySuccess,
  type FuzzySuccess,
  type SchemeInstance,
} from '@engine/scheme';
import { cancelScheme } from '@engine/interaction/schemeAction';
import { toAbsoluteDay } from '@engine/dateUtils';
import SchemeDetailPanel from './SchemeDetailPanel';

interface SchemePanelProps {
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

export default function SchemePanel({ onClose }: SchemePanelProps) {
  // 订阅 volatile state
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const characters = useCharacterStore((s) => s.characters);
  const schemes = useSchemeStore((s) => s.schemes);
  const currentDate = useTurnManager((s) => s.currentDate);
  const [detailSchemeId, setDetailSchemeId] = useState<string | null>(null);

  if (!playerId || !player) return null;

  // 收集玩家活跃计谋
  const initiatorIndex = useSchemeStore.getState().initiatorIndex;
  const myActive: SchemeInstance[] = [];
  const ids = initiatorIndex.get(playerId);
  if (ids) {
    for (const id of ids) {
      const s = schemes.get(id);
      if (s && s.status === 'active') myActive.push(s);
    }
  }

  const limit = calcSchemeLimit(player.abilities.strategy);
  const currentDay = toAbsoluteDay(currentDate);

  function getName(charId: string): string {
    return characters.get(charId)?.name ?? '?';
  }

  function getDaysLeft(scheme: SchemeInstance): number {
    const startDay = toAbsoluteDay(scheme.startDate);
    const totalDays = scheme.phase.phaseDuration * scheme.phase.total;
    const elapsed = currentDay - startDay;
    return Math.max(0, totalDays - elapsed);
  }

  return (
    <Modal size="lg" onOverlayClick={onClose}>
      <ModalHeader title="计谋" onClose={onClose} />
      <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        {/* 顶部状态栏 */}
        <div className="rounded p-3 bg-[var(--color-bg-surface)] border border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-[var(--color-text)]">{player.name}</div>
              <div className="text-xs text-[var(--color-text-muted)]">
                谋略 {player.abilities.strategy} · 外交 {player.abilities.diplomacy}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[var(--color-text-muted)]">谋力</div>
              <div className="text-lg font-bold text-[var(--color-accent-gold)]">
                {myActive.length} / {limit}
              </div>
            </div>
          </div>
        </div>

        {/* 活跃计谋列表 */}
        {myActive.length === 0 ? (
          <div className="text-sm text-[var(--color-text-muted)] text-center py-6">
            暂无进行中的计谋。<br />
            <span className="text-xs">在角色面板对其他人物点击"计谋"按钮发起。</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {myActive.map((s) => {
              const def = getSchemeType(s.schemeTypeId);
              // 用快照里冻结的 spymasterStrategy 做观察方属性，而不是当前 player.strategy。
              // 理由：① 与 initInstance 时冻结的口径一致（拉拢用 diplomacy，离间用 strategy）
              //       ② 兼容未来谋主系统（spymaster 是别人时观察方就是 spymaster）
              const fuzzy = getFuzzySuccess(
                s.snapshot.spymasterStrategy,
                s.snapshot.targetSpymasterStrategy,
                s.currentSuccessRate,
              );
              const daysLeft = getDaysLeft(s);
              const phaseLabel = s.phase.total > 1 ? `阶段 ${s.phase.current}/${s.phase.total}` : '';
              return (
                <button
                  key={s.id}
                  onClick={() => setDetailSchemeId(s.id)}
                  className="rounded p-3 bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{def?.icon ?? '🎯'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[var(--color-text)]">
                        {def?.name ?? s.schemeTypeId}
                        <span className="text-[var(--color-text-muted)] font-normal ml-2">
                          → {getName(s.primaryTargetId)}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        {phaseLabel && <span className="mr-2">{phaseLabel}</span>}
                        <span>剩余 {daysLeft} 天</span>
                        <span className="ml-2">
                          成功率：<span className="text-[var(--color-text)] font-bold">{fuzzyLabel(fuzzy)}</span>
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelScheme(s.id);
                      }}
                      title="取消计谋（无费用退还）"
                    >
                      取消
                    </Button>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {detailSchemeId && (
        <SchemeDetailPanel schemeId={detailSchemeId} onClose={() => setDetailSchemeId(null)} />
      )}
    </Modal>
  );
}
