// ===== 时代详情弹窗 =====

import React from 'react';
import { useTurnManager } from '@engine/TurnManager';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { Era } from '@engine/types';
import { findEmperorId } from '@engine/official/postQueries';
import { calcLegitimacyOpinion } from '@engine/official/legitimacyCalc';
import { calcRestorationState } from '@engine/systems/eraSystem';

interface EraPopupProps {
  onClose: () => void;
}

const ERA_INFO: Record<string, { label: string; color: string; desc: string }> = {
  [Era.ZhiShi]: {
    label: '治世',
    color: 'var(--color-accent-green)',
    desc: '天下承平，名器稳固。皇帝正统性不自然流失。',
  },
  [Era.WeiShi]: {
    label: '危世',
    color: 'var(--color-accent-gold)',
    desc: '朝纲不振，暗流涌动。皇帝正统性每月 -0.25。',
  },
  [Era.LuanShi]: {
    label: '乱世',
    color: 'var(--color-accent-red)',
    desc: '礼崩乐坏，群雄割据。皇帝正统性每月 -1。',
  },
};

interface Trigger {
  label: string;
  rate: string;
  active: boolean;
}

function getCollapseTriggers(era: Era, emperorBelowExpectation: boolean): { title: string; triggers: Trigger[] } | null {
  if (era === Era.ZhiShi) {
    return {
      title: '衰退进度',
      triggers: [
        { label: '土地兼并', rate: '+1/年', active: true },
        { label: '皇帝正统性不及预期', rate: '+5/年', active: emperorBelowExpectation },
      ],
    };
  }
  if (era === Era.WeiShi) {
    return {
      title: '崩溃进度',
      triggers: [
        { label: '皇帝正统性不及预期', rate: '+5/年', active: emperorBelowExpectation },
        { label: '针对皇帝的独立战争胜利', rate: '+10/场', active: false },
      ],
    };
  }
  return null; // 乱世无崩溃进度
}

function getNextEra(era: Era): string | null {
  if (era === Era.ZhiShi) return '危世';
  if (era === Era.WeiShi) return '乱世';
  return null;
}

/**
 * 中兴诱因列表（仅 WeiShi 下展示）。
 * 两条条件都要求"所有有地直属臣属"都满足，0 有地臣属时两条都不触发（safety guard）。
 */
function getStabilityTriggers(
  era: Era,
  emperorId: string | null,
): { title: string; triggers: Trigger[]; note?: string } | null {
  if (era !== Era.WeiShi) return null;
  if (!emperorId) {
    return {
      title: '中兴进度',
      triggers: [
        { label: '皇位空悬，中兴无从谈起', rate: '—', active: false },
      ],
    };
  }
  const st = calcRestorationState(emperorId);
  if (!st.hasVassals) {
    return {
      title: '中兴进度',
      triggers: [
        { label: '皇帝无有地直属臣属，中兴条件不成立', rate: '—', active: false },
      ],
    };
  }
  return {
    title: '中兴进度',
    triggers: [
      { label: '所有直属臣属均无辟署权', rate: '+10/年', active: st.allNoAppointRight },
      { label: '所有直属臣属均无世袭主岗', rate: '+5/年', active: st.allNoHereditary },
    ],
  };
}

const EraPopup: React.FC<EraPopupProps> = ({ onClose }) => {
  const era = useTurnManager(s => s.era);
  const collapseProgress = useTurnManager(s => s.collapseProgress);
  const stabilityProgress = useTurnManager(s => s.stabilityProgress);

  // 判断皇帝正统性是否低于预期
  const terrStore = useTerritoryStore.getState();
  const emperorId = findEmperorId(terrStore.territories, terrStore.centralPosts);
  let emperorBelowExpectation = false;
  if (emperorId) {
    const emperor = useCharacterStore.getState().getCharacter(emperorId);
    if (emperor) {
      const expectedLeg = terrStore.expectedLegitimacy.get(emperorId) ?? null;
      const legResult = calcLegitimacyOpinion(emperor.resources.legitimacy, expectedLeg);
      if (legResult && legResult.gapValue < 0) {
        emperorBelowExpectation = true;
      }
    }
  }

  const info = ERA_INFO[era];
  const collapse = getCollapseTriggers(era, emperorBelowExpectation);
  const stability = getStabilityTriggers(era, emperorId);
  const nextEra = getNextEra(era);
  const collapsePercent = Math.min(100, Math.floor(collapseProgress));
  const stabilityPercent = Math.min(100, Math.floor(stabilityProgress));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: info.color, color: 'var(--color-bg)' }}
            >
              {info.label}
            </span>
            <span className="text-base font-bold text-[var(--color-text)]">天下大势</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 时代说明 */}
        <p className="text-xs text-[var(--color-text-muted)] mb-4 leading-relaxed">{info.desc}</p>

        {/* 崩溃进度条 */}
        {collapse ? (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">
                {collapse.title}
                <span className="text-[var(--color-text-muted)] font-normal ml-1">→ {nextEra}</span>
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">{collapsePercent}%</span>
            </div>
            <div className="w-full bg-[var(--color-bg)] rounded h-2.5 mb-2">
              <div
                className="h-2.5 rounded transition-all"
                style={{
                  width: `${collapsePercent}%`,
                  backgroundColor: info.color,
                }}
              />
            </div>
            {/* 诱因列表 */}
            <div className="space-y-1">
              {collapse.triggers.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: t.active ? info.color : 'var(--color-border)' }}
                    />
                    <span className={t.active ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}>
                      {t.label}
                    </span>
                  </div>
                  <span className={t.active ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-muted)]'}>
                    {t.rate}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-4 text-xs text-[var(--color-accent-red)] font-bold">
            天下大乱，已无更坏之势。唯有一统方能终结乱世。
          </div>
        )}

        {/* 稳定进度条 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-[var(--color-text)]">
              {era === Era.LuanShi ? '一统进度' : '中兴进度'}
              {era === Era.WeiShi && (
                <span className="text-[var(--color-text-muted)] font-normal ml-1">→ 治世</span>
              )}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">{stabilityPercent}%</span>
          </div>
          <div className="w-full bg-[var(--color-bg)] rounded h-2.5 mb-2">
            <div
              className="h-2.5 rounded transition-all bg-[var(--color-accent-green)]"
              style={{ width: `${stabilityPercent}%` }}
            />
          </div>
          {stability ? (
            <div className="space-y-1">
              {stability.triggers.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: t.active
                          ? 'var(--color-accent-green)'
                          : 'var(--color-border)',
                      }}
                    />
                    <span
                      className={
                        t.active
                          ? 'text-[var(--color-text)]'
                          : 'text-[var(--color-text-muted)]'
                      }
                    >
                      {t.label}
                    </span>
                  </div>
                  <span
                    className={
                      t.active
                        ? 'text-[var(--color-accent-green)]'
                        : 'text-[var(--color-text-muted)]'
                    }
                  >
                    {t.rate}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--color-text-muted)] italic">
              {era === Era.LuanShi ? '须一统天下、重建正朔' : '暂无恢复途径'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EraPopup;
