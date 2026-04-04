// ===== 战争悬浮图标 + 详情面板 =====
// 右下角旌旗图标，点击展开战争详情。

import React, { useState, useMemo } from 'react';
import { useWarStore } from '@engine/military/WarStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTurnManager } from '@engine/TurnManager';
import { CASUS_BELLI_NAMES } from '@engine/military/types';
import type { War } from '@engine/military/types';
import { isWarParticipant, isOnAttackerSide, isWarLeader } from '@engine/military/warParticipantUtils';
import { settleWar } from '@engine/military/warSettlement';
import { calcPeaceAcceptance } from '@engine/military/warCalc';
import { calcPersonality } from '@engine/character/personalityUtils';
import { executeWithdrawWar } from '@engine/interaction/withdrawWarAction';
import { diffMonths } from '@engine/dateUtils';
import { Button } from './base';

// ── 头像组件 ─────────────────────────────────────────────

function Avatar({ charId, size = 'md' }: { charId: string; size?: 'sm' | 'md' }) {
  const char = useCharacterStore((s) => s.characters.get(charId));
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div
      className={`${dim} rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border)] flex items-center justify-center font-bold text-[var(--color-text)]`}
      title={char?.name}
    >
      {char?.name?.charAt(0) ?? '?'}
    </div>
  );
}

// ── 战分进度条 ────────────────────────────────────────────

function WarScoreBar({ warScore }: { warScore: number }) {
  // warScore: -100~+100 (攻方原始值)
  // 进度条从中间出发：攻方正 → 向右红色，守方正 → 向左绿色
  // 但这里我们用"攻方向右"的绝对视角
  const pct = Math.abs(warScore);
  const isAttackerAdvantage = warScore > 0;

  return (
    <div className="relative h-3 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] overflow-hidden">
      {/* 中线 */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--color-border)] z-10" />
      {/* 填充条 */}
      {pct > 0 && (
        <div
          className="absolute top-0 bottom-0 transition-all duration-300"
          style={{
            width: `${pct / 2}%`,
            left: isAttackerAdvantage ? '50%' : undefined,
            right: !isAttackerAdvantage ? '50%' : undefined,
            background: isAttackerAdvantage
              ? 'linear-gradient(90deg, rgba(192,57,43,0.3), rgba(192,57,43,0.8))'
              : 'linear-gradient(270deg, rgba(39,174,96,0.3), rgba(39,174,96,0.8))',
          }}
        />
      )}
      {/* 数字 */}
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[var(--color-text)] z-20">
        {warScore > 0 ? '+' : ''}{Math.round(warScore)}%
      </div>
    </div>
  );
}

// ── 战争详情面板 ──────────────────────────────────────────

