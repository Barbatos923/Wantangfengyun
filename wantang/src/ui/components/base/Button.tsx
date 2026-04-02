import React from 'react';

type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'icon';
type ButtonSize = 'sm' | 'md';

const variantClass: Record<ButtonVariant, string> = {
  default:
    'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors',
  primary:
    'border border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold)]/10 transition-colors',
  danger:
    'border border-[var(--color-accent-red)] text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-colors',
  ghost:
    'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-surface)] transition-colors',
  icon:
    'w-7 h-7 rounded flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text)] transition-colors',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs rounded',
  md: 'px-3 py-2 text-sm rounded',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={[
        variant === 'icon' ? variantClass.icon : `${variantClass[variant]} ${sizeClass[size]}`,
        isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? <span className="opacity-60">…</span> : children}
    </button>
  );
}
