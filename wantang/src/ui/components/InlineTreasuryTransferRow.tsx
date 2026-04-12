import React, { useEffect, useMemo, useState } from 'react';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { canTransferTreasury, executeTransferTreasury } from '@engine/interaction';
import { formatAmount } from '@ui/utils/formatAmount';
import { Tooltip } from './base/Tooltip';
import { Select } from './base';

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

  // Fix toId when fromId changes to avoid invalid same-value
  useEffect(() => {
    if (toId === fromId || !zhouList.some((t) => t.id === toId && t.id !== fromId)) {
      const next = zhouList.find((t) => t.id !== fromId);
      if (next) setToId(next.id);
    }
  }, [fromId, zhouList, toId]);

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


  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-xs text-[var(--color-text-muted)]">国库{RESOURCE_LABEL[resource]}运输</div>
      {/* Row 1: source ⇄ target */}
      <div className="flex items-center gap-1.5">
        <Select
          className="flex-1 min-w-0"
          value={fromId}
          onChange={setFromId}
          options={zhouList.map((t) => ({
            value: t.id,
            label: `${t.name}（${formatAmount(Math.floor(t.treasury?.[resource] ?? 0))}）`,
          }))}
        />
        <span className="text-[var(--color-text-muted)] text-sm shrink-0">→</span>
        <Select
          className="flex-1 min-w-0"
          value={toId}
          onChange={setToId}
          options={zhouList
            .filter((t) => t.id !== fromId)
            .map((t) => ({
              value: t.id,
              label: `${t.name}（${formatAmount(Math.floor(t.treasury?.[resource] ?? 0))}）`,
            }))}
        />
      </div>
      {/* Row 2: amount controls */}
      <div className="flex items-center gap-1.5">
        {/* −[input]+ as a group */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            onClick={() => setAmount(Math.max(0, amount - 10000))}
            disabled={amount <= 0}
            className="w-5 h-5 rounded border border-[var(--color-border)] text-xs font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >−</button>
          <Tooltip content={`可用 ${formatAmount(fromBalance)}`}>
            <input
              type="number"
              min={0}
              max={fromBalance}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className={`${inputCls} text-center w-full`}
            />
          </Tooltip>
          <button
            onClick={() => setAmount(Math.min(fromBalance, amount + 10000))}
            disabled={amount >= fromBalance}
            className="w-5 h-5 rounded border border-[var(--color-border)] text-xs font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >+</button>
        </div>
        {[4, 2, 1].map((div) => (
          <button
            key={div}
            onClick={() => setAmount(Math.floor(fromBalance / div))}
            className="text-xs px-1.5 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors shrink-0"
          >
            {div === 1 ? '全' : `1/${div}`}
          </button>
        ))}
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