function WarDetailPanel({ war, playerId, onClose }: {
  war: War;
  playerId: string;
  onClose: () => void;
}) {
  const characters = useCharacterStore((s) => s.characters);
  const armies = useMilitaryStore((s) => s.armies);
  const battalions = useMilitaryStore((s) => s.battalions);

  const attacker = characters.get(war.attackerId);
  const defender = characters.get(war.defenderId);
  const isAttacker = isOnAttackerSide(playerId, war);
  const myScore = isAttacker ? war.warScore : -war.warScore;
  const amLeader = isWarLeader(playerId, war);

  // 双方总兵力
  const calcSideStrength = (ids: string[]) => {
    let total = 0;
    for (const army of armies.values()) {
      if (ids.includes(army.ownerId)) {
        for (const batId of army.battalionIds) {
          const bat = battalions.get(batId);
          if (bat) total += bat.currentStrength;
        }
      }
    }
    return total;
  };

  const attackerIds = [war.attackerId, ...war.attackerParticipants];
  const defenderIds = [war.defenderId, ...war.defenderParticipants];
  const attackerStrength = calcSideStrength(attackerIds);
  const defenderStrength = calcSideStrength(defenderIds);

  // 和谈判定（仅领袖可用）
  const canForce = myScore >= 100;
  const canSurrender = myScore <= -100;
  const currentDate = useTurnManager.getState().currentDate;
  const warMonths = diffMonths(war.startDate, currentDate);

  const enemyId = isAttacker ? war.defenderId : war.attackerId;
  const enemy = characters.get(enemyId);
  let peaceResult: ReturnType<typeof calcPeaceAcceptance> | null = null;
  if (amLeader && enemy && !canForce && !canSurrender) {
    const enemyPersonality = calcPersonality(enemy);
    peaceResult = calcPeaceAcceptance({
      proposerScore: isAttacker ? war.warScore : -war.warScore,
      warDurationMonths: warMonths,
      targetPersonality: {
        compassion: enemyPersonality.compassion,
        boldness: enemyPersonality.boldness,
        honor: enemyPersonality.honor,
        greed: enemyPersonality.greed,
      },
    });
  }

  return (
    <div
      className="absolute bottom-14 right-0 w-80 bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden z-20"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 头部：战争理由 */}
      <div className="px-4 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <span className="text-xs font-bold text-[var(--color-accent-gold)]">
          {CASUS_BELLI_NAMES[war.casusBelli]}
        </span>
        <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm">x</button>
      </div>

      {/* 双方对阵 */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          {/* 攻方 */}
          <div className="flex flex-col items-center flex-1 min-w-0">
            <Avatar charId={war.attackerId} />
            <span className="text-xs font-bold text-[var(--color-text)] mt-1 truncate max-w-full">
              {attacker?.name ?? '?'}
            </span>
            <span className="text-[10px] text-[var(--color-accent-red)]">攻</span>
          </div>

          {/* 战分条 */}
          <div className="flex-[2] min-w-0">
            <WarScoreBar warScore={war.warScore} />
          </div>

          {/* 守方 */}
          <div className="flex flex-col items-center flex-1 min-w-0">
            <Avatar charId={war.defenderId} />
            <span className="text-xs font-bold text-[var(--color-text)] mt-1 truncate max-w-full">
              {defender?.name ?? '?'}
            </span>
            <span className="text-[10px] text-[var(--color-accent-green)]">守</span>
          </div>
        </div>

        {/* 兵力 */}
        <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] mb-1">
          <span>{attackerStrength.toLocaleString()} 兵</span>
          <span>{defenderStrength.toLocaleString()} 兵</span>
        </div>

        {/* 盟友头像 */}
        {(war.attackerParticipants.length > 0 || war.defenderParticipants.length > 0) && (
          <div className="flex justify-between mb-2">
            <div className="flex gap-0.5 flex-wrap">
              {war.attackerParticipants.map(id => (
                <Avatar key={id} charId={id} size="sm" />
              ))}
            </div>
            <div className="flex gap-0.5 flex-wrap justify-end">
              {war.defenderParticipants.map(id => (
                <Avatar key={id} charId={id} size="sm" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="px-4 py-2 border-t border-[var(--color-border)] flex gap-2">
        {amLeader ? (
          <>
            {canForce && (
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => settleWar(war.id, isAttacker ? 'attackerWin' : 'defenderWin')}
              >
                强制投降
              </Button>
            )}
            {canSurrender && (
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={() => settleWar(war.id, isAttacker ? 'defenderWin' : 'attackerWin')}
              >
                投降
              </Button>
            )}
            {!canForce && !canSurrender && peaceResult && (
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                disabled={!peaceResult.accept}
                title={Object.entries(peaceResult.breakdown).map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`).join('\n')}
                onClick={() => { if (peaceResult!.accept) settleWar(war.id, 'whitePeace'); }}
              >
                和谈 ({peaceResult.score}/{peaceResult.threshold})
              </Button>
            )}
          </>
        ) : (
          <Button
            variant="danger"
            size="sm"
            className="flex-1"
            onClick={() => executeWithdrawWar(playerId, war.id)}
          >
            退出战争（好感-20）
          </Button>
        )}
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────

const WarOverlay: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [warIndex, setWarIndex] = useState(0);

  const playerId = useCharacterStore((s) => s.playerId);
  const wars = useWarStore((s) => s.wars);

  const activeWars = useMemo(() => {
    if (!playerId) return [];
    return Array.from(wars.values()).filter(
      w => w.status === 'active' && isWarParticipant(playerId, w),
    );
  }, [wars, playerId]);

  if (activeWars.length === 0 || !playerId) return null;

  const safeIndex = Math.min(warIndex, activeWars.length - 1);
  const war = activeWars[safeIndex];
  const isAttacker = isOnAttackerSide(playerId, war);
  const myScore = isAttacker ? war.warScore : -war.warScore;
  const scoreColor = myScore > 0 ? 'text-[var(--color-accent-green)]' : myScore < 0 ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-muted)]';

  return (
    <div className="relative">
      {/* 悬浮图标：虎符融入背景，无边框卡片 */}
      <div
        className="flex flex-col items-center cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
        title="战争详情"
      >
        <div className="relative">
          <img
            src={`${import.meta.env.BASE_URL}icons/hufu.png`}
            alt="虎符"
            className="w-[88px] h-[88px] object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] group-hover:drop-shadow-[0_2px_10px_rgba(212,168,67,0.5)] transition-all group-hover:scale-105"
            draggable={false}
          />
          {/* 多场战争角标 */}
          {activeWars.length > 1 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-accent-red)] text-white text-[9px] font-bold flex items-center justify-center shadow">
              {activeWars.length}
            </div>
          )}
        </div>
        <span className={`text-[10px] font-bold ${scoreColor} drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}>
          {myScore > 0 ? '+' : ''}{Math.round(myScore)}%
        </span>
      </div>

      {/* 展开面板 */}
      {expanded && (
        <>
          {/* 背景遮罩（点击关闭） */}
          <div className="fixed inset-0 z-10" onClick={() => setExpanded(false)} />

          {/* 多场战争切换 */}
          {activeWars.length > 1 && (
            <div className="absolute bottom-14 right-0 w-80 flex justify-center gap-2 mb-1 z-20">
              <button
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                onClick={(e) => { e.stopPropagation(); setWarIndex(Math.max(0, safeIndex - 1)); }}
                disabled={safeIndex === 0}
              >
                &larr; 上一场
              </button>
              <span className="text-xs text-[var(--color-text-muted)]">
                {safeIndex + 1} / {activeWars.length}
              </span>
              <button
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                onClick={(e) => { e.stopPropagation(); setWarIndex(Math.min(activeWars.length - 1, safeIndex + 1)); }}
                disabled={safeIndex === activeWars.length - 1}
              >
                下一场 &rarr;
              </button>
            </div>
          )}

          <WarDetailPanel
            war={war}
            playerId={playerId}
            onClose={() => setExpanded(false)}
          />
        </>
      )}
    </div>
  );
};

export default WarOverlay;
