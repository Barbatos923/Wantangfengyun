interface PanelSectionProps {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}

export function PanelSection({ title, extra, children }: PanelSectionProps) {
  return (
    <div className="pb-3 mb-3" style={{ borderBottom: '1px solid rgba(74,62,49,0.3)' }}>
      <div className="flex items-center gap-2 mb-2">
        {/* 左侧金色竖条 */}
        <div className="w-0.5 h-3.5 rounded-r shrink-0" style={{ background: 'var(--color-accent-gold)' }} />
        <h3 className="text-xs font-bold text-[var(--color-text)] tracking-wide flex-1">{title}</h3>
        {extra && <div className="text-xs text-[var(--color-text-muted)]">{extra}</div>}
      </div>
      {children}
    </div>
  );
}
