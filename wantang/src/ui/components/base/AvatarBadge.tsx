import { Tooltip } from './Tooltip';

interface AvatarBadgeProps {
  name?: string;
  label?: string;
  size?: 'xl' | 'lg' | 'md' | 'sm';
  empty?: boolean;
  opinion?: number | null;
  opinionTooltip?: React.ReactNode;
  onClick?: () => void;
  /** When false, renders a static div instead of button (use inside button rows to avoid nested buttons) */
  interactive?: boolean;
}

export function AvatarBadge({ name, label, size = 'sm', empty, opinion, opinionTooltip, onClick, interactive = true }: AvatarBadgeProps) {
  const sizeMap = {
    xl: { width: '168px', height: '168px', fontSize: '3rem' },
    lg: { width: '100px', height: '100px', fontSize: '2rem' },
    md: { width: '52px', height: '52px', fontSize: '1.25rem' },
    sm: { width: '36px', height: '36px', fontSize: '0.875rem' },
  };
  const sizeStyles = sizeMap[size];

  const hasOpinion = !empty && opinion !== null && opinion !== undefined;

  const avatarContent = (
    <div className="relative" style={{ display: 'inline-flex' }}>
      {empty ? (
        <div
          className="flex items-center justify-center font-bold shrink-0 cursor-default"
          style={{
            ...sizeStyles,
            background: 'linear-gradient(145deg, #1e1a14 0%, #0e0c0a 100%)',
            border: '1px solid rgba(74,62,49,0.3)',
            boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
            color: 'rgba(74,62,49,0.4)',
          }}
          title={label}
        />
      ) : interactive ? (
        <button
          className="flex items-center justify-center font-bold shrink-0 cursor-pointer transition-all hover:brightness-110"
          style={{
            ...sizeStyles,
            background: 'linear-gradient(145deg, #1e1a14 0%, #0e0c0a 100%)',
            border: '1px solid rgba(184,154,83,0.5)',
            boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
            color: 'var(--color-accent-gold)',
          }}
          onClick={onClick}
          title={label && name ? `${label}：${name}` : name}
        >
          {name ? name[0] : null}
        </button>
      ) : (
        <div
          className="flex items-center justify-center font-bold shrink-0"
          style={{
            ...sizeStyles,
            background: 'linear-gradient(145deg, #1e1a14 0%, #0e0c0a 100%)',
            border: '1px solid rgba(184,154,83,0.5)',
            boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
            color: 'var(--color-accent-gold)',
          }}
          title={label && name ? `${label}：${name}` : name}
        >
          {name ? name[0] : null}
        </div>
      )}
      {/* 好感角标：absolute 定位在头像右下角 */}
      {hasOpinion && (
        <span
          className="absolute text-[10px] font-bold leading-none px-1 py-0.5 rounded-sm"
          style={{
            bottom: '2px',
            right: '2px',
            background: opinion! >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)',
            color: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            minWidth: '20px',
            textAlign: 'center',
            zIndex: 1,
          }}
        >
          {opinion! >= 0 ? '+' : ''}{opinion}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-0.5">
      {hasOpinion && opinionTooltip ? (
        <Tooltip content={opinionTooltip}>
          {avatarContent}
        </Tooltip>
      ) : avatarContent}
      {label && (
        <div className="text-[10px] text-[var(--color-text-muted)] leading-tight">{label}</div>
      )}
    </div>
  );
}
