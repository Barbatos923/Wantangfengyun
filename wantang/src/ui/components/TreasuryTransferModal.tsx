import React, { useMemo, useState } from 'react';
import { Modal } from '@ui/components/base/Modal';
import { ModalHeader } from '@ui/components/base/ModalHeader';
import { Button } from '@ui/components/base/Button';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { canTransferTreasury, executeTransferTreasury } from '@engine/interaction';
import { formatAmount } from '@ui/utils/formatAmount';

interface Props {
  charId: string;
  onClose: () => void;
  lockedFromId?: string;
  lockedResource?: 'money' | 'grain';
}

const TreasuryTransferModal: React.FC<Props> = ({ charId, onClose, lockedFromId, lockedResource }) => {
  const territories = useTerritoryStore((s) => s.territories);
  const controllerIndex = useTerritoryStore((s) => s.controllerIndex);

  const zhouList = useMemo(() => {
    const ids = controllerIndex.get(charId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => territories.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t && t.tier === 'zhou' && !!t.treasury)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [territories, controllerIndex, charId]);

  const initialFrom = lockedFromId ?? zhouList[0]?.id ?? '';
  const initialTo = zhouList.find((t) => t.id !== initialFrom)?.id ?? '';
  const [fromId, setFromId] = useState<string>(initialFrom);
  const [toId, setToId] = useState<string>(initialTo);
  const [moneyInput, setMoney] = useState<number>(0);
  const [grainInput, setGrain] = useState<number>(0);
  const money = lockedResource === 'grain' ? 0 : moneyInput;
  const grain = lockedResource === 'money' ? 0 : grainInput;

  const fromT = territories.get(fromId);
  const check = canTransferTreasury(charId, fromId, toId, { money, grain });
  const hasAmount = money > 0 || grain > 0;
  const canSubmit = check.ok && hasAmount;

  const handleSubmit = () => {
    if (!canSubmit) return;
    executeTransferTreasury(charId, fromId, toId, { money, grain });
    onClose();
  };

  return (
    <Modal size="md" zIndex={60} onOverlayClick={onClose}>
      <ModalHeader title="国库运输" onClose={onClose} />
      <div className="px-5 py-4 space-y-4 overflow-y-auto">
        {zhouList.length < 2 ? (
          <div className="text-sm text-[var(--color-text-muted)]">需至少两个己方州才能运输。</div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs text-[var(--color-text-muted)]">源州</label>
              {lockedFromId ? (
                <div className="px-2 py-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)]">
                  {fromT?.name}（钱{formatAmount(fromT?.treasury?.money ?? 0)} 粮{formatAmount(fromT?.treasury?.grain ?? 0)}）
                </div>
              ) : (
                <select
                  className="w-full px-2 py-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)]"
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                >
                  {zhouList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}（钱{formatAmount(t.treasury!.money)} 粮{formatAmount(t.treasury!.grain)}）
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--color-text-muted)]">目标州</label>
              <select
                className="w-full px-2 py-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)]"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
              >
                {zhouList
                  .filter((t) => t.id !== fromId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}（钱{formatAmount(t.treasury!.money)} 粮{formatAmount(t.treasury!.grain)}）
                    </option>
                  ))}
              </select>
            </div>

            <div className={lockedResource ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
              {lockedResource !== 'grain' && (
              <div className="space-y-1">
                <label className="text-xs text-[var(--color-text-muted)]">
                  金钱（可用 {formatAmount(Math.max(0, Math.floor(fromT?.treasury?.money ?? 0)))}）
                </label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={money}
                    onChange={(e) => setMoney(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="flex-1 px-2 py-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)]"
                  />
                  <Button
                    size="sm"
                    onClick={() => setMoney(Math.max(0, Math.floor(fromT?.treasury?.money ?? 0)))}
                  >
                    全部
                  </Button>
                </div>
              </div>
              )}
              {lockedResource !== 'money' && (
              <div className="space-y-1">
                <label className="text-xs text-[var(--color-text-muted)]">
                  粮草（可用 {formatAmount(Math.max(0, Math.floor(fromT?.treasury?.grain ?? 0)))}）
                </label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={grain}
                    onChange={(e) => setGrain(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="flex-1 px-2 py-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)]"
                  />
                  <Button
                    size="sm"
                    onClick={() => setGrain(Math.max(0, Math.floor(fromT?.treasury?.grain ?? 0)))}
                  >
                    全部
                  </Button>
                </div>
              </div>
              )}
            </div>

            {!check.ok && hasAmount && (
              <div className="text-xs text-[var(--color-accent-red,#e74c3c)]">{check.reason}</div>
            )}
            {!hasAmount && (
              <div className="text-xs text-[var(--color-text-muted)]">请输入要运输的金钱或粮草数量。</div>
            )}
            <div className="text-xs text-[var(--color-text-muted)]">
              即时到账，不受关隘阻断。
            </div>
          </>
        )}
      </div>
      <div className="px-5 py-3 border-t border-[var(--color-border)] flex justify-end gap-2 shrink-0">
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={!canSubmit} onClick={handleSubmit}>
          运输
        </Button>
      </div>
    </Modal>
  );
};

export default TreasuryTransferModal;
