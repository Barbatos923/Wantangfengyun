interface ProgressBarProps {
  value: number;
  max?: number;
  color: string;
  className?: string;
}

export function ProgressBar({ value, max = 100, color, className }: ProgressBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={`w-full bg-[var(--color-bg)] rounded h-1.5 overflow-hidden ${className ?? ''}`}>
      <div
        className="h-full rounded transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}
