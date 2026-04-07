import React, { useMemo } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { getActualController, getDirectControlLimit } from '@engine/official/officialUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { getTotalTreasury } from '@engine/territory/treasuryUtils';
import { formatAmount, formatAmountSigned } from '@ui/utils/formatAmount';

function formatValue(value: number): string {
  return formatAmount(value);
}

function formatChange(change: number): string {
  if (change === 0) return '';
  return formatAmountSigned(change);
}

interface ResourceItem {
  label: string;
  icon: string;
  value: number;
  change: number;
  title?: string;
  valueStr?: string; // 自定义显示文本（如 "3/4"）
}

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
        { label: '国库钱', icon: '💰', value: 0, change: 0 },
        { label: '国库粮', icon: '🌾', value: 0, change: 0 },
        { label: '私产钱', icon: '💰', value: 0, change: 0 },
        { label: '私产粮', icon: '🌾', value: 0, change: 0 },
        { label: '名望', icon: '⭐', value: 0, change: 0 },
        { label: '兵力', icon: '⚔', value: 0, change: 0 },
        { label: '领地', icon: '🏯', value: 0, change: 0 },
        { label: '势力', icon: '🏴', value: 0, change: 0 },
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

    // 国库月变动 = net - 私产变动（近似：国库变动 = 总变动 - 俸禄收入 + 私产扣费）
    // 私产月变动 = privateChange
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
      { label: '国库钱', icon: '💰', value: treasury.money, change: treasuryMoneyChange, title: treasuryMoneyTitle },
      { label: '国库粮', icon: '🌾', value: treasury.grain, change: treasuryGrainChange, title: treasuryGrainTitle },
      { label: '私产钱', icon: '💰', value: player.resources.money, change: privateMoneyChange, title: privateMoneyTitle },
      { label: '私产粮', icon: '🌾', value: player.resources.grain, change: privateGrainChange, title: privateGrainTitle },
      { label: '名望', icon: '⭐', value: player.resources.prestige, change: 0 },
      { label: '正统性', icon: '🏛', value: player.resources.legitimacy, change: 0 },
      { label: '兵力', icon: '⚔', value: totalTroops, change: 0 },
      { label: '领地', icon: '🏯', value: territoryCount, change: 0, valueStr: `${territoryCount}/${getDirectControlLimit(player)}` },
    ];
  }, [player, characters, territories, playerLedger, milArmies, milBattalions]);

  return (
    <div className="flex items-center justify-evenly bg-[var(--color-bg-panel)] border-b border-[var(--color-border)] px-4 py-2 shrink-0">
      {resources.map((res) => (
        <div key={res.label} className="flex items-center gap-1.5 text-sm" title={res.title}>
          <span className="text-base">{res.icon}</span>
          <span className="text-[var(--color-accent-gold)] font-medium">{res.label}</span>
          <span className="text-[var(--color-text)] font-bold">{res.valueStr ?? formatValue(res.value)}</span>
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
