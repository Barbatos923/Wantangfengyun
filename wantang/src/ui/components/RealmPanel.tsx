import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { usePanelStore } from '@ui/stores/panelStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { calculateMonthlyIncome } from '@engine/territory/territoryUtils';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { calculateMonthlyLedger, getVassals, getDynamicTitle, getActualController, getControlledZhou, getHeldPosts } from '@engine/official/officialUtils';
import { positionMap } from '@data/positions';
import { executeRedistributionChange, executeToggleSuccession, executeToggleAppointRight } from '@engine/interaction';

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

  const abilities = player ? getEffectiveAbilities(player) : null;

  // 经济Tab数据
  const cachedLedger = useLedgerStore((s) => s.playerLedger);
  const playerLedger = cachedLedger ?? (player ? calculateMonthlyLedger(player, territories, characters) : null);

  const playerZhouTerritories = Array.from(territories.values()).filter(
    (t) => getActualController(t) === playerId && t.tier === 'zhou',
  );

  // 臣属领地：效忠于玩家的角色所持有的州
  const vassalTerritories: { territory: typeof playerZhouTerritories[0]; holder: string }[] = [];
  if (player) {
    const vassals = getVassals(player.id, characters);
    for (const v of vassals) {
      for (const t of getControlledZhou(v.id, territories)) {
        vassalTerritories.push({ territory: t, holder: v.name });
      }
    }
  }

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
              {/* 直辖领地 */}
              <div>
                <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 px-1">直辖 ({playerZhouTerritories.length})</h3>
                <div className="space-y-1">
                  {playerZhouTerritories.length === 0 ? (
                    <p className="text-center text-[var(--color-text-muted)] py-2 text-sm">暂无直辖州</p>
                  ) : (
                    playerZhouTerritories.map((t) => {
                      const income = abilities
                        ? calculateMonthlyIncome(t, abilities)
                        : { money: 0, grain: 0, troops: 0 };
                      return (
                        <button
                          key={t.id}
                          className="w-full flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors text-left"
                          onClick={() => {
                            usePanelStore.getState().openTerritoryModal(t.id);
                            onClose();
                          }}
                        >
                          <div className="flex flex-col min-w-0 mr-2">
                            <span className="text-sm font-bold text-[var(--color-accent-gold)] truncate">{t.name}</span>
                            <span className="text-xs text-[var(--color-text-muted)]">{t.territoryType === 'civil' ? '民政' : '军事'}</span>
                          </div>
                          <div className="flex gap-2 text-xs text-[var(--color-text-muted)] mx-2 shrink-0">
                            <span>控{Math.floor(t.control)}</span>
                            <span>发{Math.floor(t.development)}</span>
                            <span>民{Math.floor(t.populace)}</span>
                          </div>
                          <div className="flex flex-col items-end text-xs shrink-0">
                            <span className="text-[var(--color-accent-gold)]">钱+{income.money.toFixed(1)}</span>
                            <span className="text-[var(--color-accent-green,#27ae60)]">粮+{income.grain.toFixed(1)}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 臣属领地 */}
              {vassalTerritories.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5 px-1">臣属领地 ({vassalTerritories.length})</h3>
                  <div className="space-y-1">
                    {vassalTerritories.map(({ territory: t, holder }) => (
                      <button
                        key={t.id}
                        className="w-full flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors text-left"
                        onClick={() => {
                          usePanelStore.getState().openTerritoryModal(t.id);
                          onClose();
                        }}
                      >
                        <div className="flex flex-col min-w-0 mr-2">
                          <span className="text-sm font-bold text-[var(--color-text)] truncate">{t.name}</span>
                          <span className="text-xs text-[var(--color-text-muted)]">{holder}</span>
                        </div>
                        <div className="flex gap-2 text-xs text-[var(--color-text-muted)] shrink-0">
                          <span>控{Math.floor(t.control)}</span>
                          <span>发{Math.floor(t.development)}</span>
                          <span>民{Math.floor(t.populace)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: 经济 */}
          {activeTab === 'economy' && (
            <div className="space-y-4">
              {!playerLedger ? (
                <p className="text-center text-[var(--color-text-muted)] py-4 text-sm">尚无经济数据</p>
              ) : (
                <>
                  {/* Income */}
                  <div className="rounded border border-[var(--color-border)] overflow-hidden">
                    <div className="px-3 py-1.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                      <span className="text-xs font-bold text-[var(--color-accent-green,#27ae60)]">收入</span>
                    </div>
                    <div className="divide-y divide-[var(--color-border)]">
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">领地产出</span>
                        <span className="text-[var(--color-text)]">钱{Math.floor(playerLedger.territoryIncome.money)} 粮{Math.floor(playerLedger.territoryIncome.grain)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">职位俸禄</span>
                        <span className="text-[var(--color-text)]">钱{Math.floor(playerLedger.positionSalary.money)} 粮{Math.floor(playerLedger.positionSalary.grain)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">属下上缴</span>
                        <span className="text-[var(--color-text)]">钱{Math.floor(playerLedger.vassalTribute.money)} 粮{Math.floor(playerLedger.vassalTribute.grain)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">回拨收入</span>
                        <span className="text-[var(--color-text)]">钱{Math.floor(playerLedger.redistributionReceived.money)} 粮{Math.floor(playerLedger.redistributionReceived.grain)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-sm font-bold">
                        <span className="text-[var(--color-accent-green,#27ae60)]">收入合计</span>
                        <span className="text-[var(--color-accent-green,#27ae60)]">钱{Math.floor(playerLedger.totalIncome.money)} 粮{Math.floor(playerLedger.totalIncome.grain)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expense */}
                  <div className="rounded border border-[var(--color-border)] overflow-hidden">
                    <div className="px-3 py-1.5 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                      <span className="text-xs font-bold text-[var(--color-accent-red,#e74c3c)]">支出</span>
                    </div>
                    <div className="divide-y divide-[var(--color-border)]">
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">属下俸禄</span>
                        <span className="text-[var(--color-text)]">钱{Math.floor(playerLedger.subordinateSalaries.money)} 粮{Math.floor(playerLedger.subordinateSalaries.grain)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">军事维持</span>
                        <span className="text-[var(--color-text)]">钱{Math.floor(playerLedger.militaryMaintenance.money)} 粮{Math.floor(playerLedger.militaryMaintenance.grain)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">回拨支出</span>
                        <span className="text-[var(--color-text)]">钱{Math.floor(playerLedger.redistributionPaid.money)} 粮{Math.floor(playerLedger.redistributionPaid.grain)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-[var(--color-text-muted)]">上缴领主</span>
                        <span className="text-[var(--color-text)]">钱{Math.floor(playerLedger.overlordTribute.money)} 粮{Math.floor(playerLedger.overlordTribute.grain)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2 text-sm font-bold">
                        <span className="text-[var(--color-accent-red,#e74c3c)]">支出合计</span>
                        <span className="text-[var(--color-accent-red,#e74c3c)]">钱{Math.floor(playerLedger.totalExpense.money)} 粮{Math.floor(playerLedger.totalExpense.grain)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net */}
                  {(() => {
                    const moneyPositive = playerLedger.net.money >= 0;
                    const grainPositive = playerLedger.net.grain >= 0;
                    return (
                      <div className="flex justify-between px-3 py-2.5 rounded border border-[var(--color-border)] text-sm font-bold">
                        <span className="text-[var(--color-text)]">月净值</span>
                        <span>
                          <span className={moneyPositive ? 'text-[var(--color-accent-green,#27ae60)]' : 'text-[var(--color-accent-red,#e74c3c)]'}>
                            钱{moneyPositive ? '+' : ''}{Math.floor(playerLedger.net.money)}
                          </span>
                          {' '}
                          <span className={grainPositive ? 'text-[var(--color-accent-green,#27ae60)]' : 'text-[var(--color-accent-red,#e74c3c)]'}>
                            粮{grainPositive ? '+' : ''}{Math.floor(playerLedger.net.grain)}
                          </span>
                        </span>
                      </div>
                    );
                  })()}
                </>
              )}
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
                    <span className="text-sm text-[var(--color-text-muted)]">当前回拨率</span>
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
                        const capitalZhouId = terr?.capitalZhouId;
                        const isClan = post.successionLaw === 'clan';
                        return (
                          <div
                            key={post.id}
                            className="flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)]"
                          >
                            <div className="min-w-0">
                              <span className="text-sm text-[var(--color-text)]">
                                {terrName ? `${terrName} ` : ''}{tpl?.name ?? ''}
                              </span>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              {canEdit ? (
                                <button
                                  onClick={() => executeToggleSuccession(post.id, capitalZhouId, territories)}
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
                              {canEdit ? (
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
                const vassals = getVassals(player.id, characters);
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
