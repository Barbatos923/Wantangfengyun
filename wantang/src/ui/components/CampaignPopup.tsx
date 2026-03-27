// ===== 行营指令弹窗 =====

import React, { useState } from 'react';
import { useWarStore } from '@engine/military/WarStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import type { Campaign } from '@engine/military/types';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { findPath, getMusteringTime } from '@engine/military/marchCalc';
import { drawStrategies } from '@engine/military/battleEngine';
import { positionMap } from '@data/positions';
import { ALL_STRATEGIES, PURSUIT_STRATEGIES } from '@data/strategies';
import type { BattlePhase, StrategyDef } from '@data/strategies';

interface CampaignPopupProps {
  campaignId: string;
  onClose: () => void;
}

const CampaignPopup: React.FC<CampaignPopupProps> = ({ campaignId, onClose }) => {
  const [mode, setMode] = useState<'main' | 'march' | 'addArmy' | 'removeArmy' | 'tactics' | 'commander'>('main');
  const [marchTarget, setMarchTarget] = useState('');
  const [pathError, setPathError] = useState('');
  const [tacticsCache, setTacticsCache] = useState<Map<string, StrategyDef[]> | null>(null);

  const campaign = useWarStore((s) => s.campaigns.get(campaignId));
  const war = useWarStore((s) => campaign ? s.wars.get(campaign.warId) : undefined);
  const territories = useTerritoryStore((s) => s.territories);
  const armies = useMilitaryStore((s) => s.armies);
  const battalions = useMilitaryStore((s) => s.battalions);
  const characters = useCharacterStore((s) => s.characters);
  const playerId = useCharacterStore((s) => s.playerId);

  if (!campaign || !playerId) return null;
  const isOwner = campaign.ownerId === playerId;

  const location = territories.get(campaign.locationId);
  const commander = characters.get(campaign.commanderId);

  // 行营总兵力
  let totalTroops = 0;
  for (const armyId of campaign.armyIds) {
    const army = armies.get(armyId);
    if (army) totalTroops += getArmyStrength(army, battalions);
  }

  // 行军目标候选：战时=敌方州，和平=所有州
  const marchTargetZhou: { id: string; name: string }[] = [];
  if (war) {
    const enemyId = war.attackerId === playerId ? war.defenderId : war.attackerId;
    for (const t of territories.values()) {
      if (t.tier !== 'zhou') continue;
      const mainPost = t.posts.find((p) => {
        const tpl = positionMap.get(p.templateId);
        return tpl?.grantsControl === true;
      });
      if (mainPost?.holderId === enemyId) {
        marchTargetZhou.push({ id: t.id, name: t.name });
      }
    }
  } else {
    // 和平行营：可以移动到任何州
    for (const t of territories.values()) {
      if (t.tier !== 'zhou' && t.id !== campaign.locationId) continue;
      if (t.tier === 'zhou') marchTargetZhou.push({ id: t.id, name: t.name });
    }
  }

  // 所有行营中已编入的军队ID
  const allCampaignArmyIds = new Set<string>();
  for (const c of useWarStore.getState().campaigns.values()) {
    for (const aid of c.armyIds) allCampaignArmyIds.add(aid);
    for (const ia of c.incomingArmies) allCampaignArmyIds.add(ia.armyId);
  }

  // 玩家未编入任何行营的军
  const availableArmies = Array.from(armies.values()).filter(
    (a) => a.ownerId === playerId && !allCampaignArmyIds.has(a.id),
  );

  const handleMarch = () => {
    if (!marchTarget) return;
    const path = findPath(campaign.locationId, marchTarget, playerId, territories);
    if (!path) {
      setPathError('无法到达该目标（可能被关隘阻挡）');
      return;
    }
    useWarStore.getState().setCampaignTarget(campaignId, marchTarget, path);
    onClose();
  };

  const handleAddArmy = (armyId: string) => {
    const army = armies.get(armyId);
    if (!army) return;
    const turnsLeft = getMusteringTime(army.locationId, campaign.locationId, territories);
    if (turnsLeft === 0) {
      // 同道，立即加入
      const updated = [...campaign.armyIds, armyId];
      useWarStore.getState().updateCampaign(campaignId, { armyIds: updated });
    } else {
      // 需要时间赶来
      const updatedIncoming = [...campaign.incomingArmies, { armyId, turnsLeft }];
      useWarStore.getState().updateCampaign(campaignId, { incomingArmies: updatedIncoming });
    }
  };

  const handleRemoveArmy = (armyId: string) => {
    const updated = campaign.armyIds.filter((id) => id !== armyId);
    useWarStore.getState().updateCampaign(campaignId, { armyIds: updated });
  };

  const handleDisband = () => {
    useWarStore.getState().disbandCampaign(campaignId);
    onClose();
  };

  const statusLabels: Record<Campaign['status'], string> = {
    mustering: '集结中',
    marching: '行军中',
    idle: '待命',
    sieging: '围城中',
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-4 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-accent-gold)]">
              行营 · {location?.name ?? campaign.locationId}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              都统 {commander?.name ?? '无'} · {statusLabels[campaign.status]} · {totalTroops.toLocaleString()}兵
              {campaign.status === 'sieging' && (() => {
                const siege = Array.from(useWarStore.getState().sieges.values()).find((s) => s.campaignId === campaign.id);
                return siege ? (
                  <span className="text-[var(--color-accent-gold)]"> · 围城 {Math.floor(siege.progress)}%</span>
                ) : null;
              })()}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg">×</button>
        </div>

        {/* 编入军队列表 */}
        <div className="mb-3 text-xs">
          <span className="text-[var(--color-text-muted)]">编入军队：</span>
          {campaign.armyIds.map((armyId) => {
            const army = armies.get(armyId);
            return army ? (
              <span key={armyId} className="inline-block mr-1.5 text-[var(--color-text)]">
                {army.name}
              </span>
            ) : null;
          })}
          {campaign.incomingArmies.length > 0 && (
            <>
              <br />
              <span className="text-[var(--color-text-muted)]">赶赴中：</span>
              {campaign.incomingArmies.map((ia) => {
                const army = armies.get(ia.armyId);
                return army ? (
                  <span key={ia.armyId} className="inline-block mr-1.5 text-[var(--color-accent-gold)]">
                    {army.name}（{ia.turnsLeft}回合）
                  </span>
                ) : null;
              })}
            </>
          )}
        </div>

        {/* 主菜单（仅自己的行营可操作） */}
        {mode === 'main' && !isOwner && (
          <p className="text-xs text-[var(--color-text-muted)] py-2">这是敌方行营，无法操作</p>
        )}
        {mode === 'main' && isOwner && (
          <div className="space-y-1.5">
            {campaign.status === 'idle' && (
              <button
                onClick={() => { setMode('march'); setMarchTarget(''); setPathError(''); }}
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
              >
                ⚔ 行军
              </button>
            )}
            <button
              onClick={() => setMode('addArmy')}
              className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
            >
              + 召集军队
            </button>
            {campaign.armyIds.length > 0 && (
              <button
                onClick={() => setMode('removeArmy')}
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
              >
                − 遣散军队
              </button>
            )}
            {campaign.commanderId === playerId && (
              <button
                onClick={() => {
                  const commanderChar = characters.get(campaign.commanderId);
                  if (commanderChar) {
                    const milState = useMilitaryStore.getState();
                    const cache = new Map<string, StrategyDef[]>();
                    for (const phase of ['deploy', 'clash', 'decisive'] as BattlePhase[]) {
                      cache.set(phase, drawStrategies(commanderChar, phase, campaign.armyIds, milState.armies, milState.battalions));
                    }
                    setTacticsCache(cache);
                  }
                  setMode('tactics');
                }}
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
              >
                📋 战术预设
              </button>
            )}
            <button
              onClick={() => setMode('commander')}
              className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
            >
              👤 更换都统
            </button>
            <button
              onClick={handleDisband}
              className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-accent-red,#e74c3c)] hover:border-[var(--color-accent-red,#e74c3c)] transition-colors"
            >
              ✕ 解散行营
            </button>
          </div>
        )}

        {/* 行军目标选择 */}
        {mode === 'march' && (
          <div className="space-y-2">
            <select
              className="w-full px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-xs focus:outline-none focus:border-[var(--color-accent-gold)]"
              value={marchTarget}
              onChange={(e) => { setMarchTarget(e.target.value); setPathError(''); }}
            >
              <option value="">-- 选择目标州 --</option>
              {marchTargetZhou.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
            {pathError && <p className="text-xs text-[var(--color-accent-red,#e74c3c)]">{pathError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setMode('main')} className="px-3 py-1 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">返回</button>
              <button
                disabled={!marchTarget}
                onClick={handleMarch}
                className="px-3 py-1 rounded border border-[var(--color-accent-gold)] text-xs font-bold text-[var(--color-accent-gold)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                出发
              </button>
            </div>
          </div>
        )}

        {/* 召集军队 */}
        {mode === 'addArmy' && (
          <div className="space-y-1.5">
            {availableArmies.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] py-2">无可用军队</p>
            ) : (
              availableArmies.map((army) => {
                const strength = getArmyStrength(army, battalions);
                return (
                  <button
                    key={army.id}
                    onClick={() => handleAddArmy(army.id)}
                    className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text)] hover:border-[var(--color-accent-gold)] transition-colors"
                  >
                    {army.name}（{strength.toLocaleString()}兵 · {territories.get(army.locationId)?.name}）
                  </button>
                );
              })
            )}
            <button onClick={() => setMode('main')} className="w-full px-3 py-1 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">返回</button>
          </div>
        )}

        {/* 遣散军队 */}
        {mode === 'removeArmy' && (
          <div className="space-y-1.5">
            {campaign.armyIds.map((armyId) => {
              const army = armies.get(armyId);
              if (!army) return null;
              const strength = getArmyStrength(army, battalions);
              return (
                <button
                  key={armyId}
                  onClick={() => handleRemoveArmy(armyId)}
                  className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-accent-red,#e74c3c)] hover:border-[var(--color-accent-red,#e74c3c)] transition-colors"
                >
                  遣散 {army.name}（{strength.toLocaleString()}兵）
                </button>
              );
            })}
            <button onClick={() => setMode('main')} className="w-full px-3 py-1 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">返回</button>
          </div>
        )}

        {/* 战术预设 */}
        {mode === 'tactics' && (() => {
          const phases: { key: 'deploy' | 'clash' | 'decisive'; label: string }[] = [
            { key: 'deploy', label: '列阵' },
            { key: 'clash', label: '交锋' },
            { key: 'decisive', label: '决胜' },
          ];

          return (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-muted)]">为每个阶段预设策略，未预设则由都统自动选择</p>
              {phases.map(({ key, label }) => {
                const candidates = tacticsCache?.get(key) ?? [];
                const currentId = campaign.phaseStrategies[key];
                return (
                  <div key={key}>
                    <div className="text-xs font-bold text-[var(--color-text-muted)] mb-1">{label}阶段</div>
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          const updated = { ...campaign.phaseStrategies, [key]: undefined };
                          useWarStore.getState().updateCampaign(campaignId, { phaseStrategies: updated });
                        }}
                        className={`w-full px-2 py-1 rounded border text-xs text-left transition-colors ${
                          !currentId
                            ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]'
                            : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)]'
                        }`}
                      >
                        自动选择
                      </button>
                      {candidates.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            const updated = { ...campaign.phaseStrategies, [key]: s.id };
                            useWarStore.getState().updateCampaign(campaignId, { phaseStrategies: updated });
                          }}
                          className={`w-full px-2 py-1 rounded border text-xs text-left transition-colors ${
                            currentId === s.id
                              ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]'
                              : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent-gold)]'
                          }`}
                        >
                          <span className="font-bold">{s.name}</span>
                          <span className="text-[var(--color-text-muted)]"> · 基础{s.basePower} · 依赖{s.abilityDependency}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* 追击策略 */}
              <div>
                <div className="text-xs font-bold text-[var(--color-text-muted)] mb-1">追击阶段</div>
                <div className="space-y-1">
                  {PURSUIT_STRATEGIES.filter((s) => s.side === 'winner').map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        const updated = { ...campaign.phaseStrategies, pursuit: s.id };
                        useWarStore.getState().updateCampaign(campaignId, { phaseStrategies: updated });
                      }}
                      className={`w-full px-2 py-1 rounded border text-xs text-left transition-colors ${
                        campaign.phaseStrategies.pursuit === s.id
                          ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]'
                          : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent-gold)]'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => setMode('main')} className="w-full px-3 py-1 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">返回</button>
            </div>
          );
        })()}

        {/* 更换都统 */}
        {mode === 'commander' && (() => {
          // 候选人：玩家自己 + 行营内各军的兵马使
          const candidates: { id: string; name: string; military: number }[] = [];
          const seen = new Set<string>();
          // 玩家自己
          if (playerId) {
            const player = characters.get(playerId);
            if (player) {
              candidates.push({ id: playerId, name: player.name + '（亲征）', military: player.abilities.military });
              seen.add(playerId);
            }
          }
          // 各军兵马使
          for (const armyId of campaign.armyIds) {
            const army = armies.get(armyId);
            if (army?.commanderId && !seen.has(army.commanderId)) {
              const cmd = characters.get(army.commanderId);
              if (cmd) {
                candidates.push({ id: cmd.id, name: cmd.name, military: cmd.abilities.military });
                seen.add(cmd.id);
              }
            }
          }

          return (
            <div className="space-y-1.5">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    useWarStore.getState().updateCampaign(campaignId, { commanderId: c.id });
                    setMode('main');
                  }}
                  className={`w-full px-3 py-1.5 rounded border text-xs text-left transition-colors ${
                    campaign.commanderId === c.id
                      ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]'
                      : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent-gold)]'
                  }`}
                >
                  {c.name}（军事{c.military}）
                </button>
              ))}
              <button onClick={() => setMode('main')} className="w-full px-3 py-1 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">返回</button>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default CampaignPopup;
