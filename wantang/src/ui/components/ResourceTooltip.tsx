import { formatAmount } from '@ui/utils/formatAmount';

export interface TooltipEntry {
  label: string;
  value: number;
  /** 为 true 时数值用白色显示，不带正负色和+号 */
  neutral?: boolean;
}

interface ResourceTooltipProps {
  title: string;
  entries: TooltipEntry[];
  unit?: string;
  /** 是否显示合计行，默认 true（收支类适用），非收支类设 false */
  showTotal?: boolean;
}

/** 资源栏专用 tooltip 内容：标题 + 明细行 + 可选合计 */
export function ResourceTooltip({ title, entries, unit = '', showTotal = true }: ResourceTooltipProps) {
  const total = entries.reduce((sum, e) => sum + e.value, 0);

  return (
    <div className="flex flex-col gap-1" style={{ minWidth: '160px' }}>
      {/* 标题 */}
      <div
        className="text-[var(--color-accent-gold)] text-xs font-bold tracking-wider pb-1 mb-1"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {title}
      </div>
      {/* 明细行 */}
      {entries.map((entry, i) => (
        <div key={i} className="flex justify-between gap-4 text-xs">
          <span className="text-[var(--color-text-muted)]">{entry.label}</span>
          <span
            className={
              entry.neutral
                ? 'text-[var(--color-text)]'
                : entry.value > 0
                  ? 'text-[var(--color-accent-green)]'
                  : entry.value < 0
                    ? 'text-[var(--color-accent-red)]'
                    : 'text-[var(--color-text)]'
            }
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {!entry.neutral && entry.value > 0 ? '+' : ''}{formatAmount(entry.value)}{unit}
          </span>
        </div>
      ))}
      {/* 合计（仅收支类显示） */}
      {showTotal && entries.length > 1 && (
        <div
          className="flex justify-between gap-4 text-xs font-bold pt-1 mt-1"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span className="text-[var(--color-text)]">月结</span>
          <span
            className={
              total > 0
                ? 'text-[var(--color-accent-green)]'
                : total < 0
                  ? 'text-[var(--color-accent-red)]'
                  : 'text-[var(--color-text)]'
            }
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {total > 0 ? '+' : ''}{formatAmount(total)}{unit}
          </span>
        </div>
      )}
    </div>
  );
}
