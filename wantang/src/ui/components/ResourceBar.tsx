import React, { useMemo } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { getActualController, getDirectControlLimit } from '@engine/official/officialUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { getTotalTreasury } from '@engine/territory/treasuryUtils';
import { formatAmount, formatAmountSigned } from '@ui/utils/formatAmount';
import { IconCoins, IconGrain, IconSeal, IconBalance, IconSword, IconCastle } from './icons/ResourceIcons';
import { Tooltip } from './base/Tooltip';
import { ResourceTooltip, type TooltipEntry } from './ResourceTooltip';

type ResourceGroup = 'treasury' | 'private' | 'status' | 'power';

interface ResourceItem {
  label: string;
  icon: React.ReactNode;
  value: number;
  change: number;
  valueStr?: string;
  unit?: string;
  group: ResourceGroup;
  tooltipTitle?: string;
  tooltipEntries?: TooltipEntry[];
  tooltipShowTotal?: boolean;
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

    // 结构化 tooltip 数据
    const treasuryMoneyTooltip: TooltipEntry[] | undefined = playerLedger ? [
      { label: '领地产出', value: playerLedger.territoryIncome.money },
      { label: '属下上缴', value: playerLedger.vassalTribute.money },
      { label: '回拨收入', value: playerLedger.redistributionReceived.money },
      { label: '属下俸禄', value: -playerLedger.subordinateSalaries.money },
      { label: '回拨支出', value: -playerLedger.redistributionPaid.money },
      { label: '上缴领主', value: -playerLedger.overlordTribute.money },
    ] : undefined;

    const treasuryGrainTooltip: TooltipEntry[] | undefined = playerLedger ? [
      { label: '领地产出', value: playerLedger.territoryIncome.grain },
      { label: '属下上缴', value: playerLedger.vassalTribute.grain },
      { label: '回拨收入', value: playerLedger.redistributionReceived.grain },
      { label: '军事维持', value: -playerLedger.militaryMaintenance.grain },
      { label: '回拨支出', value: -playerLedger.redistributionPaid.grain },
      { label: '上缴领主', value: -playerLedger.overlordTribute.grain },
    ] : undefined;

    const privateMoneyTooltip: TooltipEntry[] | undefined = playerLedger ? [
      { label: '职位俸禄', value: playerLedger.positionSalary.money },
    ] : undefined;

    const privateGrainTooltip: TooltipEntry[] | undefined = playerLedger ? [
      { label: '职位俸禄', value: playerLedger.positionSalary.grain },
    ] : undefined;

    // 正统性 tooltip：当前值 vs 期望值
    const expectedLeg = useTerritoryStore.getState().expectedLegitimacy.get(player.id) ?? null;
    const legitimacyTooltip: TooltipEntry[] = [
      { label: '当前正统性', value: player.resources.legitimacy, neutral: true },
    ];
    if (expectedLeg !== null) {
      legitimacyTooltip.push({ label: '期望正统性', value: expectedLeg, neutral: true });
    }

    // 兵力 tooltip：各军队兵力
    const armyTooltip: TooltipEntry[] = [];
    for (const army of milArmies.values()) {
      if (army.ownerId === player.id) {
        let armyStrength = 0;
        for (const batId of army.battalionIds) {
          const bat = milBattalions.get(batId);
          if (bat) armyStrength += bat.currentStrength;
        }
        armyTooltip.push({ label: army.name, value: armyStrength });
      }
    }

    return [
      { label: '钱', icon: <IconCoins size={22} className="text-[var(--color-accent-gold)]" />, value: treasury.money, change: treasuryMoneyChange, unit: '贯', group: 'treasury', tooltipTitle: '国库·钱 月结明细', tooltipEntries: treasuryMoneyTooltip },
      { label: '粮', icon: <IconGrain size={22} className="text-[var(--color-accent-gold)]" />, value: treasury.grain, change: treasuryGrainChange, unit: '斛', group: 'treasury', tooltipTitle: '国库·粮 月结明细', tooltipEntries: treasuryGrainTooltip },
      { label: '钱', icon: <IconCoins size={22} className="text-[var(--color-accent-gold)]" />, value: player.resources.money, change: privateMoneyChange, unit: '贯', group: 'private', tooltipTitle: '私产·钱 月结明细', tooltipEntries: privateMoneyTooltip },
      { label: '粮', icon: <IconGrain size={22} className="text-[var(--color-accent-gold)]" />, value: player.resources.grain, change: privateGrainChange, unit: '斛', group: 'private', tooltipTitle: '私产·粮 月结明细', tooltipEntries: privateGrainTooltip },
      { label: '名望', icon: <IconSeal size={26} className="text-[var(--color-accent-gold)]" />, value: player.resources.prestige, change: 0, group: 'status', tooltipTitle: '名望', tooltipEntries: [{ label: '当前名望', value: player.resources.prestige, neutral: true }], tooltipShowTotal: false },
      { label: '正统', icon: <IconBalance size={22} className="text-[var(--color-accent-gold)]" />, value: player.resources.legitimacy, change: 0, group: 'status', tooltipTitle: '正统性', tooltipEntries: legitimacyTooltip, tooltipShowTotal: false },
      { label: '兵力', icon: <IconSword size={22} className="text-[var(--color-accent-gold)]" />, value: totalTroops, change: 0, group: 'power', tooltipTitle: '兵力分布', tooltipEntries: armyTooltip.length > 0 ? armyTooltip : [{ label: '无军队', value: 0 }], tooltipShowTotal: false },
      { label: '领地', icon: <IconCastle size={22} className="text-[var(--color-accent-gold)]" />, value: territoryCount, change: 0, valueStr: `${territoryCount}/${getDirectControlLimit(player)}`, group: 'power', tooltipTitle: '领地', tooltipEntries: [{ label: '直辖州数', value: territoryCount, neutral: true }, { label: '直辖上限', value: getDirectControlLimit(player), neutral: true }], tooltipShowTotal: false },
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
              {group.items.map((res, ri) => {
                const tooltipContent = res.tooltipEntries ? (
                  <ResourceTooltip
                    title={res.tooltipTitle!}
                    entries={res.tooltipEntries}
                    unit={res.unit}
                    showTotal={res.tooltipShowTotal}
                  />
                ) : null;

                const item = (
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 rounded cursor-default transition-colors hover:bg-[var(--color-bg-surface)]"
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
                );

                return tooltipContent ? (
                  <Tooltip key={ri} content={tooltipContent}>
                    {item}
                  </Tooltip>
                ) : (
                  <React.Fragment key={ri}>{item}</React.Fragment>
                );
              })}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ResourceBar;
