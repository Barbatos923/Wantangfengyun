// ===== 行营指令弹窗 =====

import React, { useState } from 'react';
import { useWarStore } from '@engine/military/WarStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import type { Campaign } from '@engine/military/types';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { drawStrategies } from '@engine/military/battleEngine';
import { PURSUIT_STRATEGIES } from '@data/strategies';
import type { BattlePhase, StrategyDef } from '@data/strategies';
import { executeAddArmyToCampaign, executeRemoveArmyFromCampaign, executeDisbandCampaign, executeSetStrategy, executeSetCampaignCommander } from '@engine/interaction/campaignAction';

interface CampaignPopupProps {
  campaignId: string;
  onClose: () => void;
  onStartMarch?: (campaignId: string) => void;
}

const CampaignPopup: React.FC<CampaignPopupProps> = ({ campaignId, onClose, onStartMarch }) => {
  const [mode, setMode] = useState<'main' | 'addArmy' | 'removeArmy' | 'tactics' | 'commander'>('main');
  const [tacticsCache, setTacticsCache] = useState<Map<string, StrategyDef[]> | null>(null);

  const campaign = useWarStore((s) => s.campaigns.get(campaignId));
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

  const handleAddArmy = (armyId: string) => {
    executeAddArmyToCampaign(campaignId, armyId);
  };

  const handleRemoveArmy = (armyId: string) => {
    executeRemoveArmyFromCampaign(campaignId, armyId);
  };

  const handleDisband = () => {
    executeDisbandCampaign(campaignId);
    onClose();
  };

  // 集结中状态由 incomingArmies.length > 0 派生（不再有 'mustering' status 字段）
  const isMustering = campaign.incomingArmies.length > 0 && campaign.status === 'idle';
  const statusLabels: Record<Campaign['status'], string> = {
    marching: '行军中',
    idle: isMustering ? `集结中（${campaign.incomingArmies.length}支在途）` : '待命',
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
                    {army.name}（{ia.turnsLeft}日）
                  </span>
                ) : null;
              })}
            </>
          )}
        </div>

        {/* 主菜单（仅自己的行营可操作） */}
        {mode === 'main' && !isOwner && (
          <p className="text-xs text-[var(--color-text-muted)] py-2">这不是我军行营，无法操作</p>
        )}
        {mode === 'main' && isOwner && (
          <div className="space-y-1.5">
            {campaign.status === 'idle' && onStartMarch && (
              isMustering ? (
                // 集结中（incomingArmies 非空）：WarStore.setCampaignTarget 会拒绝行军，
                // 所以按钮直接禁用 + 提示，避免"按钮能点、目标能选、最后没结果"的假操作
                <button
                  disabled
                  title="集结尚未完成，所有军队到位后才能下行军令"
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text-muted)] opacity-50 cursor-not-allowed"
                >
                  ⚔ 行军（集结尚未完成）
                </button>
              ) : (
                <button
                  onClick={() => onStartMarch(campaignId)}
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
                >
                  ⚔ 行军（在地图上选择目的地）
                </button>
              )
            )}
            {campaign.status === 'marching' ? (
              // 行军中禁止增援：增援 ETA 是按 campaign.locationId 算的，marching 行营每天换位置，
              // 引擎层 executeAddArmyToCampaign 会拒绝。等行营到位（idle/sieging）后再增援。
              <button
                disabled
                title="行军途中无法接收增援，等行营到位后再召集"
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text-muted)] opacity-50 cursor-not-allowed"
              >
                + 召集军队（行军中暂不可用）
              </button>
            ) : (
              <button
                onClick={() => setMode('addArmy')}
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] text-xs text-left text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
              >
                + 召集军队
              </button>
            )}
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

        {/* 召集军队 */}
        {mode === 'addArmy' && (
          <div className="space-y-1.5">
            {campaign.status === 'marching' ? (
              // 玩家在子界面中途行营状态变成 marching：列表禁用 + 提示，避免点击后被引擎层静默拒绝
              <p className="text-xs text-[var(--color-accent-red)] py-2">
                行营已开始行军，无法接收增援。请等到位后再召集。
              </p>
            ) : availableArmies.length === 0 ? (
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
                          executeSetStrategy(campaignId, key, undefined);
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
                            executeSetStrategy(campaignId, key, s.id);
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
                        executeSetStrategy(campaignId, 'pursuit', s.id);
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
              candidates.push({ id: playerId, name: player.name + '（亲征）', military: getEffectiveAbilities(player).military });
              seen.add(playerId);
            }
          }
          // 各军兵马使
          for (const armyId of campaign.armyIds) {
            const army = armies.get(armyId);
            if (army?.commanderId && !seen.has(army.commanderId)) {
              const cmd = characters.get(army.commanderId);
              if (cmd) {
                candidates.push({ id: cmd.id, name: cmd.name, military: getEffectiveAbilities(cmd).military });
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
                    executeSetCampaignCommander(campaignId, c.id);
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
