import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  /** Short label shown on the button when selected (defaults to label) */
  shortLabel?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}

export function Select({ value, onChange, options, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean }>({ top: 0, left: 0, width: 0, up: false });

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const up = spaceBelow < 200 && rect.top > spaceBelow;
    setPos({
      top: up ? rect.top : rect.bottom + 2,
      left: rect.left,
      width: rect.width,
      up,
    });
  }, []);

  // Position on open
  useEffect(() => {
    if (!open) return;
    updatePos();
  }, [open, updatePos]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || dropRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on scroll
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={className ?? ''}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2 py-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs text-[var(--color-text)] hover:border-[var(--color-accent-gold)] transition-colors text-left min-w-0"
      >
        <span className="truncate">{selected?.shortLabel ?? selected?.label ?? ''}</span>
        <svg className="w-3 h-3 shrink-0 ml-1 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] rounded border border-[var(--color-border)] shadow-lg overflow-y-auto"
          style={{
            background: 'var(--color-bg-panel)',
            maxHeight: '180px',
            width: pos.width,
            left: pos.left,
            ...(pos.up
              ? { bottom: window.innerHeight - pos.top + 2 }
              : { top: pos.top }),
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`w-full text-left px-2 py-1.5 text-xs transition-colors truncate ${
                opt.value === value
                  ? 'text-[var(--color-accent-gold)] bg-[var(--color-bg-surface)]'
                  : 'text-[var(--color-text)] hover:bg-[var(--color-bg-surface)]'
              }`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
