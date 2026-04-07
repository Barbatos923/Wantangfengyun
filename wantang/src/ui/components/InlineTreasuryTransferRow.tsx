import React, { useMemo, useState } from 'react';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { canTransferTreasury, executeTransferTreasury } from '@engine/interaction';
import { formatAmount } from '@ui/utils/formatAmount';

interface Props {
  charId: string;
  resource: 'money' | 'grain';
}

const RESOURCE_LABEL: Record<Props['resource'], string> = {
  money: '金钱',
  grain: '粮草',
};

const InlineTreasuryTransferRow: React.FC<Props> = ({ charId, resource }) => {
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

  const [fromId, setFromId] = useState<string>(zhouList[0]?.id ?? '');
  const [toId, setToId] = useState<string>(
    zhouList.find((t) => t.id !== (zhouList[0]?.id ?? ''))?.id ?? '',
  );
  const [amount, setAmount] = useState<number>(0);

  if (zhouList.length < 2) return null;

  const fromT = territories.get(fromId);
  const fromBalance = Math.max(0, Math.floor(fromT?.treasury?.[resource] ?? 0));
  const payload = resource === 'money' ? { money: amount } : { grain: amount };
  const check = canTransferTreasury(charId, fromId, toId, payload);
  const canSubmit = check.ok && amount > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    executeTransferTreasury(charId, fromId, toId, payload);
    setAmount(0);
  };

  const inputCls = 'w-20 px-2 py-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs text-[var(--color-text)]';
  const selectCls = 'flex-1 min-w-0 px-2 py-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs text-[var(--color-text)]';

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-xs text-[var(--color-text-muted)]">国库{RESOURCE_LABEL[resource]}运输</div>
      <div className="flex items-center gap-1.5">
        <select
          className={selectCls}
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          title="源州"
        >
          {zhouList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}（{formatAmount(Math.floor(t.treasury?.[resource] ?? 0))}）
            </option>
          ))}
        </select>
        <span className="text-[var(--color-text-muted)] text-sm shrink-0">→</span>
        <select
          className={selectCls}
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          title="目标州"
        >
          {zhouList
            .filter((t) => t.id !== fromId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（{formatAmount(Math.floor(t.treasury?.[resource] ?? 0))}）
              </option>
            ))}
        </select>
        <input
          type="number"
          min={0}
          max={fromBalance}
          step={10000}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          className={inputCls}
          title={`可用 ${formatAmount(fromBalance)}`}
        />
        <button
          onClick={() => setAmount(fromBalance)}
          className="text-xs px-1.5 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors shrink-0"
          title="全部"
        >
          全
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="text-xs px-2 py-1 rounded border border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold)]/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          运输
        </button>
      </div>
      {!check.ok && amount > 0 && (
        <div className="text-xs text-[var(--color-accent-red,#e74c3c)]">{check.reason}</div>
      )}
    </div>
  );
};

export default InlineTreasuryTransferRow;
