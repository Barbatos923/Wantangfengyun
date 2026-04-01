import React from 'react';
import type { Territory } from '@engine/territory/types';
import { ALL_BUILDINGS, buildingMap } from '@data/buildings';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { executeBuild } from '@engine/interaction';

interface BuildMenuProps {
  territory: Territory;
  slotIndex: number;
  onClose: () => void;
}

const BuildMenu: React.FC<BuildMenuProps> = ({ territory, slotIndex, onClose }) => {
  const slot = territory.buildings[slotIndex];
  const isUpgrade = slot.buildingId !== null;

  const player = useCharacterStore((s) => s.playerId ? s.characters.get(s.playerId) : undefined);
  const playerMoney = player?.resources.money ?? 0;
  const playerGrain = player?.resources.grain ?? 0;

  // IDs of buildings already built in this territory (to exclude duplicates)
  const builtIds = new Set(
    territory.buildings.map((b) => b.buildingId).filter((id): id is string => id !== null)
  );

  function handleBuild(buildingId: string, targetLevel: number, moneyCost: number, grainCost: number, duration: number) {
    const playerId = useCharacterStore.getState().playerId;
    if (!playerId) return;
    executeBuild(playerId, territory.id, slotIndex, buildingId, targetLevel, moneyCost, grainCost, duration);
    onClose();
  }

  function renderEffects(buildingId: string, level: number) {
    const def = buildingMap.get(buildingId);
    if (!def) return null;
    const effects: string[] = [];
    if (def.moneyPerLevel) effects.push(`钱+${def.moneyPerLevel * level}/月`);
    if (def.grainPerLevel) effects.push(`粮+${def.grainPerLevel * level}/月`);
    if (def.troopsPerLevel) effects.push(`兵+${def.troopsPerLevel * level}/月`);
    if (def.controlPerMonthPerLevel) effects.push(`控制+${def.controlPerMonthPerLevel * level}/月`);
    if (def.developmentPerMonthPerLevel) effects.push(`发展+${def.developmentPerMonthPerLevel * level}/月`);
    if (def.populacePerMonthPerLevel) effects.push(`民心+${def.populacePerMonthPerLevel * level}/月`);
    if (def.defensePerLevel) effects.push(`防御+${def.defensePerLevel * level}%`);
    if (def.stressReductionPerLevel) effects.push(`压力-${def.stressReductionPerLevel * level}/月`);
    if (def.grainStoragePerLevel) effects.push(`粮储+${def.grainStoragePerLevel * level}`);
    return effects.length > 0 ? (
      <span className="text-[var(--color-accent-green)] text-xs">{effects.join(' · ')}</span>
    ) : null;
  }

  const renderContent = () => {
    if (isUpgrade) {
      // Upgrade mode
      const def = buildingMap.get(slot.buildingId!);
      if (!def) return null;
      const currentLevel = slot.level;
      const targetLevel = currentLevel + 1;
      const moneyCost = def.costMoney * targetLevel;
      const grainCost = def.costGrain * targetLevel;
      const duration = def.constructionMonths * targetLevel;
      const canAfford = playerMoney >= moneyCost && playerGrain >= grainCost;

      return (
        <>
          <div className="mb-3">
            <div className="text-sm text-[var(--color-text-muted)] mb-1">升级建筑</div>
            <div className="text-base font-bold text-[var(--color-text)]">
              {def.name} <span className="text-[var(--color-text-muted)] font-normal text-sm">Lv.{currentLevel} → Lv.{targetLevel}</span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-1">{def.description}</div>
          </div>

          <div className="mb-3 text-xs space-y-1">
            <div className="flex gap-3">
              <span className={playerMoney >= moneyCost ? 'text-[var(--color-text)]' : 'text-[var(--color-accent-red)]'}>
                钱 {moneyCost}
              </span>
              <span className={playerGrain >= grainCost ? 'text-[var(--color-text)]' : 'text-[var(--color-accent-red)]'}>
                粮 {grainCost}
              </span>
              <span className="text-[var(--color-text-muted)]">工期 {duration} 月</span>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs text-[var(--color-text-muted)] mb-1">升级后效果</div>
            {renderEffects(slot.buildingId!, targetLevel)}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (canAfford) handleBuild(slot.buildingId!, targetLevel, moneyCost, grainCost, duration);
              }}
              disabled={!canAfford}
              className={`flex-1 py-1.5 rounded text-sm font-bold transition-colors ${
                canAfford
                  ? 'bg-[var(--color-accent-gold)] text-[var(--color-bg)] hover:opacity-90'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] cursor-not-allowed'
              }`}
            >
              {canAfford ? '确认升级' : '资源不足'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-1.5 rounded text-sm border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              取消
            </button>
          </div>
        </>
      );
    }

    // New construction mode
    const available = ALL_BUILDINGS.filter((b) => {
      if (builtIds.has(b.id)) return false;
      if (b.allowedType !== 'any' && b.allowedType !== territory.territoryType) return false;
      return true;
    });

    return (
      <>
        <div className="text-sm text-[var(--color-text-muted)] mb-3">选择建造</div>
        <div className="overflow-y-auto flex-1 space-y-2">
          {available.length === 0 && (
            <div className="text-xs text-[var(--color-text-muted)] text-center py-4">暂无可建造建筑</div>
          )}
          {available.map((b) => {
            const moneyCost = b.costMoney;
            const grainCost = b.costGrain;
            const duration = b.constructionMonths;
            const canAfford = playerMoney >= moneyCost && playerGrain >= grainCost;

            const effects: string[] = [];
            if (b.moneyPerLevel) effects.push(`钱+${b.moneyPerLevel}/月`);
            if (b.grainPerLevel) effects.push(`粮+${b.grainPerLevel}/月`);
            if (b.troopsPerLevel) effects.push(`兵+${b.troopsPerLevel}/月`);
            if (b.controlPerMonthPerLevel) effects.push(`控制+${b.controlPerMonthPerLevel}/月`);
            if (b.developmentPerMonthPerLevel) effects.push(`发展+${b.developmentPerMonthPerLevel}/月`);
            if (b.populacePerMonthPerLevel) effects.push(`民心+${b.populacePerMonthPerLevel}/月`);
            if (b.defensePerLevel) effects.push(`防御+${b.defensePerLevel}%`);
            if (b.stressReductionPerLevel) effects.push(`压力-${b.stressReductionPerLevel}/月`);
            if (b.grainStoragePerLevel) effects.push(`粮储+${b.grainStoragePerLevel}`);

            return (
              <button
                key={b.id}
                onClick={() => { if (canAfford) handleBuild(b.id, 1, moneyCost, grainCost, duration); }}
                disabled={!canAfford}
                className={`w-full text-left rounded border px-2.5 py-2 transition-colors ${
                  canAfford
                    ? 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] cursor-pointer'
                    : 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-bold text-[var(--color-text)]">{b.name}</span>
                  {!canAfford && (
                    <span className="text-xs text-[var(--color-accent-red)]">资源不足</span>
                  )}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mb-1">{b.description}</div>
                <div className="flex gap-3 text-xs flex-wrap">
                  <span className={playerMoney >= moneyCost ? 'text-[var(--color-text)]' : 'text-[var(--color-accent-red)]'}>
                    钱 {moneyCost}
                  </span>
                  <span className={playerGrain >= grainCost ? 'text-[var(--color-text)]' : 'text-[var(--color-accent-red)]'}>
                    粮 {grainCost}
                  </span>
                  <span className="text-[var(--color-text-muted)]">工期 {duration} 月</span>
                </div>
                {effects.length > 0 && (
                  <div className="text-xs text-[var(--color-accent-green)] mt-1">{effects.join(' · ')}</div>
                )}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-4 max-w-sm w-full mx-4 shadow-xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-[var(--color-accent-gold)]">
            {isUpgrade ? '升级建筑' : '建造建筑'}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none"
          >
            ×
          </button>
        </div>

        {renderContent()}
      </div>
    </div>
  );
};

export default BuildMenu;
