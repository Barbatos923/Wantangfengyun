import React, { useMemo } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { getActualController, getDirectControlLimit } from '@engine/official/officialUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { getTotalTreasury } from '@engine/territory/treasuryUtils';
import { formatAmount, formatAmountSigned } from '@ui/utils/formatAmount';
import { IconCoins, IconGrain, IconSeal, IconBalance, IconSword, IconCastle } from './icons/ResourceIcons';

type ResourceGroup = 'treasury' | 'private' | 'status' | 'power';

interface ResourceItem {
  label: string;
  icon: React.ReactNode;
  value: number;
  change: number;
  title?: string;
  valueStr?: string;
  unit?: string;
  group: ResourceGroup;
}

const GROUP_META: { key: ResourceGroup; label: string }[] = [
  { key: 'treasury', label: '国库' },
  { key: 'private', label: '私产' },
  { key: 'status', label: '声望' },
  { key: 'power', label: '军事' },
];

const ResourceBar: React.FC = () => {
  const player = useCharacterStore((s) => {
    const pid = s.playerId;
    return pid ? s.characters.get(pid) : undefined;
  });
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const playerLedger = useLedgerStore((s) => s.playerLedger);
  const { armies: milArmies, battalions: milBattalions } = useMilitaryStore();

  const resources: ResourceItem[] = useMemo(() => {
    if (!player) {
      return [
        { label: '钱', icon: <IconCoins size={22} className="text-[var(--color-accent-gold)]" />, value: 0, change: 0, unit: '贯', group: 'treasury' },
        { label: '粮', icon: <IconGrain size={22} className="text-[var(--color-accent-gold)]" />, value: 0, change: 0, unit: '斛', group: 'treasury' },
        { label: '钱', icon: <IconCoins size={22} className="text-[var(--color-accent-gold)]" />, value: 0, change: 0, unit: '贯', group: 'private' },
        { label: '粮', icon: <IconGrain size={22} className="text-[var(--color-accent-gold)]" />, value: 0, change: 0, unit: '斛', group: 'private' },
        { label: '名望', icon: <IconSeal size={26} className="text-[var(--color-accent-gold)]" />, value: 0, change: 0, group: 'status' },
        { label: '正统', icon: <IconBalance size={22} className="text-[var(--color-accent-gold)]" />, value: 0, change: 0, group: 'status' },
        { label: '兵力', icon: <IconSword size={22} className="text-[var(--color-accent-gold)]" />, value: 0, change: 0, group: 'power' },
        { label: '领地', icon: <IconCastle size={22} className="text-[var(--color-accent-gold)]" />, value: 0, change: 0, group: 'power' },
      ];
    }

    let territoryCount = 0;
    territories.forEach((t) => {
      if (getActualController(t) === player.id && t.tier === 'zhou') {
        territoryCount++;
      }
    });

    let totalTroops = 0;
    for (const army of milArmies.values()) {
      if (army.ownerId === player.id) {
        for (const batId of army.battalionIds) {
          const bat = milBattalions.get(batId);
          if (bat) totalTroops += bat.currentStrength;
        }
      }
    }

    let treasuryMoneyChange = 0;
    let treasuryGrainChange = 0;
    let privateMoneyChange = 0;
    let privateGrainChange = 0;

    if (playerLedger) {
      privateMoneyChange = playerLedger.privateChange.money;
      privateGrainChange = playerLedger.privateChange.grain;
      treasuryMoneyChange = playerLedger.net.money - privateMoneyChange;
      treasuryGrainChange = playerLedger.net.grain - privateGrainChange;
    }

    const controllerIndex = useTerritoryStore.getState().controllerIndex;
    const treasury = getTotalTreasury(player.id, territories, controllerIndex);

    const treasuryMoneyTitle = playerLedger
      ? `领地产出: ${formatAmount(playerLedger.territoryIncome.money)}\n属下上缴: ${formatAmount(playerLedger.vassalTribute.money)}\n回拨收入: ${formatAmount(playerLedger.redistributionReceived.money)}\n属下俸禄: -${formatAmount(playerLedger.subordinateSalaries.money)}\n回拨支出: -${formatAmount(playerLedger.redistributionPaid.money)}\n上缴领主: -${formatAmount(playerLedger.overlordTribute.money)}`
      : undefined;
    const treasuryGrainTitle = playerLedger
      ? `领地产出: ${formatAmount(playerLedger.territoryIncome.grain)}\n属下上缴: ${formatAmount(playerLedger.vassalTribute.grain)}\n回拨收入: ${formatAmount(playerLedger.redistributionReceived.grain)}\n军事维持: -${formatAmount(playerLedger.militaryMaintenance.grain)}\n回拨支出: -${formatAmount(playerLedger.redistributionPaid.grain)}\n上缴领主: -${formatAmount(playerLedger.overlordTribute.grain)}`
      : undefined;
    const privateMoneyTitle = playerLedger
      ? `职位俸禄: ${formatAmount(playerLedger.positionSalary.money)}`
      : undefined;
    const privateGrainTitle = playerLedger
      ? `职位俸禄: ${formatAmount(playerLedger.positionSalary.grain)}`
      : undefined;

    return [
      { label: '钱', icon: <IconCoins size={22} className="text-[var(--color-accent-gold)]" />, value: treasury.money, change: treasuryMoneyChange, title: treasuryMoneyTitle, unit: '贯', group: 'treasury' },
      { label: '粮', icon: <IconGrain size={22} className="text-[var(--color-accent-gold)]" />, value: treasury.grain, change: treasuryGrainChange, title: treasuryGrainTitle, unit: '斛', group: 'treasury' },
      { label: '钱', icon: <IconCoins size={22} className="text-[var(--color-accent-gold)]" />, value: player.resources.money, change: privateMoneyChange, title: privateMoneyTitle, unit: '贯', group: 'private' },
      { label: '粮', icon: <IconGrain size={22} className="text-[var(--color-accent-gold)]" />, value: player.resources.grain, change: privateGrainChange, title: privateGrainTitle, unit: '斛', group: 'private' },
      { label: '名望', icon: <IconSeal size={26} className="text-[var(--color-accent-gold)]" />, value: player.resources.prestige, change: 0, group: 'status' },
      { label: '正统', icon: <IconBalance size={22} className="text-[var(--color-accent-gold)]" />, value: player.resources.legitimacy, change: 0, group: 'status' },
      { label: '兵力', icon: <IconSword size={22} className="text-[var(--color-accent-gold)]" />, value: totalTroops, change: 0, group: 'power' },
      { label: '领地', icon: <IconCastle size={22} className="text-[var(--color-accent-gold)]" />, value: territoryCount, change: 0, valueStr: `${territoryCount}/${getDirectControlLimit(player)}`, group: 'power' },
    ];
  }, [player, characters, territories, playerLedger, milArmies, milBattalions]);

  // 按组聚合
  const grouped = GROUP_META.map((g) => ({
    ...g,
    items: resources.filter((r) => r.group === g.key),
  }));

  return (
    <div
      className="relative"
      style={{
        background: 'linear-gradient(180deg, #1e1a14 0%, #151110 100%)',
        borderBottom: '1px solid var(--color-border)',
        borderLeft: '1px solid var(--color-border)',
        borderBottomLeftRadius: '6px',
      }}
    >
      {/* 顶部金线 */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{
        background: 'linear-gradient(90deg, transparent, rgba(184,154,83,0.4) 30%, rgba(184,154,83,0.3) 100%)',
      }} />
      {/* 左侧装饰边 — 书简卷边 */}
      <div className="absolute top-0 left-0 bottom-0 w-px" style={{
        background: 'linear-gradient(180deg, rgba(184,154,83,0.3) 0%, rgba(184,154,83,0.15) 100%)',
      }} />
      {/* 底部左角装饰纹 */}
      <div className="absolute bottom-0 left-0" style={{
        width: '20px',
        height: '1px',
        background: 'linear-gradient(90deg, rgba(184,154,83,0.35), transparent)',
      }} />

      <div className="flex items-stretch py-1.5 pl-4 pr-2">
        {grouped.map((group, gi) => (
          <React.Fragment key={group.key}>
            {gi > 0 && (
              <div className="mx-3 my-1 shrink-0" style={{
                width: '1px',
                background: 'linear-gradient(180deg, transparent 0%, var(--color-border) 20%, var(--color-border) 80%, transparent 100%)',
              }} />
            )}
            <div className="flex items-center gap-1">
              {/* 组标题 */}
              <span
                className="text-[var(--color-text)] text-xs font-bold tracking-[0.2em] select-none shrink-0 mr-1"
              >
                {group.label}
              </span>
              {/* 组内资源项 */}
              {group.items.map((res, ri) => (
                <div
                  key={ri}
                  className="flex items-center gap-1.5 px-2 py-1 rounded cursor-default transition-colors hover:bg-[var(--color-bg-surface)]"
                  title={res.title}
                >
                  <div className="w-6 flex items-center justify-center shrink-0">
                    {res.icon}
                  </div>
                  <div className="flex flex-col items-start leading-none">
                    <span className="flex items-baseline">
                      <span
                        className="text-[var(--color-text)] text-sm font-bold"
                        style={{ fontFeatureSettings: '"tnum"' }}
                      >
                        {res.valueStr ?? formatAmount(res.value)}
                      </span>
                      {res.unit && (
                        <span className="text-[var(--color-text)] text-sm font-bold">{res.unit}</span>
                      )}
                    </span>
                    {res.change !== 0 && (
                      <span
                        className={`text-xs ${
                          res.change > 0
                            ? 'text-[var(--color-text)] opacity-60'
                            : 'text-[var(--color-accent-red)]'
                        }`}
                        style={{ fontFeatureSettings: '"tnum"', marginTop: '1px' }}
                      >
                        {formatAmountSigned(res.change)}{res.unit ?? ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ResourceBar;
