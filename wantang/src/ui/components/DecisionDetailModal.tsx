import { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import type { Decision } from '@engine/decision';

interface DecisionDetailModalProps {
  decision: Decision;
  onClose: () => void;
  onExecuted: () => void;
}

/** 需要显示配置选项的决议 ID */
const CREATE_DECISION_IDS = new Set(['createKingdom', 'createDao']);

type TerritoryTypeOption = 'military' | 'civil';
type SuccessionOption = 'clan' | 'bureaucratic';

export default function DecisionDetailModal({ decision, onClose, onExecuted }: DecisionDetailModalProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [executed, setExecuted] = useState(false);

  // 创建配置
  const showConfig = CREATE_DECISION_IDS.has(decision.id);
  const [terrType, setTerrType] = useState<TerritoryTypeOption>('military');
  const [succession, setSuccession] = useState<SuccessionOption>('clan');
  const [appointRight, setAppointRight] = useState(true);

  if (!playerId) return null;

  const { executable, reasons } = decision.canExecute(playerId);
  const targets = decision.getTargets?.(playerId) ?? [];
  const hasTargets = targets.length > 0;
  const eligibleTargets = targets.filter(t => t.eligible);

  const currentTarget = selectedTarget ? targets.find(t => t.id === selectedTarget) : null;
  const canRun = executable && (!hasTargets || (currentTarget?.eligible ?? false));
  const currentCost = currentTarget?.cost ?? (targets[0]?.cost ?? { money: 0, prestige: 0 });

  function handleExecute() {
    if (!canRun) return;
    const config = showConfig
      ? { territoryType: terrType, successionLaw: succession, hasAppointRight: appointRight }
      : undefined;
    decision.execute(playerId!, selectedTarget ?? undefined, config);
    setExecuted(true);
  }

  if (executed) {
    return (
      <Modal size="sm" zIndex={50} onOverlayClick={onClose}>
        <ModalHeader title="决议执行" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm text-[var(--color-success, #22c55e)]">
            {decision.name}已成功执行！
          </p>
          <Button variant="default" className="w-full py-2 font-bold" onClick={onExecuted}>
            关闭
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal size="md" zIndex={50} onOverlayClick={onClose}>
      <ModalHeader title={decision.name} onClose={onClose} />
      <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">

        {/* 描述 */}
        <div className="flex items-start gap-3">
          <span className="text-2xl">{decision.icon}</span>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{decision.description}</p>
        </div>

        {/* 条件区 */}
        {reasons.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-1">条件</h3>
            <div className="space-y-1">
              {reasons.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="text-[var(--color-accent-red)]">✗</span>
                  <span className="text-[var(--color-text-muted)]">{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {reasons.length === 0 && (
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-1">条件</h3>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[var(--color-success, #22c55e)]">✓</span>
              <span className="text-[var(--color-text-muted)]">所有条件已满足</span>
            </div>
          </div>
        )}

        {/* 目标选择 */}
        {hasTargets && (
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-2">选择目标</h3>
            <div className="space-y-1.5">
              {targets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => t.eligible ? setSelectedTarget(t.id) : undefined}
                  className={`w-full text-left rounded border px-3 py-2 transition-colors ${
                    selectedTarget === t.id
                      ? 'border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10'
                      : t.eligible
                        ? 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)]'
                        : 'border-[var(--color-border)] opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-[var(--color-text)]">{t.label}</span>
                      {t.description && (
                        <span className="text-xs text-[var(--color-text-muted)] ml-2">{t.description}</span>
                      )}
                    </div>
                    {!t.eligible && t.reason && (
                      <span className="text-xs text-[var(--color-accent-red)]">{t.reason}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 创建配置（仅称王/建镇决议，选中目标后显示） */}
        {showConfig && currentTarget && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--color-text-muted)]">建制配置</h3>

            {/* 类型 */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-text-muted)] w-16 shrink-0">体制</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setTerrType('military')}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    terrType === 'military'
                      ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)]'
                  }`}
                >
                  军镇（{decision.id === 'createKingdom' ? '王' : '节度使'}）
                </button>
                <button
                  onClick={() => setTerrType('civil')}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    terrType === 'civil'
                      ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)]'
                  }`}
                >
                  文治（{decision.id === 'createKingdom' ? '行台尚书令' : '观察使'}）
                </button>
              </div>
            </div>

            {/* 继承法 */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-text-muted)] w-16 shrink-0">继承法</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSuccession('clan')}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    succession === 'clan'
                      ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)]'
                  }`}
                >
                  宗法继承
                </button>
                <button
                  onClick={() => setSuccession('bureaucratic')}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    succession === 'bureaucratic'
                      ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)]'
                  }`}
                >
                  流官继承
                </button>
              </div>
            </div>

            {/* 辟署权 */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-text-muted)] w-16 shrink-0">辟署权</span>
              <button
                onClick={() => setAppointRight(!appointRight)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${
                  appointRight
                    ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                }`}
              >
                {appointRight ? '授予辟署权' : '不授予辟署权'}
              </button>
            </div>
          </div>
        )}

        {/* 费用区 */}
        {(currentCost.money > 0 || currentCost.prestige > 0) && (
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-muted)] mb-1">花费</h3>
            <div className="flex gap-4 text-sm">
              {currentCost.money > 0 && (
                <span className="text-[var(--color-accent-gold)]">金钱 -{currentCost.money}</span>
              )}
              {currentCost.prestige > 0 && (
                <span className="text-[var(--color-text)]">名望 -{currentCost.prestige}</span>
              )}
            </div>
            <p className="text-xs text-[var(--color-accent-green,#22c55e)] mt-1">
              创建后正统性将提升至与岗位匹配的水平（受品位上限约束）。
            </p>
          </div>
        )}

        {/* 执行按钮 */}
        <Button
          variant="primary"
          className="w-full py-2 font-bold mt-2"
          disabled={!canRun}
          onClick={handleExecute}
        >
          {hasTargets && eligibleTargets.length > 0 && !selectedTarget
            ? '请先选择目标'
            : `执行 ${decision.name}`}
        </Button>
      </div>
    </Modal>
  );
}
