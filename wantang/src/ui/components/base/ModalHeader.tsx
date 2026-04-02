interface ModalHeaderProps {
  title: string;
  onClose?: () => void;
}

export function ModalHeader({ title, onClose }: ModalHeaderProps) {
  return (
    <div className="section-divider px-5 py-3 flex items-center justify-between shrink-0">
      <h2 className="text-base font-bold text-[var(--color-accent-gold)]">{title}</h2>
      {onClose && (
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          ×
        </button>
      )}
    </div>
  );
}
