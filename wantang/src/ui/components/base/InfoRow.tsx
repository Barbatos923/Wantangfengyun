interface InfoRowProps {
  label: string;
  children: React.ReactNode;
}

export function InfoRow({ label, children }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[var(--color-text)]">{children}</span>
    </div>
  );
}
