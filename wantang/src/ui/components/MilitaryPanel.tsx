import React, { useState } from 'react';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useWarStore } from '@engine/military/WarStore';
import { settleWar } from '@engine/military/warSettlement';
import type { Army, Battalion, UnitType } from '@engine/military/types';
import type { War, Campaign } from '@engine/military/types';
import { MAX_BATTALION_STRENGTH, CASUS_BELLI_NAMES } from '@engine/military/types';
import { unitTypeMap, ALL_UNIT_TYPES } from '@data/unitTypes';
import { positionMap } from '@data/positions';
import { findPath, getMusteringTime } from '@engine/military/marchCalc';
import {
  getArmyStrength,
  getArmyMorale,
  getArmyElite,
  getArmyMonthlyGrainCost,
  getAvailableRecruits,
} from '@engine/military/militaryCalc';
import { getVassals } from '@engine/official/postQueries';
import type { Territory, Post } from '@engine/territory/types';

interface MilitaryPanelProps {
  onClose: () => void;
}

type TabKey = 'overview' | 'recruit' | 'reward' | 'war';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '军队总览' },
  { key: 'recruit', label: '征兵' },
  { key: 'reward', label: '赏赐' },
  { key: 'war', label: '战争' },
];

const REWARD_PRESETS = [5000, 15000, 30000];

