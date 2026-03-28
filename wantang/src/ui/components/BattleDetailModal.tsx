// ===== 野战详情弹窗 =====

import React from 'react';
import type { GameEvent } from '@engine/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { strategyMap, pursuitStrategyMap } from '@data/strategies';

interface PhaseResult {
  phase: string;
  attackerStrategyId: string;
  defenderStrategyId: string;
  attackerLosses: number;
  defenderLosses: number;
  result: 'attackerWin' | 'defenderWin' | 'draw';
  attackerNarrative?: string;
  defenderNarrative?: string;
  narrative?: string;
}

interface BattleResult {
  phases: PhaseResult[];
  overallResult: 'attackerWin' | 'defenderWin';
  totalAttackerLosses: number;
  totalDefenderLosses: number;
  warScoreChange: number;
}

interface BattlePayload {
  battleResult: BattleResult;
  attackerCommanderId: string;
  defenderCommanderId: string;
  attackerArmyIds: string[];
  defenderArmyIds: string[];
}

interface Props {
  event: GameEvent;
  onClose: () => void;
}

const phaseLabel: Record<string, string> = {
  deploy: '列阵',
  clash: '交锋',
  decisive: '决胜',
  pursuit: '追击',
};

const BattleDetailModal: React.FC<Props> = ({ event, onClose }) => {
  const payload = event.payload as BattlePayload | undefined;
  const characters = useCharacterStore((s) => s.characters);
  const playerId = useCharacterStore((s) => s.playerId);
  const armies = useMilitaryStore((s) => s.armies);
  const battalions = useMilitaryStore((s) => s.battalions);
  const territories = useTerritoryStore((s) => s.territories);

  if (!payload || !playerId) return null;

  const { battleResult, attackerCommanderId, defenderCommanderId, attackerArmyIds, defenderArmyIds } = payload;

  // actors[0] = 进攻方所有者，actors[1] = 防守方所有者
  const isPlayerAttacker = event.actors[0] === playerId;

  const myCommanderId = isPlayerAttacker ? attackerCommanderId : defenderCommanderId;
  const enemyCommanderId = isPlayerAttacker ? defenderCommanderId : attackerCommanderId;
  const myArmyIds = isPlayerAttacker ? attackerArmyIds : defenderArmyIds;
  const enemyArmyIds = isPlayerAttacker ? defenderArmyIds : attackerArmyIds;
  const myTotalLosses = isPlayerAttacker ? battleResult.totalAttackerLosses : battleResult.totalDefenderLosses;
  const enemyTotalLosses = isPlayerAttacker ? battleResult.totalDefenderLosses : battleResult.totalAttackerLosses;

  const myCommander = characters.get(myCommanderId);
  const enemyCommander = characters.get(enemyCommanderId);

  const isVictory =
    (isPlayerAttacker && battleResult.overallResult === 'attackerWin') ||
    (!isPlayerAttacker && battleResult.overallResult === 'defenderWin');

  const calcTroops = (armyIds: string[]): number =>
    armyIds.reduce((sum, id) => {
      const army = armies.get(id);
      return sum + (army ? getArmyStrength(army, battalions) : 0);
    }, 0);

  const myTroops = calcTroops(myArmyIds);
  const enemyTroops = calcTroops(enemyArmyIds);

  const terrId = event.territories[0] ?? '';
  const terrName = territories.get(terrId)?.name ?? terrId;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-5 max-w-2xl w-full mx-4 shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-accent-gold)]">
              ⚔ {event.date.year}年{event.date.month}月 · {terrName}之战
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{event.description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg ml-4 shrink-0"
          >
            ×
          </button>
        </div>

        {/* 双方部队 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* 我方 */}
          <div className="bg-[var(--color-bg-surface)] rounded p-3 border border-[var(--color-border)]">
            <div className="text-xs font-bold text-[var(--color-accent-gold)] mb-2">
              我方（{isPlayerAttacker ? '进攻' : '防守'}）
            </div>
            <div className="text-xs text-[var(--color-text)] mb-1">
              行营都统：{myCommander?.name ?? '—'}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mb-1">
              {myArmyIds.map((id) => armies.get(id)?.name).filter(Boolean).join('、') || '—'}
            </div>
            <div className="text-xs text-[var(--color-text)]">
              战前兵力：{(myTroops + myTotalLosses).toLocaleString()}
              <span className="text-[var(--color-text-muted)]"> · </span>
              剩余兵力：{myTroops.toLocaleString()}
            </div>
          </div>

          {/* 敌方 */}
          <div className="bg-[var(--color-bg-surface)] rounded p-3 border border-[var(--color-border)]">
            <div className="text-xs font-bold text-[var(--color-accent-red,#e74c3c)] mb-2">
              敌方（{isPlayerAttacker ? '防守' : '进攻'}）
            </div>
            <div className="text-xs text-[var(--color-text)] mb-1">
              行营都统：{enemyCommander?.name ?? '—'}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mb-1">
              {enemyArmyIds.map((id) => armies.get(id)?.name).filter(Boolean).join('、') || '—'}
            </div>
            <div className="text-xs text-[var(--color-text)]">
              战前兵力：{(enemyTroops + enemyTotalLosses).toLocaleString()}
              <span className="text-[var(--color-text-muted)]"> · </span>
              剩余兵力：{enemyTroops.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 战斗过程 */}
        <div className="mb-4">
          <div className="text-xs font-bold text-[var(--color-text-muted)] mb-2">战斗过程</div>
          <div className="space-y-2">
            {battleResult.phases.map((phase, i) => {
              const myStrategyId = isPlayerAttacker ? phase.attackerStrategyId : phase.defenderStrategyId;
              const enemyStrategyId = isPlayerAttacker ? phase.defenderStrategyId : phase.attackerStrategyId;
              const getStrategyName = (id: string) =>
                strategyMap.get(id)?.name ?? pursuitStrategyMap.get(id)?.name ?? id;
              const myStrategy = getStrategyName(myStrategyId);
              const enemyStrategy = getStrategyName(enemyStrategyId);
              const myLosses = isPlayerAttacker ? phase.attackerLosses : phase.defenderLosses;
              const enemyLosses = isPlayerAttacker ? phase.defenderLosses : phase.attackerLosses;
              const phaseWinner =
                phase.result === 'draw'
                  ? '平局'
                  : (isPlayerAttacker && phase.result === 'attackerWin') ||
                    (!isPlayerAttacker && phase.result === 'defenderWin')
                  ? '我方胜'
                  : '敌方胜';
              const phaseWinColor =
                phase.result === 'draw'
                  ? 'text-[var(--color-text-muted)]'
                  : phaseWinner === '我方胜'
                  ? 'text-[var(--color-accent-gold)]'
                  : 'text-[var(--color-accent-red,#e74c3c)]';

              return (
                <div
                  key={i}
                  className="bg-[var(--color-bg-surface)] rounded p-3 border border-[var(--color-border)]"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[var(--color-text)]">
                      {phaseLabel[phase.phase] ?? phase.phase}
                    </span>
                    <span className={`text-xs font-bold ${phaseWinColor}`}>{phaseWinner}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-1.5">
                    <div>
                      <span className="text-[var(--color-text-muted)]">策略 </span>
                      <span className="text-[var(--color-text)]">{myStrategy}</span>
                      <span className="text-[var(--color-text-muted)]"> · 杀敌 </span>
                      <span className="text-[var(--color-accent-gold)]">{enemyLosses.toLocaleString()}</span>
                      <span className="text-[var(--color-text-muted)]">，损失 </span>
                      <span className="text-[var(--color-accent-red,#e74c3c)]">{myLosses.toLocaleString()}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[var(--color-text-muted)]">策略 </span>
                      <span className="text-[var(--color-text)]">{enemyStrategy}</span>
                      <span className="text-[var(--color-text-muted)]"> · 杀敌 </span>
                      <span className="text-[var(--color-accent-gold)]">{myLosses.toLocaleString()}</span>
                      <span className="text-[var(--color-text-muted)]">，损失 </span>
                      <span className="text-[var(--color-accent-red,#e74c3c)]">{enemyLosses.toLocaleString()}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] italic">
                    {(isPlayerAttacker ? phase.attackerNarrative : phase.defenderNarrative) ?? phase.narrative ?? ''}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 战斗结果 */}
        <div
          className={`rounded p-3 border ${
            isVictory
              ? 'border-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg-surface)]'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[var(--color-text)]">战斗结果</span>
            <span
              className={`text-sm font-bold ${
                isVictory
                  ? 'text-[var(--color-accent-gold)]'
                  : 'text-[var(--color-accent-red,#e74c3c)]'
              }`}
            >
              {isVictory ? '获胜' : '败退'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-[var(--color-text-muted)]">我方伤亡</div>
              <div className="text-[var(--color-accent-red,#e74c3c)] font-bold">
                {myTotalLosses.toLocaleString()}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[var(--color-text-muted)]">战争分数</div>
              <div className="text-[var(--color-accent-gold)] font-bold">
                {isVictory ? '+' : '-'}{Math.abs(battleResult.warScoreChange)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[var(--color-text-muted)]">敌方伤亡</div>
              <div className="text-[var(--color-text)] font-bold">
                {enemyTotalLosses.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BattleDetailModal;
