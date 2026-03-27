import React, { useMemo } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { calculateMonthlyIncome } from '@engine/territory/territoryUtils';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { getActualController } from '@engine/official/officialUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';

function formatValue(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return Math.floor(value).toLocaleString();
}

function formatChange(change: number): string {
  if (change === 0) return '';
  const sign = change > 0 ? '+' : '';
  return `${sign}${Math.floor(change)}`;
}

interface ResourceItem {
  label: string;
  icon: string;
  value: number;
  change: number;
  title?: string;
}

const ResourceBar: React.FC = () => {
  const player = useCharacterStore((s) => {
    const pid = s.playerId;
    return pid ? s.characters.get(pid) : undefined;
  });
  const territories = useTerritoryStore((s) => s.territories);
  const playerLedger = useLedgerStore((s) => s.playerLedger);
  const { armies: milArmies, battalions: milBattalions } = useMilitaryStore();

  const resources: ResourceItem[] = useMemo(() => {
    if (!player) {
      return [
        { label: '钱', icon: '💰', value: 0, change: 0 },
        { label: '粮', icon: '🌾', value: 0, change: 0 },
        { label: '名望', icon: '⭐', value: 0, change: 0 },
        { label: '合法性', icon: '🏛', value: 0, change: 0 },
        { label: '兵力', icon: '⚔', value: 0, change: 0 },
        { label: '领地', icon: '🏯', value: 0, change: 0 },
      ];
    }

    // 计算每月总产出
    let monthlyMoney = 0;
    let monthlyGrain = 0;
    let territoryCount = 0;
    const abilities = getEffectiveAbilities(player);

    // 领地计数
    territories.forEach((t) => {
      if (getActualController(t) === player.id && t.tier === 'zhou') {
        territoryCount++;
      }
    });

    // 从 MilitaryStore 计算玩家总兵力
    let totalTroops = 0;
    for (const army of milArmies.values()) {
      if (army.ownerId === player.id) {
        for (const batId of army.battalionIds) {
          const bat = milBattalions.get(batId);
          if (bat) totalTroops += bat.currentStrength;
        }
      }
    }

    if (playerLedger) {
      monthlyMoney = playerLedger.net.money;
      monthlyGrain = playerLedger.net.grain;
    } else {
      // Fallback: territory income calculation
      territories.forEach((t) => {
        if (getActualController(t) === player.id && t.tier === 'zhou') {
          const income = calculateMonthlyIncome(t, abilities);
          monthlyMoney += income.money;
          monthlyGrain += income.grain;
        }
      });
    }

    const moneyTitle = playerLedger
      ? `领地产出: ${Math.floor(playerLedger.territoryIncome.money)}\n职位俸禄: ${Math.floor(playerLedger.positionSalary.money)}\n属下上缴: ${Math.floor(playerLedger.vassalTribute.money)}\n回拨收入: ${Math.floor(playerLedger.redistributionReceived.money)}\n属下俸禄: -${Math.floor(playerLedger.subordinateSalaries.money)}\n回拨支出: -${Math.floor(playerLedger.redistributionPaid.money)}\n上缴领主: -${Math.floor(playerLedger.overlordTribute.money)}`
      : undefined;
    const grainTitle = playerLedger
      ? `领地产出: ${Math.floor(playerLedger.territoryIncome.grain)}\n职位俸禄: ${Math.floor(playerLedger.positionSalary.grain)}\n属下上缴: ${Math.floor(playerLedger.vassalTribute.grain)}\n回拨收入: ${Math.floor(playerLedger.redistributionReceived.grain)}\n属下俸禄: -${Math.floor(playerLedger.subordinateSalaries.grain)}\n回拨支出: -${Math.floor(playerLedger.redistributionPaid.grain)}\n上缴领主: -${Math.floor(playerLedger.overlordTribute.grain)}`
      : undefined;

    return [
      { label: '钱(贯)', icon: '💰', value: player.resources.money, change: monthlyMoney, title: moneyTitle },
      { label: '粮(斛)', icon: '🌾', value: player.resources.grain, change: monthlyGrain, title: grainTitle },
      { label: '名望', icon: '⭐', value: player.resources.prestige, change: 0 },
      { label: '合法性', icon: '🏛', value: player.resources.legitimacy, change: 0 },
      { label: '兵力', icon: '⚔', value: totalTroops, change: 0 },
      { label: '领地', icon: '🏯', value: territoryCount, change: 0 },
    ];
  }, [player, territories, playerLedger, milArmies, milBattalions]);

  return (
    <div className="flex items-center justify-evenly bg-[var(--color-bg-panel)] border-b border-[var(--color-border)] px-4 py-2 shrink-0">
      {resources.map((res) => (
        <div key={res.label} className="flex items-center gap-1.5 text-sm" title={res.title}>
          <span className="text-base">{res.icon}</span>
          <span className="text-[var(--color-accent-gold)] font-medium">{res.label}</span>
          <span className="text-[var(--color-text)] font-bold">{formatValue(res.value)}</span>
          {res.change !== 0 && (
            <span
              className={`text-xs ${
                res.change > 0
                  ? 'text-[var(--color-accent-green)]'
                  : 'text-[var(--color-accent-red)]'
              }`}
            >
              {formatChange(res.change)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default ResourceBar;
