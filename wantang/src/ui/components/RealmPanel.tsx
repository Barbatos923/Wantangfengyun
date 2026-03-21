import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { usePanelStore } from '@ui/stores/panelStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { calculateMonthlyIncome } from '@engine/territory/territoryUtils';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { calculateMonthlyLedger, getVassals, getDynamicTitle } from '@engine/official/officialUtils';

interface RealmPanelProps {
  onClose: () => void;
}

type TabKey = 'territories' | 'economy' | 'system';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'territories', label: '领地' },
  { key: 'economy', label: '经济' },
  { key: 'system', label: '体制' },
];

const CENTRALIZATION_DESCRIPTIONS: { level: number; desc: string }[] = [
  { level: 1, desc: '常规收入，下属可自由宣战扩张' },
  { level: 2, desc: '可剥夺下属头衔，可更改继承法' },
  { level: 3, desc: '下属无牵制则不可内部宣战' },
  { level: 4, desc: '下属禁止一切战争，可指定继承人' },
];

const PLACEHOLDER_SYSTEMS = [
  '继承体制',
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
    (t) => t.actualControllerId === playerId && t.tier === 'zhou',
  );

  // 臣属领地：效忠于玩家的角色所持有的州
  const vassalTerritories: { territory: typeof playerZhouTerritories[0]; holder: string }[] = [];
  if (player) {
    const vassals = getVassals(player.id, characters);
    for (const v of vassals) {
      for (const tid of v.controlledTerritoryIds) {
        const t = territories.get(tid);
        if (t && t.tier === 'zhou') {
          vassalTerritories.push({ territory: t, holder: v.name });
        }
      }
    }
  }

  const playerTerritories = Array.from(territories.values()).filter(
    (t) => t.actualControllerId === playerId,
  );
  const highestTier =
    playerTerritories.find((t) => t.tier === 'guo') ||
    playerTerritories.find((t) => t.tier === 'dao') ||
    playerTerritories[0];
  const centralization = highestTier?.centralization ?? 1;

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
              {/* Centralization levels */}
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">集权等级</h3>
                <div className="space-y-1.5">
                  {CENTRALIZATION_DESCRIPTIONS.map(({ level, desc }) => {
                    const isActive = level === centralization;
                    return (
                      <div
                        key={level}
                        className={`flex items-start gap-3 px-3 py-2 rounded border transition-colors ${
                          isActive
                            ? 'border-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]/40'
                            : 'border-[var(--color-border)]'
                        }`}
                      >
                        <span
                          className={`text-sm font-bold shrink-0 ${
                            isActive
                              ? 'text-[var(--color-accent-gold)]'
                              : 'text-[var(--color-text-muted)]'
                          }`}
                        >
                          {level}级
                        </span>
                        <span
                          className={`text-sm ${
                            isActive ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'
                          }`}
                        >
                          {desc}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

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
