// ===== 宣战面板 =====

import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import type { CasusBelli, CasusBelliEval } from '@engine/military/types';
import { evaluateAllCasusBelli, getDeJureTargets, getAnnexTargets, getWarPrestigeReward } from '@engine/military/warCalc';
import { executeDeclareWar } from '@engine/interaction';
import { canAffordWarCost } from '@engine/official/legitimacyCalc';
import { useWarStore } from '@engine/military/WarStore';
import { toAbsoluteDay } from '@engine/dateUtils';
import { Modal, ModalHeader, Button, Select } from './base';

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
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const era = useTurnManager((s) => s.era);
  const currentDate = useTurnManager((s) => s.currentDate);

  if (!target || !player || !playerId) {
    onClose();
    return null;
  }

  // 停战 / 同盟检查
  const currentDay = toAbsoluteDay(currentDate);
  const hasTruce = useWarStore.getState().hasTruce(playerId, targetId, currentDay);
  const hasAlliance = useWarStore.getState().hasAlliance(playerId, targetId, currentDay);

  // 评估所有可见的宣战理由
  const casusBelliEvals: CasusBelliEval[] = evaluateAllCasusBelli({
    attackerId: playerId,
    defenderId: targetId,
    era,
    territories,
    characters,
    hasTruce,
    hasAlliance,
  });

  // 选中的理由是否可用
  const selectedEval = casusBelliEvals.find((e) => e.id === selectedCasus);
  const isSelectedAvailable = selectedEval && selectedEval.failureReason === null;

  // 法理宣称目标领地
  const deJureTargetIds = selectedCasus === 'deJureClaim'
    ? getDeJureTargets(playerId, targetId, territories)
    : [];

  // 武力兼并目标州
  const annexTargets = selectedCasus === 'annexation'
    ? getAnnexTargets(playerId, targetId, territories)
    : [];

  // 确认宣战
  const handleConfirm = () => {
    if (!selectedCasus || !isSelectedAvailable) return;

    let selectedTargets: string[] = [];
    if (selectedCasus === 'deJureClaim') {
      selectedTargets = deJureTargetIds;
    } else if (selectedCasus === 'annexation') {
      if (!selectedAnnexTarget) return;
      selectedTargets = [selectedAnnexTarget];
    }

    const cost = selectedEval!.cost; // 含停战惩罚
    const ok = executeDeclareWar(playerId, targetId, selectedCasus, selectedTargets, currentDate, cost);
    if (!ok) {
      // eslint-disable-next-line no-alert
      alert('局势已发生变化，宣战未生效。');
      return;
    }
    onClose();
  };

  const selectedCost = selectedEval?.cost ?? { prestige: 0, legitimacy: 0 };
  const canAfford = canAffordWarCost(player.resources, selectedCost);

  const canConfirm = isSelectedAvailable && canAfford && (
    selectedCasus === 'deJureClaim'
      ? deJureTargetIds.length > 0
      : selectedCasus === 'annexation'
        ? selectedAnnexTarget !== ''
        : true
  );

  return (
    <Modal size="md" zIndex={30} onOverlayClick={onClose}>
      <ModalHeader title={`向 ${target.name} 宣战`} onClose={onClose} />
      <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">

        {/* 战争理由列表 */}
        <div className="mb-4">
          {casusBelliEvals.length === 0 ? (
            <div className="px-3 py-4 rounded border border-[var(--color-border)] text-center">
              <div className="text-sm text-[var(--color-text-muted)]">你对该角色没有可用的战争理由</div>
            </div>
          ) : (
            <>
              <div className="text-xs text-[var(--color-text-muted)] mb-2">选择战争理由</div>
              <div className="space-y-1.5">
                {casusBelliEvals.map((evalItem) => {
                  const isDisabled = evalItem.failureReason !== null;
                  const isSelected = selectedCasus === evalItem.id;
                  return (
                    <button
                      key={evalItem.id}
                      className={`w-full flex flex-col px-3 py-2 rounded border transition-colors text-left ${
                        isDisabled
                          ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'border-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]/40'
                            : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)]'
                      }`}
                      disabled={isDisabled}
                      onClick={() => {
                        if (!isDisabled) {
                          setSelectedCasus(evalItem.id);
                          setSelectedAnnexTarget('');
                        }
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-sm font-bold ${
                          isDisabled
                            ? 'text-[var(--color-text-muted)]'
                            : isSelected
                              ? 'text-[var(--color-accent-gold)]'
                              : 'text-[var(--color-text)]'
                        }`}>
                          {evalItem.name}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          宣战成本：名望{evalItem.cost.prestige}
                          {evalItem.cost.legitimacy !== 0 && `，正统性${evalItem.cost.legitimacy}`}
                        </span>
                      </div>
                      {isDisabled && (
                        <span className="text-xs text-[var(--color-accent-red)] mt-0.5">
                          {evalItem.failureReason}
                        </span>
                      )}
                      {evalItem.trucePenalty && !isDisabled && (
                        <span className="text-xs text-[var(--color-accent-red)] mt-0.5">
                          停战期内宣战（额外 名望{evalItem.trucePenalty.prestige} 正统性{evalItem.trucePenalty.legitimacy}）
                        </span>
                      )}
                      {evalItem.allianceBetrayal && !isDisabled && (
                        <span className="text-xs text-[var(--color-accent-red)] font-bold mt-0.5">
                          背弃盟约（额外 名望{evalItem.allianceBetrayal.prestige} 正统性{evalItem.allianceBetrayal.legitimacy}）
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 法理宣称：显示目标领地列表 */}
        {selectedCasus === 'deJureClaim' && isSelectedAvailable && (
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
        {selectedCasus === 'annexation' && isSelectedAvailable && (
          <div className="mb-4">
            <div className="text-xs text-[var(--color-text-muted)] mb-2">选择目标州</div>
            {annexTargets.length === 0 ? (
              <div className="text-xs text-[var(--color-accent-red)]">无相邻可兼并州</div>
            ) : (
              <Select
                className="w-full"
                value={selectedAnnexTarget}
                onChange={setSelectedAnnexTarget}
                options={[
                  { value: '', label: '-- 请选择 --' },
                  ...annexTargets.map((id) => {
                    const t = territories.get(id);
                    return { value: id, label: t?.name ?? id };
                  }),
                ]}
              />
            )}
          </div>
        )}

        {/* 后果预览 */}
        {selectedCasus && isSelectedAvailable && (() => {
          const reward = getWarPrestigeReward(selectedCasus, era);
          const targetNames = selectedCasus === 'annexation' && selectedAnnexTarget
            ? [territories.get(selectedAnnexTarget)?.name ?? selectedAnnexTarget]
            : selectedCasus === 'deJureClaim'
              ? deJureTargetIds.map(id => territories.get(id)?.name ?? id)
              : [];
          return (
            <div className="mb-2 rounded border border-[var(--color-border)] p-2.5 text-xs space-y-1">
              <div className="text-[var(--color-text-muted)] font-bold mb-1">战争后果</div>
              <div className="text-[var(--color-accent-green,#22c55e)]">
                胜利：
                {selectedCasus === 'independence' ? '独立成功，获得辟署权' : targetNames.length > 0 ? `得到${targetNames.join('、')}` : ''}
                {reward.winnerGain > 0 && `${targetNames.length > 0 || selectedCasus === 'independence' ? '，' : ''}名望 +${reward.winnerGain}`}
              </div>
              <div className="text-[var(--color-accent-red)]">
                失败：{selectedCasus === 'independence' ? '恢复效忠，收回辟署权，世袭改流官，' : ''}名望 {reward.loserLoss}
              </div>
            </div>
          );
        })()}

        {/* 资源不足提示 */}
        {isSelectedAvailable && !canAfford && (
          <div className="mb-2 text-xs text-[var(--color-accent-red)] text-center">
            威望或正统性不足
          </div>
        )}

        {/* 确认按钮 */}
        <Button
          variant="danger"
          disabled={!canConfirm}
          onClick={handleConfirm}
          className="w-full py-2 font-bold"
        >
          确认宣战
        </Button>
      </div>
    </Modal>
  );
};

export default DeclareWarFlow;
