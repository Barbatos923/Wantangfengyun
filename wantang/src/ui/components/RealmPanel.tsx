import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { usePanelStore } from '@ui/stores/panelStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { calculateMonthlyLedger, getVassals, getDynamicTitle, getActualController, getHeldPosts } from '@engine/official/officialUtils';
import { positionMap } from '@data/positions';
import { executeRedistributionChange, executeToggleSuccession, executeToggleAppointRight } from '@engine/interaction';
import { isCapitalZhouOfDao } from '@engine/npc/policyCalc';
import { formatAmount, formatAmountSigned } from '@ui/utils/formatAmount';
import InlineTreasuryTransferRow from './InlineTreasuryTransferRow';

interface RealmPanelProps {
  onClose: () => void;
}

type TabKey = 'territories' | 'economy' | 'system';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'territories', label: '领地' },
  { key: 'economy', label: '经济' },
  { key: 'system', label: '体制' },
];

const TAX_LEVEL_LABELS: Record<number, string> = { 1: '放任', 2: '一般', 3: '严控', 4: '压榨' };

const PLACEHOLDER_SYSTEMS = [
  '边境战争体制',
  '致仕年龄',
  '部队体制',
];

const RealmPanel: React.FC<RealmPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('territories');

  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => (playerId ? s.characters.get(playerId) : undefined));
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);

  // 经济Tab数据
  const cachedLedger = useLedgerStore((s) => s.playerLedger);
  const playerLedger = cachedLedger ?? (player ? calculateMonthlyLedger(player, territories, characters) : null);

  const playerZhouTerritories = Array.from(territories.values()).filter(
    (t) => getActualController(t) === playerId && t.tier === 'zhou',
  );

  // 国库预计算
  const controllerIndex = useTerritoryStore((s) => s.controllerIndex);

  const redistributionRate = player?.redistributionRate ?? 60; // player 可能为 undefined

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-5 max-w-lg w-full mx-4 shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-lg font-bold text-[var(--color-accent-gold)]">领地管理</h2>
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

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {/* Tab 1: 领地 */}
          {activeTab === 'territories' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 px-1">直辖领地 ({playerZhouTerritories.length})</h3>
                <div className="space-y-1">
                  {playerZhouTerritories.length === 0 ? (
                    <p className="text-center text-[var(--color-text-muted)] py-2 text-sm">暂无直辖州</p>
                  ) : (
                    playerZhouTerritories.map((t) => {
                      const treasury = t.treasury ?? { money: 0, grain: 0 };
                      // 该州净值 = 从 ledger.treasuryChanges 读取
                      const tcDelta = playerLedger?.treasuryChanges.get(t.id);
                      const netMoney = tcDelta ? tcDelta.money : 0;
                      const netGrain = tcDelta ? tcDelta.grain : 0;
                      return (
                        <button
                          key={t.id}
                          className="w-full flex flex-col px-3 py-2 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors text-left gap-1"
                          onClick={() => {
                            usePanelStore.getState().openTerritoryModal(t.id);
                            onClose();
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-bold text-[var(--color-accent-gold)] truncate">{t.name}</span>
                              <span className="text-xs text-[var(--color-text-muted)]">{t.territoryType === 'civil' ? '民政' : '军事'}</span>
                              {player?.capital === t.id && <span className="text-xs text-purple-400 font-bold">治所</span>}
                            </div>
                            <div className="flex gap-2 text-xs text-[var(--color-text)] shrink-0">
                              <span>控制度{Math.floor(t.control)}</span>
                              <span>发展度{Math.floor(t.development)}</span>
                              <span>民心{Math.floor(t.populace)}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--color-text)]">
                              国库 钱{formatAmount(treasury.money)} 粮{formatAmount(treasury.grain)}
                            </span>
                            <span>
                              <span className={netMoney >= 0 ? 'text-[var(--color-accent-green,#27ae60)]' : 'text-[var(--color-accent-red,#e74c3c)]'}>
                                钱{formatAmountSigned(netMoney)}
                              </span>
                              {' '}
                              <span className={netGrain >= 0 ? 'text-[var(--color-accent-green,#27ae60)]' : 'text-[var(--color-accent-red,#e74c3c)]'}>
                                粮{formatAmountSigned(netGrain)}
                              </span>
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: 经济 */}
          {activeTab === 'economy' && (
            <div className="space-y-4">
              {/* ══════ 国库部分 ══════ */}
              <div className="rounded border border-[var(--color-border)] overflow-hidden">
                <div className="px-3 py-1.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                  <span className="text-sm font-bold text-[var(--color-accent-gold)]">国库概览</span>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {/* 治所 */}
                  {player && (() => {
                    const capitalT = player.capital ? territories.get(player.capital) : undefined;
                    return (
                      <div className="flex justify-between px-3 py-2 text-xs">
                        <span className="text-[var(--color-text)]">治所</span>
                        <span className="text-[var(--color-text)] font-bold">{capitalT ? capitalT.name : '无'}</span>
                      </div>
                    );
                  })()}
                  {/* 总国库 */}
                  {player && (() => {
                    const controlled = controllerIndex.get(player.id);
                    let totalMoney = 0, totalGrain = 0;
                    if (controlled) {
                      for (const tid of controlled) {
                        const t = territories.get(tid);
                        if (t?.treasury) { totalMoney += t.treasury.money; totalGrain += t.treasury.grain; }
                      }
                    }
                    return (
                      <div className="flex justify-between px-3 py-2 text-xs font-bold">
                        <span className="text-[var(--color-accent-gold)]">国库总计</span>
                        <span className="text-[var(--color-accent-gold)]">钱{formatAmount(totalMoney)} 粮{formatAmount(totalGrain)}</span>
                      </div>
                    );
                  })()}
                  {/* 各州国库 */}
                  {playerZhouTerritories.map((t) => (
                    <div key={t.id} className="flex justify-between px-3 py-2 text-xs">
                      <span className="text-[var(--color-text)]">
                        {t.name}{player?.capital === t.id ? ' (治所)' : ''}
                      </span>
                      <span className="text-[var(--color-text)]">
                        钱{formatAmount(t.treasury?.money ?? 0)} 粮{formatAmount(t.treasury?.grain ?? 0)}
                      </span>
                    </div>
                  ))}
                  {/* 国库运输内联表单 */}
                  {playerId && (
                    <>
                      <InlineTreasuryTransferRow charId={playerId} resource="money" />
                      <InlineTreasuryTransferRow charId={playerId} resource="grain" />
                    </>
                  )}
                </div>
              </div>

              {/* 国库收入 */}
              {playerLedger && (
                <div className="rounded border border-[var(--color-border)] overflow-hidden">
                  <div className="px-3 py-1.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                    <span className="text-sm font-bold text-[var(--color-accent-gold)]">国库收入</span>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    <div className="flex justify-between px-3 py-2 text-xs">
                      <span className="text-[var(--color-text)]">领地产出</span>
                      <span className="text-[var(--color-text)]">钱{formatAmount(playerLedger.territoryIncome.money)} 粮{formatAmount(playerLedger.territoryIncome.grain)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2 text-xs">
                      <span className="text-[var(--color-text)]">属下上缴</span>
                      <span className="text-[var(--color-text)]">钱{formatAmount(playerLedger.vassalTribute.money)} 粮{formatAmount(playerLedger.vassalTribute.grain)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2 text-xs">
                      <span className="text-[var(--color-text)]">回拨收入</span>
                      <span className="text-[var(--color-text)]">钱{formatAmount(playerLedger.redistributionReceived.money)} 粮{formatAmount(playerLedger.redistributionReceived.grain)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 国库支出 */}
              {playerLedger && (
                <div className="rounded border border-[var(--color-border)] overflow-hidden">
                  <div className="px-3 py-1.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                    <span className="text-sm font-bold text-[var(--color-accent-gold)]">国库支出</span>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    <div className="flex justify-between px-3 py-2 text-xs">
                      <span className="text-[var(--color-text)]">属下俸禄</span>
                      <span className="text-[var(--color-text)]">钱{formatAmount(playerLedger.subordinateSalaries.money)} 粮{formatAmount(playerLedger.subordinateSalaries.grain)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2 text-xs">
                      <span className="text-[var(--color-text)]">军事维持</span>
                      <span className="text-[var(--color-text)]">钱{formatAmount(playerLedger.militaryMaintenance.money)} 粮{formatAmount(playerLedger.militaryMaintenance.grain)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2 text-xs">
                      <span className="text-[var(--color-text)]">回拨支出</span>
                      <span className="text-[var(--color-text)]">钱{formatAmount(playerLedger.redistributionPaid.money)} 粮{formatAmount(playerLedger.redistributionPaid.grain)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2 text-xs">
                      <span className="text-[var(--color-text)]">上缴领主</span>
                      <span className="text-[var(--color-text)]">钱{formatAmount(playerLedger.overlordTribute.money)} 粮{formatAmount(playerLedger.overlordTribute.grain)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 国库净值 */}
              {playerLedger && (() => {
                const tNet = {
                  money: playerLedger.net.money - playerLedger.privateChange.money,
                  grain: playerLedger.net.grain - playerLedger.privateChange.grain,
                };
                return (
                  <div className="flex justify-between px-3 py-2 rounded border border-[var(--color-border)] text-xs font-bold">
                    <span className="text-[var(--color-text)]">国库月净值</span>
                    <span>
                      <span className={tNet.money >= 0 ? 'text-[var(--color-accent-green,#27ae60)]' : 'text-[var(--color-accent-red,#e74c3c)]'}>
                        钱{formatAmountSigned(tNet.money)}
                      </span>
                      {' '}
                      <span className={tNet.grain >= 0 ? 'text-[var(--color-accent-green,#27ae60)]' : 'text-[var(--color-accent-red,#e74c3c)]'}>
                        粮{formatAmountSigned(tNet.grain)}
                      </span>
                    </span>
                  </div>
                );
              })()}

              {/* ══════ 私产部分 ══════ */}
              <div className="rounded border border-[var(--color-border)] overflow-hidden">
                <div className="px-3 py-1.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                  <span className="text-sm font-bold text-[var(--color-accent-gold)]">私产</span>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {player && (
                    <div className="flex justify-between px-3 py-2 text-xs font-bold">
                      <span className="text-[var(--color-text)]">私产总额</span>
                      <span className="text-[var(--color-text)]">钱{formatAmount(player.resources.money)} 粮{formatAmount(player.resources.grain)}</span>
                    </div>
                  )}
                  {playerLedger && (
                    <>
                      <div className="flex justify-between px-3 py-2 text-xs">
                        <span className="text-[var(--color-text)]">职位俸禄（收入）</span>
                        <span className="text-[var(--color-text)]">钱{formatAmount(playerLedger.positionSalary.money)} 粮{formatAmount(playerLedger.positionSalary.grain)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-xs font-bold">
                        <span className="text-[var(--color-text)]">私产月净值</span>
                        <span>
                          <span className={playerLedger.privateChange.money >= 0 ? 'text-[var(--color-accent-green,#27ae60)]' : 'text-[var(--color-accent-red,#e74c3c)]'}>
                            钱{formatAmountSigned(playerLedger.privateChange.money)}
                          </span>
                          {' '}
                          <span className={playerLedger.privateChange.grain >= 0 ? 'text-[var(--color-accent-green,#27ae60)]' : 'text-[var(--color-accent-red,#e74c3c)]'}>
                            粮{formatAmountSigned(playerLedger.privateChange.grain)}
                          </span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: 体制 */}
          {activeTab === 'system' && (
            <div className="space-y-4">
              {/* 回拨率 */}
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">回拨率</h3>
                <div className="px-3 py-2 rounded border border-[var(--color-border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text)]">当前回拨率</span>
                    <div className="flex items-center gap-2">
                      <button
                        className="w-6 h-6 rounded border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        disabled={redistributionRate <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (playerId) executeRedistributionChange(playerId, -10);
                        }}
                      >−</button>
                      <span className="text-sm font-bold text-[var(--color-accent-gold)] w-10 text-center">{redistributionRate}%</span>
                      <button
                        className="w-6 h-6 rounded border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        disabled={redistributionRate >= 100}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (playerId) executeRedistributionChange(playerId, 10);
                        }}
                      >+</button>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">将收到的属下贡赋按此比例自动退还给属下</p>
                </div>
              </div>

              {/* 岗位继承法与辟署权（上移至属下赋税之前） */}
              {player && (() => {
                const playerPosts = getHeldPosts(player.id).filter(p => positionMap.get(p.templateId)?.grantsControl);
                if (playerPosts.length === 0) return null;
                const canEdit = !player.overlordId; // 仅独立统治者/皇帝可交互
                return (
                  <div>
                    <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">继承体制</h3>
                    <div className="space-y-1">
                      {playerPosts.map((post) => {
                        const tpl = positionMap.get(post.templateId);
                        const terr = post.territoryId ? territories.get(post.territoryId) : undefined;
                        const terrName = terr?.name;
                        const isClan = post.successionLaw === 'clan';
                        // 治所州主岗：不是独立政策目标，由父道主岗联动。保留行展示但禁用按钮 + tooltip 提示
                        const isCapZhou = post.territoryId
                          ? isCapitalZhouOfDao(post.territoryId, territories)
                          : false;
                        const editable = canEdit && !isCapZhou;
                        return (
                          <div
                            key={post.id}
                            className={`flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)] ${
                              isCapZhou ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="text-sm text-[var(--color-text)]">
                                {terrName ? `${terrName} ` : ''}{tpl?.name ?? ''}
                              </span>
                              {isCapZhou && (
                                <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                                  由所在道的主岗统一控制
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              {editable ? (
                                <button
                                  onClick={() => executeToggleSuccession(post.id)}
                                  className={`text-xs px-2 py-0.5 rounded font-bold border transition-colors ${
                                    isClan
                                      ? 'text-amber-400 border-amber-400/50 hover:bg-amber-400/10'
                                      : 'text-cyan-400 border-cyan-400/50 hover:bg-cyan-400/10'
                                  }`}
                                >
                                  {isClan ? '世袭 → 流官' : '流官 → 世袭'}
                                </button>
                              ) : (
                                <span className={`text-xs px-1.5 py-0.5 rounded border ${
                                  isClan ? 'text-amber-400 border-amber-400/40' : 'text-cyan-400 border-cyan-400/40'
                                }`}>
                                  {isClan ? '世袭' : '流官'}
                                </span>
                              )}
                              {editable ? (
                                <button
                                  onClick={() => executeToggleAppointRight(post.id)}
                                  className={`text-xs px-2 py-0.5 rounded font-bold border transition-colors ${
                                    post.hasAppointRight
                                      ? 'text-purple-400 border-purple-400/50 hover:bg-purple-400/10'
                                      : 'text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-purple-400 hover:border-purple-400/50'
                                  }`}
                                >
                                  {post.hasAppointRight ? '收回辟署权' : '授予辟署权'}
                                </button>
                              ) : (
                                post.hasAppointRight && (
                                  <span className="text-xs px-1.5 py-0.5 rounded border text-purple-400 border-purple-400/40">
                                    辟署权
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 对下属的赋税等级 */}
              {player && (() => {
                const vassals = getVassals(player.id, characters).filter((v) => v.isRuler);
                if (vassals.length === 0) return null;
                return (
                  <div>
                    <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">属下赋税</h3>
                    <div className="space-y-1.5">
                      {vassals.map((v) => (
                        <button
                          key={v.id}
                          className="w-full flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors text-left cursor-pointer"
                          onClick={() => {
                            usePanelStore.getState().pushCharacter(v.id);
                            onClose();
                          }}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-[var(--color-text)]">{v.name}</span>
                            <span className="text-xs text-[var(--color-text-muted)]">{getDynamicTitle(v, territories)}</span>
                          </div>
                          <span className="text-sm font-bold text-[var(--color-accent-gold)]">{v.centralization ?? 2}级 {TAX_LEVEL_LABELS[v.centralization ?? 2] ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Placeholder systems */}
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">其他体制</h3>
                <div className="space-y-1.5">
                  {PLACEHOLDER_SYSTEMS.map((label) => (
                    <div
                      key={label}
                      className="flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)]"
                    >
                      <span className="text-sm text-[var(--color-text)]">{label}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">尚未实装</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RealmPanel;