const MilitaryPanel: React.FC<MilitaryPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [expandedArmyId, setExpandedArmyId] = useState<string | null>(null);

  // Tab2: 征兵 state
  const [recruitArmyId, setRecruitArmyId] = useState<string>('');
  const [recruitTerritoryId, setRecruitTerritoryId] = useState<string>('');
  const [recruitUnitType, setRecruitUnitType] = useState<UnitType>('heavyInfantry');
  const [recruitName, setRecruitName] = useState<string>('');

  // Tab1: 新建军队 state
  const [showCreateArmy, setShowCreateArmy] = useState(false);
  const [newArmyName, setNewArmyName] = useState('');
  const [newArmyLocationId, setNewArmyLocationId] = useState('');
  const [newArmyPostId, setNewArmyPostId] = useState('');
  // Tab1: 调拨 state
  const [transferringBatId, setTransferringBatId] = useState<string | null>(null);

  // Tab3: 赏赐 state
  const [rewardArmyId, setRewardArmyId] = useState<string>('');
  const [rewardAmount, setRewardAmount] = useState<number>(1000);

  // Tab1: 行营组建 state
  const [showCreatePeaceCampaign, setShowCreatePeaceCampaign] = useState(false);
  const [peaceCampaignArmies, setPeaceCampaignArmies] = useState<string[]>([]);
  const [peaceCampaignLocationId, setPeaceCampaignLocationId] = useState<string>('');

  // Tab4: 战争 state
  const [createCampaignWarId, setCreateCampaignWarId] = useState<string | null>(null);
  const [selectedCampaignArmies, setSelectedCampaignArmies] = useState<string[]>([]);
  const [campaignLocationId, setCampaignLocationId] = useState<string>('');
  const [marchTargetId, setMarchTargetId] = useState<string>('');
  const [marchCampaignId, setMarchCampaignId] = useState<string | null>(null);

  // Stores
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => (playerId ? s.characters.get(playerId) : undefined));
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const battalions = useMilitaryStore((s) => s.battalions);
  const armies = useMilitaryStore((s) => s.armies);
  const wars = useWarStore((s) => s.wars);
  const campaigns = useWarStore((s) => s.campaigns);

  const playerArmies: Army[] = playerId
    ? Array.from(armies.values()).filter((a) => a.ownerId === playerId)
    : [];

  // 玩家控制的州
  const playerControlledZhou = Array.from(territories.values()).filter(
    (t) =>
      t.tier === 'zhou' &&
      t.posts.some((p) => {
        const postHolder = p.holderId;
        return postHolder === playerId;
      }),
  );

  // 玩家持有的 grantsControl 岗位（用于绑定军队）
  const playerControlPosts = playerId
    ? Array.from(territories.values()).flatMap((t) =>
        t.posts.filter((p) => {
          if (p.holderId !== playerId) return false;
          const tpl = positionMap.get(p.templateId);
          return tpl?.grantsControl === true;
        }).map((p) => ({ ...p, territoryName: t.name, postName: positionMap.get(p.templateId)?.name ?? p.templateId }))
      )
    : [];

  // 生成默认营名
  function genDefaultName(armyId: string, unitType: UnitType): string {
    const army = useMilitaryStore.getState().getArmy(armyId);
    if (!army) return '新营';
    const unitDef = unitTypeMap.get(unitType);
    const unitName = unitDef ? unitDef.name : '兵';
    const existingCount = army.battalionIds.length;
    return `${army.name}${unitName}第${existingCount + 1}营`;
  }

  // 当选择军或兵种时更新默认营名
  function handleRecruitArmyChange(armyId: string) {
    setRecruitArmyId(armyId);
    if (armyId) {
      setRecruitName(genDefaultName(armyId, recruitUnitType));
    }
  }

  function handleRecruitUnitTypeChange(unitType: UnitType) {
    setRecruitUnitType(unitType);
    if (recruitArmyId) {
      setRecruitName(genDefaultName(recruitArmyId, unitType));
    }
  }

  // 征兵检查
  const canRecruit = (() => {
    if (!recruitArmyId || !recruitTerritoryId) return false;
    const territory = territories.get(recruitTerritoryId);
    if (!territory) return false;
    const available = getAvailableRecruits(territory);
    return available >= MAX_BATTALION_STRENGTH;
  })();

  const recruitAvailableCount = (() => {
    if (!recruitTerritoryId) return 0;
    const territory = territories.get(recruitTerritoryId);
    if (!territory) return 0;
    return getAvailableRecruits(territory);
  })();

  function handleRecruit() {
    if (!canRecruit || !recruitArmyId || !recruitTerritoryId) return;
    const name = recruitName.trim() || genDefaultName(recruitArmyId, recruitUnitType);
    useMilitaryStore.getState().recruitBattalion(recruitArmyId, recruitTerritoryId, recruitUnitType, name);
    // 征兵减少领地户数：1营=1000人，1户=5人，扣减200户
    const householdsLost = Math.floor(MAX_BATTALION_STRENGTH / 5);
    const territory = useTerritoryStore.getState().territories.get(recruitTerritoryId);
    if (territory) {
      useTerritoryStore.getState().updateTerritory(recruitTerritoryId, {
        basePopulation: Math.max(0, territory.basePopulation - householdsLost),
        populace: Math.max(0, territory.populace - 1),
        conscriptionPool: Math.max(0, territory.conscriptionPool - MAX_BATTALION_STRENGTH),
      });
    }
    setRecruitName(genDefaultName(recruitArmyId, recruitUnitType));
  }

  // 赏赐逻辑
  // 每兵每点士气 = 5/6 贯，即 moraleGain = rewardAmount × 6 / (totalStrength × 5)
  const rewardArmy = rewardArmyId ? armies.get(rewardArmyId) ?? null : null;
  const rewardArmyStrength = rewardArmy ? getArmyStrength(rewardArmy, battalions) : 0;
  const playerMoney = player?.resources.money ?? 0;
  const canReward = rewardArmyId && rewardAmount > 0 && playerMoney >= rewardAmount && rewardArmyStrength > 0;
  const rewardMoraleGain = rewardArmyStrength > 0
    ? rewardAmount * 6 / (rewardArmyStrength * 5)
    : 0;

  function handleReward() {
    if (!canReward || !playerId || !rewardArmy) return;
    const moraleGain = rewardMoraleGain;
    useCharacterStore.getState().addResources(playerId, { money: -rewardAmount });
    useMilitaryStore.getState().batchMutateBattalions((batsMap) => {
      for (const batId of rewardArmy.battalionIds) {
        const bat = batsMap.get(batId);
        if (bat) {
          batsMap.set(batId, {
            ...bat,
            morale: Math.min(100, bat.morale + moraleGain),
          });
        }
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-5 max-w-2xl w-full mx-4 shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-lg font-bold text-[var(--color-accent-gold)]">军事管理</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)] mb-4 shrink-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2 text-sm font-bold transition-colors ${
                activeTab === key
                  ? 'text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ===== Tab 1: 军队总览 ===== */}
          {activeTab === 'overview' && (
            <div className="space-y-2">
              {/* 新建军队 */}
              {!showCreateArmy ? (
                <button
                  onClick={() => setShowCreateArmy(true)}
                  className="w-full py-2 rounded border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
                >
                  + 新建军队
                </button>
              ) : (
                <div className="rounded border border-[var(--color-accent-gold)] bg-[var(--color-bg)] p-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="军队名称"
                      className="flex-1 px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text)] text-xs focus:outline-none focus:border-[var(--color-accent-gold)]"
                      value={newArmyName}
                      onChange={(e) => setNewArmyName(e.target.value)}
                    />
                    <select
                      className="flex-1 px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text)] text-xs focus:outline-none focus:border-[var(--color-accent-gold)]"
                      value={newArmyLocationId}
                      onChange={(e) => setNewArmyLocationId(e.target.value)}
                    >
                      <option value="">-- 驻地 --</option>
                      {playerControlledZhou.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <select
                      className="w-full px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text)] text-xs focus:outline-none focus:border-[var(--color-accent-gold)]"
                      value={newArmyPostId}
                      onChange={(e) => setNewArmyPostId(e.target.value)}
                    >
                      <option value="">-- 无岗位绑定（私兵）--</option>
                      {playerControlPosts.map((p) => (
                        <option key={p.id} value={p.id}>{p.postName}（{p.territoryName}）</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowCreateArmy(false); setNewArmyName(''); setNewArmyLocationId(''); setNewArmyPostId(''); }}
                      className="px-3 py-1 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                    >
                      取消
                    </button>
                    <button
                      disabled={!newArmyName.trim() || !newArmyLocationId}
                      onClick={() => {
                        if (playerId && newArmyName.trim() && newArmyLocationId) {
                          useMilitaryStore.getState().createArmy(newArmyName.trim(), playerId, newArmyLocationId, undefined, newArmyPostId || null);
                          setShowCreateArmy(false);
                          setNewArmyName('');
                          setNewArmyLocationId('');
                          setNewArmyPostId('');
                        }
                      }}
                      className="px-3 py-1 rounded border border-[var(--color-accent-gold)] text-xs font-bold text-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      确认创建
                    </button>
                  </div>
                </div>
              )}

              {playerArmies.length === 0 ? (
                <p className="text-center text-[var(--color-text-muted)] py-6 text-sm">暂无军队</p>
              ) : (
                playerArmies.map((army) => {
                  const isExpanded = expandedArmyId === army.id;
                  const strength = getArmyStrength(army, battalions);
                  const morale = getArmyMorale(army, battalions);
                  const elite = getArmyElite(army, battalions);
                  const grainCost = getArmyMonthlyGrainCost(army, battalions, unitTypeMap);
                  const locationTerritory = territories.get(army.locationId);
                  const commander = army.commanderId ? characters.get(army.commanderId) : null;
                  const armyBattalions = army.battalionIds.map((bid) => battalions.get(bid)).filter((b): b is Battalion => !!b);

                  return (
                    <div
                      key={army.id}
                      className="rounded border border-[var(--color-border)] overflow-hidden"
                    >
                      {/* 军卡片 */}
                      <button
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--color-bg)] hover:bg-[var(--color-bg-surface)] transition-colors text-left"
                        onClick={() => setExpandedArmyId(isExpanded ? null : army.id)}
                      >
                        <div className="flex flex-col min-w-0 mr-3">
                          <span className="text-sm font-bold text-[var(--color-accent-gold)]">{army.name}</span>
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {commander ? commander.name : '无将领'} · {locationTerritory ? locationTerritory.name : army.locationId}
                            {army.postId ? (() => {
                              const tpl = (() => { for (const t of territories.values()) { const p = t.posts.find(pp => pp.id === army.postId); if (p) return { postName: positionMap.get(p.templateId)?.name ?? '', terrName: t.name }; } return null; })();
                              return tpl ? ` · ${tpl.postName}（${tpl.terrName}）` : '';
                            })() : ' · 私兵'}
                          </span>
                        </div>
                        <div className="flex gap-3 text-xs text-[var(--color-text-muted)] shrink-0">
                          <span>兵{strength.toLocaleString()}</span>
                          <span>士气{Math.round(morale)}</span>
                          <span>精锐{Math.round(elite)}</span>
                          <span className="text-[var(--color-accent-red,#e74c3c)]">月耗粮{grainCost}</span>
                        </div>
                        <span className="ml-2 text-[var(--color-text-muted)] text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {/* 展开区域 */}
                      {isExpanded && (
                        <div className="divide-y divide-[var(--color-border)]">
                          {/* 兵马使任命 */}
                          <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-bg)]">
                            <span className="text-xs font-bold text-[var(--color-text-muted)]">兵马使</span>
                            <select
                              className="px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text)] text-xs focus:outline-none focus:border-[var(--color-accent-gold)]"
                              value={army.commanderId ?? ''}
                              onChange={(e) => {
                                const val = e.target.value || null;
                                useMilitaryStore.getState().updateArmy(army.id, { commanderId: val });
                              }}
                            >
                              <option value="">无将领</option>
                              {playerId && (() => {
                                const armyDaoId = locationTerritory?.parentId;
                                // 已被其他军任命为兵马使的角色ID
                                const takenCommanderIds = new Set(
                                  playerArmies
                                    .filter((a) => a.id !== army.id && a.commanderId)
                                    .map((a) => a.commanderId!),
                                );
                                return getVassals(playerId, characters)
                                  .filter((c) => {
                                    // 排除已在其他军任职的
                                    if (takenCommanderIds.has(c.id)) return false;
                                    // 该臣属控制的州
                                    const controlledZhou = Array.from(territories.values()).filter(
                                      (t) => t.tier === 'zhou' && t.posts.some((p) => p.holderId === c.id),
                                    );
                                    if (controlledZhou.length === 0) return true; // 纯廷臣，随侍可用
                                    return controlledZhou.some((t) => t.parentId === armyDaoId);
                                  })
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}（军事{c.abilities.military}）
                                    </option>
                                  ));
                              })()}
                            </select>
                          </div>

                          {/* 营列表 */}
                          {armyBattalions.length === 0 ? (
                            <p className="text-center text-[var(--color-text-muted)] py-3 text-xs">该军暂无营</p>
                          ) : (
                            armyBattalions.map((bat: Battalion) => {
                              const unitDef = unitTypeMap.get(bat.unitType);
                              const homeTerritory = territories.get(bat.homeTerritory);
                              return (
                                <div
                                  key={bat.id}
                                  className="flex items-center justify-between px-4 py-2 bg-[var(--color-bg-surface)]"
                                >
                                  <div className="flex flex-col min-w-0 mr-2">
                                    <span className="text-xs font-bold text-[var(--color-text)]">{bat.name}</span>
                                    <span className="text-xs text-[var(--color-text-muted)]">
                                      {unitDef ? unitDef.name : bat.unitType} · 籍{homeTerritory ? homeTerritory.name : bat.homeTerritory}
                                    </span>
                                  </div>
                                  <div className="flex gap-2 text-xs text-[var(--color-text-muted)] shrink-0 mr-3">
                                    <span>{bat.currentStrength}/1000</span>
                                    <span>士气{bat.morale}</span>
                                    <span>精锐{bat.elite}</span>
                                  </div>
                                  <div className="flex gap-2 shrink-0 items-center">
                                    {transferringBatId === bat.id ? (
                                      <select
                                        className="px-1.5 py-0.5 rounded border border-[var(--color-accent-gold)] bg-[var(--color-bg)] text-[var(--color-text)] text-xs focus:outline-none"
                                        autoFocus
                                        value=""
                                        onChange={(e) => {
                                          if (e.target.value) {
                                            useMilitaryStore.getState().transferBattalion(bat.id, e.target.value);
                                            setTransferringBatId(null);
                                          }
                                        }}
                                        onBlur={() => setTransferringBatId(null)}
                                      >
                                        <option value="">调往...</option>
                                        {playerArmies
                                          .filter((a) => a.id !== army.id)
                                          .map((a) => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                          ))}
                                      </select>
                                    ) : (
                                      <button
                                        className="text-xs text-[var(--color-accent-gold)] hover:opacity-75 transition-opacity"
                                        onClick={() => setTransferringBatId(bat.id)}
                                      >
                                        调拨
                                      </button>
                                    )}
                                    <button
                                      className="text-xs text-[var(--color-accent-red,#e74c3c)] hover:opacity-75 transition-opacity"
                                      onClick={() => {
                                        useMilitaryStore.getState().disbandBattalion(bat.id);
                                      }}
                                    >
                                      解散
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ===== Tab 2: 征兵 ===== */}
          {activeTab === 'recruit' && (
            <div className="space-y-4">
              {/* 选择军 */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">选择军队</label>
                <select
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent-gold)]"
                  value={recruitArmyId}
                  onChange={(e) => handleRecruitArmyChange(e.target.value)}
                >
                  <option value="">-- 请选择军队 --</option>
                  {playerArmies.map((army) => (
                    <option key={army.id} value={army.id}>{army.name}</option>
                  ))}
                </select>
              </div>

              {/* 选择州 */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">征兵之州</label>
                <select
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent-gold)]"
                  value={recruitTerritoryId}
                  onChange={(e) => setRecruitTerritoryId(e.target.value)}
                >
                  <option value="">-- 请选择州 --</option>
                  {playerControlledZhou.map((t) => {
                    const available = getAvailableRecruits(t);
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name}（可征{available}人）
                      </option>
                    );
                  })}
                </select>
                {recruitTerritoryId && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    当前可征兵：{recruitAvailableCount} 人
                    {recruitAvailableCount < MAX_BATTALION_STRENGTH && (
                      <span className="text-[var(--color-accent-red,#e74c3c)]">
                        {' '}（不足一营 {MAX_BATTALION_STRENGTH} 人，无法征募）
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* 选择兵种 */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">兵种</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {ALL_UNIT_TYPES.map((unitDef) => (
                    <button
                      key={unitDef.id}
                      onClick={() => handleRecruitUnitTypeChange(unitDef.id)}
                      className={`flex flex-col items-center px-1 py-2 rounded border transition-colors text-center ${
                        recruitUnitType === unitDef.id
                          ? 'border-[var(--color-accent-gold)] bg-[var(--color-bg-surface)] text-[var(--color-accent-gold)]'
                          : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      <span className="text-xs font-bold mb-1">{unitDef.name}</span>
                      <div className="text-[10px] text-[var(--color-text-muted)] space-y-0.5">
                        <div>冲{unitDef.charge} 坚{unitDef.breach}</div>
                        <div>追{unitDef.pursuit} 城{unitDef.siege}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 营名 */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">营名</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent-gold)]"
                  placeholder="输入营名"
                  value={recruitName}
                  onChange={(e) => setRecruitName(e.target.value)}
                />
              </div>

              {/* 确认招募 */}
              <button
                disabled={!canRecruit}
                onClick={handleRecruit}
                className={`w-full py-2.5 rounded border text-sm font-bold transition-colors ${
                  canRecruit
                    ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
                }`}
              >
                确认招募（消耗 {MAX_BATTALION_STRENGTH} 人口）
              </button>

              {/* 补充兵员 */}
              <div className="border-t border-[var(--color-border)] pt-4">
                <h4 className="text-xs font-bold text-[var(--color-text-muted)] mb-2">补充兵员（不满员的营）</h4>
                {(() => {
                  // 找出玩家所有不满员的营
                  const underStrengthBats: { bat: Battalion; armyName: string; homeTerr: Territory | undefined; available: number }[] = [];
                  for (const army of playerArmies) {
                    for (const batId of army.battalionIds) {
                      const bat = battalions.get(batId);
                      if (!bat || bat.currentStrength >= MAX_BATTALION_STRENGTH) continue;
                      const homeTerr = territories.get(bat.homeTerritory);
                      const available = homeTerr ? getAvailableRecruits(homeTerr) : 0;
                      underStrengthBats.push({ bat, armyName: army.name, homeTerr, available });
                    }
                  }
                  if (underStrengthBats.length === 0) {
                    return <p className="text-xs text-[var(--color-text-muted)]">所有营均满员</p>;
                  }
                  return (
                    <div className="space-y-1">
                      {underStrengthBats.map(({ bat, armyName, homeTerr, available }) => {
                        const deficit = MAX_BATTALION_STRENGTH - bat.currentStrength;
                        const canReplenish = available >= deficit && deficit > 0;
                        // 检查籍贯地是否属于玩家
                        const homeController = homeTerr?.posts.find((p: Post) => {
                          const tpl = positionMap.get(p.templateId);
                          return tpl?.grantsControl === true;
                        })?.holderId;
                        const ownsHome = homeController === playerId;
                        return (
                          <div key={bat.id} className="flex items-center justify-between px-2 py-1.5 rounded border border-[var(--color-border)] text-xs">
                            <div className="min-w-0 mr-2">
                              <span className="text-[var(--color-text)]">{bat.name}</span>
                              <span className="text-[var(--color-text-muted)]"> · {armyName} · {bat.currentStrength}/{MAX_BATTALION_STRENGTH}</span>
                              <span className="text-[var(--color-text-muted)]"> · 籍{homeTerr?.name ?? '?'}</span>
                            </div>
                            <button
                              disabled={!canReplenish || !ownsHome}
                              onClick={() => {
                                if (!homeTerr || !canReplenish || !ownsHome) return;
                                useMilitaryStore.getState().updateBattalion(bat.id, { currentStrength: MAX_BATTALION_STRENGTH });
                                const householdsLost = Math.floor(deficit / 5);
                                useTerritoryStore.getState().updateTerritory(homeTerr.id, {
                                  basePopulation: Math.max(0, homeTerr.basePopulation - householdsLost),
                                  populace: Math.max(0, homeTerr.populace - Math.ceil(deficit / 1000)),
                                  conscriptionPool: Math.max(0, homeTerr.conscriptionPool - deficit),
                                });
                              }}
                              className="shrink-0 px-2 py-0.5 rounded border border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              补充{deficit}人
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ===== Tab 3: 赏赐 ===== */}
          {activeTab === 'reward' && (
            <div className="space-y-4">
              {/* 选择军 */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">选择军队</label>
                <select
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent-gold)]"
                  value={rewardArmyId}
                  onChange={(e) => setRewardArmyId(e.target.value)}
                >
                  <option value="">-- 请选择军队 --</option>
                  {playerArmies.map((army) => {
                    const morale = getArmyMorale(army, battalions);
                    return (
                      <option key={army.id} value={army.id}>
                        {army.name}（士气{Math.round(morale)}）
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 当前军士气信息 */}
              {rewardArmy && (() => {
                const armyBattalions = useMilitaryStore.getState().getBattalionsByArmy(rewardArmy.id);
                const avgMorale = getArmyMorale(rewardArmy, battalions);
                return (
                  <div className="rounded border border-[var(--color-border)] overflow-hidden">
                    <div className="px-3 py-1.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                      <span className="text-xs font-bold text-[var(--color-text-muted)]">当前士气详情</span>
                    </div>
                    <div className="divide-y divide-[var(--color-border)]">
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">平均士气</span>
                        <span className="text-[var(--color-text)]">{Math.round(avgMorale)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">营数</span>
                        <span className="text-[var(--color-text)]">{armyBattalions.length} 营</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 赏赐金额 */}
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1.5">
                  赏赐金额（当前：{playerMoney.toLocaleString()} 钱）
                </label>
                <div className="flex gap-2 mb-2">
                  {REWARD_PRESETS.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setRewardAmount(amount)}
                      className={`flex-1 py-1.5 rounded border text-xs font-bold transition-colors ${
                        rewardAmount === amount
                          ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      {amount.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm focus:outline-none focus:border-[var(--color-accent-gold)]"
                  value={rewardAmount}
                  onChange={(e) => setRewardAmount(Math.max(0, parseInt(e.target.value) || 0))}
                />
                {rewardAmount > 0 && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    将为该军所有营提升 <span className="text-[var(--color-accent-gold)]">+{rewardMoraleGain.toFixed(1)}</span> 点士气
                    {rewardArmyStrength > 0 && (
                      <span>（{rewardArmyStrength}人，每兵{(rewardAmount / rewardArmyStrength).toFixed(1)}贯）</span>
                    )}
                    {playerMoney < rewardAmount && (
                      <span className="text-[var(--color-accent-red,#e74c3c)]">（钱财不足）</span>
                    )}
                  </p>
                )}
              </div>

              {/* 确认赏赐 */}
              <button
                disabled={!canReward}
                onClick={handleReward}
                className={`w-full py-2.5 rounded border text-sm font-bold transition-colors ${
                  canReward
                    ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
                }`}
              >
                确认赏赐（消耗 {rewardAmount.toLocaleString()} 钱）
              </button>
            </div>
          )}

          {/* ===== Tab 4: 战争 ===== */}
          {activeTab === 'war' && (
            <div className="space-y-3">
              {(() => {
                const activeWars = playerId
                  ? Array.from(wars.values()).filter(
                      (w) =>
                        w.status === 'active' &&
                        (w.attackerId === playerId || w.defenderId === playerId),
                    )
                  : [];

                // 已在任何行营中的军队ID（含赶赴中的）
                const armiesInCampaigns = new Set<string>();
                for (const c of campaigns.values()) {
                  for (const aid of c.armyIds) armiesInCampaigns.add(aid);
                  for (const ia of c.incomingArmies) armiesInCampaigns.add(ia.armyId);
                }

                if (activeWars.length === 0) {
                  return (
                    <p className="text-center text-[var(--color-text-muted)] py-6 text-sm">
                      当前无进行中的战争
                    </p>
                  );
                }

                return activeWars.map((war: War) => {
                  const defenderName =
                    characters.get(war.defenderId)?.name ?? war.defenderId;
                  const casusBelliName = CASUS_BELLI_NAMES[war.casusBelli];
                  const warCampaigns = Array.from(campaigns.values()).filter(
                    (c) => c.warId === war.id && c.ownerId === playerId,
                  );
                  const isCreatingCampaign = createCampaignWarId === war.id;

                  // 敌方控制的州（防守方）
                  const defenderTerritories = Array.from(territories.values()).filter(
                    (t) =>
                      t.tier === 'zhou' &&
                      t.posts.some((p) => p.holderId === war.defenderId),
                  );

                  return (
                    <div
                      key={war.id}
                      className="rounded border border-[var(--color-border)] overflow-hidden"
                    >
                      {/* 战争标题 */}
                      <div className="px-3 py-2 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[var(--color-accent-gold)]">
                            对{defenderName}的{casusBelliName}
                          </span>
                          <div className="flex gap-3 text-xs text-[var(--color-text-muted)]">
                            <span>攻方 {war.attackerWarScore}</span>
                            <span>守方 {war.defenderWarScore}</span>
                          </div>
                        </div>
                        {war.targetTerritoryIds.length > 0 && (
                          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                            目标：
                            {war.targetTerritoryIds
                              .map((id) => territories.get(id)?.name ?? id)
                              .join('、')}
                          </div>
                        )}
                      </div>

                      {/* 和谈/投降按钮 */}
                      {(() => {
                        const isAttacker = war.attackerId === playerId;
                        const myScore = isAttacker ? war.attackerWarScore : war.defenderWarScore;
                        const enemyScore = isAttacker ? war.defenderWarScore : war.attackerWarScore;
                        const canForce = myScore >= 100;         // 我方碾压，强制对方投降
                        const canSurrender = enemyScore >= 100;  // 对方碾压，我方投降认输
                        const canPeace = myScore >= 50;
                        return (canForce || canSurrender || canPeace) ? (
                          <div className="flex gap-2 px-3 py-2 border-t border-[var(--color-border)]">
                            {canForce && (
                              <button
                                onClick={() => {
                                  settleWar(war.id, isAttacker ? 'attackerWin' : 'defenderWin');
                                }}
                                className="flex-1 py-1.5 rounded border border-[var(--color-accent-gold)] text-xs font-bold text-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)] transition-colors"
                              >
                                强制投降
                              </button>
                            )}
                            {canSurrender && !canForce && (
                              <button
                                onClick={() => {
                                  settleWar(war.id, isAttacker ? 'defenderWin' : 'attackerWin');
                                }}
                                className="flex-1 py-1.5 rounded border border-[var(--color-accent-red,#e74c3c)] text-xs font-bold text-[var(--color-accent-red,#e74c3c)] hover:bg-[var(--color-accent-red,#e74c3c)]/10 transition-colors"
                              >
                                投降
                              </button>
                            )}
                            {canPeace && !canForce && !canSurrender && (
                              <button
                                onClick={() => {
                                  settleWar(war.id, 'whitePeace');
                                }}
                                className="flex-1 py-1.5 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-text)] transition-colors"
                              >
                                和谈
                              </button>
                            )}
                          </div>
                        ) : null;
                      })()}

                      {/* 行营列表 */}
                      <div className="divide-y divide-[var(--color-border)]">
                        {warCampaigns.length === 0 ? (
                          <p className="text-xs text-[var(--color-text-muted)] px-3 py-2">
                            暂无行营
                          </p>
                        ) : (
                          warCampaigns.map((camp: Campaign) => {
                            const campCommander = characters.get(camp.commanderId);
                            const campLocation = territories.get(camp.locationId);
                            const campArmyCount = camp.armyIds.length;
                            const campStrength = camp.armyIds.reduce((sum, aId) => {
                              const a = armies.get(aId);
                              return a ? sum + getArmyStrength(a, battalions) : sum;
                            }, 0);
                            const campTarget = camp.targetId
                              ? territories.get(camp.targetId)
                              : null;
                            const isSettingTarget =
                              marchCampaignId === camp.id;

                            return (
                              <div
                                key={camp.id}
                                className="px-3 py-2 bg-[var(--color-bg-surface)]"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex flex-col min-w-0 mr-2">
                                    <span className="text-xs font-bold text-[var(--color-text)]">
                                      {campCommander?.name ?? '无将领'}
                                    </span>
                                    <span className="text-xs text-[var(--color-text-muted)]">
                                      {camp.status === 'mustering' && `集结中（${camp.musteringTurnsLeft}回合）`}
                                      {camp.status === 'idle' && '待命'}
                                      {camp.status === 'marching' && `行军中`}
                                      {camp.status === 'sieging' && '围城中'}
                                      {' · '}
                                      {campLocation?.name ?? camp.locationId}
                                      {' · '}
                                      {campArmyCount}军 / {campStrength.toLocaleString()}兵
                                    </span>
                                    {camp.status === 'marching' && campTarget && (
                                      <span className="text-xs text-[var(--color-text-muted)]">
                                        目标：{campTarget.name}（进度 {camp.routeProgress}/{camp.route.length}）
                                      </span>
                                    )}
                                  </div>
                                  {camp.status === 'idle' && !isSettingTarget && (
                                    <button
                                      onClick={() => {
                                        setMarchCampaignId(camp.id);
                                        setMarchTargetId('');
                                      }}
                                      className="text-xs border border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] px-2 py-1 rounded hover:bg-[var(--color-bg)] transition-colors shrink-0"
                                    >
                                      设定目标
                                    </button>
                                  )}
                                </div>

                                {/* 设定行军目标 */}
                                {isSettingTarget && (
                                  <div className="mt-2 space-y-2">
                                    <select
                                      className="w-full px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-xs focus:outline-none focus:border-[var(--color-accent-gold)]"
                                      value={marchTargetId}
                                      onChange={(e) => setMarchTargetId(e.target.value)}
                                    >
                                      <option value="">-- 选择目标州 --</option>
                                      {defenderTerritories.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        onClick={() => setMarchCampaignId(null)}
                                        className="px-2 py-1 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                                      >
                                        取消
                                      </button>
                                      <button
                                        disabled={!marchTargetId}
                                        onClick={() => {
                                          if (!marchTargetId || !playerId) return;
                                          const path = findPath(
                                            camp.locationId,
                                            marchTargetId,
                                            playerId,
                                            territories,
                                          );
                                          if (!path) {
                                            alert('无法到达目标州');
                                            return;
                                          }
                                          useWarStore
                                            .getState()
                                            .setCampaignTarget(camp.id, marchTargetId, path);
                                          setMarchCampaignId(null);
                                          setMarchTargetId('');
                                        }}
                                        className="px-2 py-1 rounded border border-[var(--color-accent-gold)] text-xs font-bold text-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        确认行军
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* 组建行营 */}
                      <div className="px-3 py-2 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
                        {!isCreatingCampaign ? (
                          <button
                            onClick={() => {
                              setCreateCampaignWarId(war.id);
                              setSelectedCampaignArmies([]);
                            }}
                            className="w-full py-1.5 rounded border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
                          >
                            + 组建行营
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-[var(--color-text-muted)]">
                              选择参战军队
                            </p>
                            {(() => {
                              const availableForCampaign = playerArmies.filter((a) => !armiesInCampaigns.has(a.id));
                              return availableForCampaign.length === 0 ? (
                              <p className="text-xs text-[var(--color-text-muted)]">无可用军队（均已编入行营）</p>
                            ) : (
                              availableForCampaign.map((army) => {
                                const isChecked = selectedCampaignArmies.includes(army.id);
                                const armyStrength = getArmyStrength(army, battalions);
                                return (
                                  <label
                                    key={army.id}
                                    className="flex items-center gap-2 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setSelectedCampaignArmies((prev) =>
                                          isChecked
                                            ? prev.filter((id) => id !== army.id)
                                            : [...prev, army.id],
                                        );
                                      }}
                                    />
                                    <span className="text-xs text-[var(--color-text)]">
                                      {army.name}（{armyStrength.toLocaleString()}兵 · {territories.get(army.locationId)?.name ?? army.locationId}）
                                    </span>
                                  </label>
                                );
                              })
                            );
                            })()}
                            {/* 行营驻地选择 */}
                            <p className="text-xs font-bold text-[var(--color-text-muted)] pt-1">行营驻地</p>
                            <select
                              className="w-full px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-xs focus:outline-none focus:border-[var(--color-accent-gold)]"
                              value={campaignLocationId}
                              onChange={(e) => setCampaignLocationId(e.target.value)}
                            >
                              <option value="">-- 请选择 --</option>
                              {playerControlledZhou.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>

                            <div className="flex gap-2 justify-end pt-1">
                              <button
                                onClick={() => {
                                  setCreateCampaignWarId(null);
                                  setSelectedCampaignArmies([]);
                                  setCampaignLocationId('');
                                }}
                                className="px-3 py-1 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                              >
                                取消
                              </button>
                              <button
                                disabled={selectedCampaignArmies.length === 0 || !campaignLocationId}
                                onClick={() => {
                                  if (!playerId || selectedCampaignArmies.length === 0 || !campaignLocationId) return;

                                  // 选中军队中军事最高的作为都统
                                  const selectedArmyObjs = selectedCampaignArmies
                                    .map((id) => armies.get(id))
                                    .filter((a): a is Army => !!a);
                                  let bestCommander = '';
                                  let bestMilitary = -1;
                                  for (const army of selectedArmyObjs) {
                                    if (army.commanderId) {
                                      const commander = characters.get(army.commanderId);
                                      if (
                                        commander &&
                                        commander.abilities.military > bestMilitary
                                      ) {
                                        bestMilitary = commander.abilities.military;
                                        bestCommander = army.commanderId;
                                      }
                                    }
                                  }

                                  // 计算最大集结时间
                                  let maxMustering = 0;
                                  for (const armyId of selectedCampaignArmies) {
                                    const army = armies.get(armyId);
                                    if (army) {
                                      const time = getMusteringTime(
                                        army.locationId,
                                        campaignLocationId,
                                        territories,
                                      );
                                      if (time > maxMustering) maxMustering = time;
                                    }
                                  }

                                  const newCampaign = useWarStore
                                    .getState()
                                    .createCampaign(
                                      war.id,
                                      playerId,
                                      bestCommander || playerId,
                                      selectedCampaignArmies,
                                      campaignLocationId,
                                    );

                                  if (maxMustering > 0) {
                                    useWarStore.getState().updateCampaign(newCampaign.id, {
                                      status: 'mustering',
                                      musteringTurnsLeft: maxMustering,
                                    });
                                  }

                                  setCreateCampaignWarId(null);
                                  setSelectedCampaignArmies([]);
                                  setCampaignLocationId('');
                                }}
                                className="px-3 py-1 rounded border border-[var(--color-accent-gold)] text-xs font-bold text-[var(--color-accent-gold)] hover:bg-[var(--color-bg-surface)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                确认组建
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}

              {/* 独立行营（不依附战争） */}
              {(() => {
                const independentCampaigns = Array.from(campaigns.values()).filter(
                  (c) => c.ownerId === playerId && !c.warId,
                );
                return (
                  <>
                    {independentCampaigns.length > 0 && (
                      <div className="rounded border border-[var(--color-border)] overflow-hidden">
                        <div className="px-3 py-1.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                          <span className="text-xs font-bold text-[var(--color-text-muted)]">独立行营</span>
                        </div>
                        {independentCampaigns.map((camp) => {
                          const campLoc = territories.get(camp.locationId);
                          const campCmd = characters.get(camp.commanderId);
                          let campTroops = 0;
                          for (const aid of camp.armyIds) {
                            const a = armies.get(aid);
                            if (a) campTroops += getArmyStrength(a, battalions);
                          }
                          return (
                            <div key={camp.id} className="px-3 py-2 text-xs border-b border-[var(--color-border)] last:border-b-0">
                              <span className="text-[var(--color-text)]">{campCmd?.name ?? '无'}</span>
                              <span className="text-[var(--color-text-muted)]"> · {campLoc?.name} · {campTroops.toLocaleString()}兵 · {camp.status === 'marching' ? '行军中' : camp.status === 'mustering' ? '集结中' : '待命'}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* 组建独立行营 */}
                    {!showCreatePeaceCampaign ? (
                      <button
                        onClick={() => setShowCreatePeaceCampaign(true)}
                        className="w-full py-2 rounded border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
                      >
                        + 组建行营
                      </button>
                    ) : (
                      <div className="rounded border border-[var(--color-accent-gold)] bg-[var(--color-bg)] p-3 space-y-2">
                        <p className="text-xs font-bold text-[var(--color-text-muted)]">选择军队</p>
                        {(() => {
                          const usedArmyIds = new Set<string>();
                          for (const c of campaigns.values()) {
                            for (const aid of c.armyIds) usedArmyIds.add(aid);
                            for (const ia of c.incomingArmies) usedArmyIds.add(ia.armyId);
                          }
                          const available = playerArmies.filter((a) => !usedArmyIds.has(a.id));
                          return available.length === 0 ? (
                            <p className="text-xs text-[var(--color-text-muted)]">无可用军队</p>
                          ) : (
                            available.map((army) => {
                              const isChecked = peaceCampaignArmies.includes(army.id);
                              return (
                                <label key={army.id} className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={isChecked} onChange={() => setPeaceCampaignArmies((prev) =>
                                    isChecked ? prev.filter((id) => id !== army.id) : [...prev, army.id]
                                  )} />
                                  <span className="text-xs text-[var(--color-text)]">
                                    {army.name}（{getArmyStrength(army, battalions).toLocaleString()}兵 · {territories.get(army.locationId)?.name}）
                                  </span>
                                </label>
                              );
                            })
                          );
                        })()}
                        <p className="text-xs font-bold text-[var(--color-text-muted)] pt-1">行营驻地</p>
                        <select
                          className="w-full px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-xs"
                          value={peaceCampaignLocationId}
                          onChange={(e) => setPeaceCampaignLocationId(e.target.value)}
                        >
                          <option value="">-- 请选择 --</option>
                          {playerControlledZhou.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <div className="flex gap-2 justify-end pt-1">
                          <button onClick={() => { setShowCreatePeaceCampaign(false); setPeaceCampaignArmies([]); setPeaceCampaignLocationId(''); }}
                            className="px-3 py-1 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">取消</button>
                          <button
                            disabled={peaceCampaignArmies.length === 0 || !peaceCampaignLocationId}
                            onClick={() => {
                              if (!playerId || peaceCampaignArmies.length === 0 || !peaceCampaignLocationId) return;
                              const selObjs = peaceCampaignArmies.map((id) => armies.get(id)).filter((a): a is Army => !!a);
                              let bestCmd = ''; let bestMil = -1;
                              for (const a of selObjs) { if (a.commanderId) { const c = characters.get(a.commanderId); if (c && c.abilities.military > bestMil) { bestMil = c.abilities.military; bestCmd = a.commanderId; } } }
                              useWarStore.getState().createCampaign('', playerId, bestCmd || playerId, peaceCampaignArmies, peaceCampaignLocationId);
                              setShowCreatePeaceCampaign(false); setPeaceCampaignArmies([]); setPeaceCampaignLocationId('');
                            }}
                            className="px-3 py-1 rounded border border-[var(--color-accent-gold)] text-xs font-bold text-[var(--color-accent-gold)] disabled:opacity-40 disabled:cursor-not-allowed"
                          >确认组建</button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default MilitaryPanel;
