// ===== 宣战面板 =====

import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { useWarStore } from '@engine/military/WarStore';
import type { CasusBelli } from '@engine/military/types';
import { CASUS_BELLI_NAMES } from '@engine/military/types';
import { getAvailableCasusBelli, getWarCost, getDeJureTargets } from '@engine/military/warCalc';
import { ALL_EDGES } from '@data/mapTopology';
import { positionMap } from '@data/positions';

interface DeclareWarFlowProps {
  targetId: string;
  onClose: () => void;
}

const DeclareWarFlow: React.FC<DeclareWarFlowProps> = ({ targetId, onClose }) => {
  const [selectedCasus, setSelectedCasus] = useState<CasusBelli | null>(null);
  const [selectedAnnexTarget, setSelectedAnnexTarget] = useState<string>('');

  const target = useCharacterStore((s) => s.characters.get(targetId));
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => (playerId ? s.characters.get(playerId) : undefined));
  const territories = useTerritoryStore((s) => s.territories);
  const era = useTurnManager((s) => s.era);
  const currentDate = useTurnManager((s) => s.currentDate);

  if (!target || !player || !playerId) {
    onClose();
    return null;
  }

  const isVassal = target.overlordId === playerId;
  const availableCasus = isVassal ? [] : getAvailableCasusBelli(playerId, targetId, era, territories);
  const disabledReason = isVassal
    ? '该角色是你的附庸，无法直接宣战'
    : availableCasus.length === 0
      ? '你对该角色没有可用的战争理由'
      : null;

  // 法理宣称目标领地
  const deJureTargetIds = selectedCasus === 'deJureClaim'
    ? getDeJureTargets(playerId, targetId, territories)
    : [];

  // 武力兼并：defender 控制的州中与 attacker 控制的州相邻的
  const annexTargets: string[] = (() => {
    if (selectedCasus !== 'annexation') return [];

    // attacker 控制的州
    const attackerZhouIds = new Set<string>();
    for (const t of territories.values()) {
      if (t.tier !== 'zhou') continue;
      const mainPost = t.posts.find((p) => {
        const tpl = positionMap.get(p.templateId);
        return tpl?.grantsControl === true;
      });
      if (mainPost?.holderId === playerId) attackerZhouIds.add(t.id);
    }

    // defender 控制的州
    const defenderZhouIds: string[] = [];
    for (const t of territories.values()) {
      if (t.tier !== 'zhou') continue;
      const mainPost = t.posts.find((p) => {
        const tpl = positionMap.get(p.templateId);
        return tpl?.grantsControl === true;
      });
      if (mainPost?.holderId === targetId) defenderZhouIds.push(t.id);
    }

    // 过滤出与 attacker 相邻的
    return defenderZhouIds.filter((defId) =>
      ALL_EDGES.some(
        (e) =>
          (e.from === defId && attackerZhouIds.has(e.to)) ||
          (e.to === defId && attackerZhouIds.has(e.from)),
      ),
    );
  })();

  // 确认宣战
  const handleConfirm = () => {
    if (!selectedCasus) return;

    let selectedTargets: string[] = [];
    if (selectedCasus === 'deJureClaim') {
      selectedTargets = deJureTargetIds;
    } else if (selectedCasus === 'annexation') {
      if (!selectedAnnexTarget) return;
      selectedTargets = [selectedAnnexTarget];
    }

    const cost = getWarCost(selectedCasus, era);
    useCharacterStore.getState().addResources(playerId, {
      prestige: cost.prestige,
      legitimacy: cost.legitimacy,
    });
    useWarStore.getState().declareWar(playerId, targetId, selectedCasus, selectedTargets, currentDate);
    onClose();
  };

  const canConfirm = selectedCasus !== null && (
    selectedCasus === 'deJureClaim'
      ? deJureTargetIds.length > 0
      : selectedAnnexTarget !== ''
  );

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg p-4 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--color-accent-gold)]">
            向 {target.name} 宣战
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* 战争理由列表 */}
        <div className="mb-4">
          {disabledReason ? (
            <div className="px-3 py-4 rounded border border-[var(--color-border)] text-center">
              <div className="text-sm text-[var(--color-text-muted)]">{disabledReason}</div>
            </div>
          ) : (
          <>
          <div className="text-xs text-[var(--color-text-muted)] mb-2">选择战争理由</div>
          <div className="space-y-1.5">
            {availableCasus.map((casus) => {
              const cost = getWarCost(casus, era);
              const isSelected = selectedCasus === casus;
              return (
                <button
                  key={casus}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded border transition-colors text-left ${
                    isSelected
                      ? 'border-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]/40'
                      : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)]'
                  }`}
                  onClick={() => {
                    setSelectedCasus(casus);
                    setSelectedAnnexTarget('');
                  }}
                >
                  <span className={`text-sm font-bold ${isSelected ? 'text-[var(--color-accent-gold)]' : 'text-[var(--color-text)]'}`}>
                    {CASUS_BELLI_NAMES[casus]}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    名望 {cost.prestige}
                    {cost.legitimacy !== 0 && ` / 合法性 ${cost.legitimacy}`}
                  </span>
                </button>
              );
            })}
          </div>
          </>
          )}
        </div>

        {/* 法理宣称：显示目标领地列表 */}
        {selectedCasus === 'deJureClaim' && (
          <div className="mb-4">
            <div className="text-xs text-[var(--color-text-muted)] mb-2">法理宣称目标</div>
            {deJureTargetIds.length === 0 ? (
              <div className="text-xs text-[var(--color-accent-red)]">无法理宣称目标</div>
            ) : (
              <div className="space-y-1">
                {deJureTargetIds.map((id) => {
                  const t = territories.get(id);
                  return (
                    <div
                      key={id}
                      className="px-3 py-1.5 rounded border border-[var(--color-border)] text-xs text-[var(--color-text)]"
                    >
                      {t?.name ?? id}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 武力兼并：选择目标州 */}
        {selectedCasus === 'annexation' && (
          <div className="mb-4">
            <div className="text-xs text-[var(--color-text-muted)] mb-2">选择目标州</div>
            {annexTargets.length === 0 ? (
              <div className="text-xs text-[var(--color-accent-red)]">无相邻可兼并州</div>
            ) : (
              <select
                className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent-gold)]"
                value={selectedAnnexTarget}
                onChange={(e) => setSelectedAnnexTarget(e.target.value)}
              >
                <option value="">-- 请选择 --</option>
                {annexTargets.map((id) => {
                  const t = territories.get(id);
                  return (
                    <option key={id} value={id}>
                      {t?.name ?? id}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        )}

        {/* 确认按钮 */}
        <button
          className={`w-full py-2 rounded text-sm font-bold transition-colors ${
            canConfirm
              ? 'bg-[var(--color-accent-red)]/80 hover:bg-[var(--color-accent-red)] text-white'
              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] cursor-not-allowed'
          }`}
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          确认宣战
        </button>
      </div>
    </div>
  );
};

export default DeclareWarFlow;
