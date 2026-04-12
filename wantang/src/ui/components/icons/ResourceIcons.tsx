interface IconProps {
  size?: number;
  className?: string;
}

/** 开元通宝 — 用于钱类资源 */
export function IconCoins({ size = 18, className = '' }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      {/* 外圆 */}
      <circle cx="12" cy="12" r="10" />
      {/* 方孔 */}
      <rect x="9" y="9" width="6" height="6" rx="0.5" />
      {/* 四道短横竖（通宝纹饰简化） */}
      <path d="M7 12h2M15 12h2M12 7v2M12 15v2" />
    </svg>
  );
}

/** 斗/量器 — 用于粮类资源 */
export function IconGrain({ size = 18, className = '' }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      {/* 斗身（上宽下窄梯形） */}
      <path d="M4 8h16l-2 13H6L4 8z" />
      {/* 斗口沿（加厚） */}
      <path d="M3 7h18v2H3z" />
      {/* 粮粒堆（露出斗口的弧形） */}
      <path d="M7 8c1.5-2 3.5-3 5-3s3.5 1 5 3" />
    </svg>
  );
}

/** 官帽/乌纱帽 — 用于名望 */
export function IconSeal({ size = 18, className = '' }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <g transform="translate(0,2)">
        {/* 帽翅（长展翼，微上翘） */}
        <path d="M0 11.5l7 0.5" />
        <path d="M17 12l7-0.5" />
        {/* 帽翅末端圆饰 */}
        <circle cx="0.5" cy="11.5" r="1" />
        <circle cx="23.5" cy="11.5" r="1" />
        {/* 帽身（圆顶） */}
        <path d="M7 13c0-5 2-8 5-8s5 3 5 8" />
        {/* 帽沿 */}
        <path d="M6 13h12v2H6z" />
        {/* 帽梁装饰 */}
        <path d="M10 8c1-1 3-1 4 0" />
      </g>
    </svg>
  );
}

/** 玉玺印面（俯视）— 用于正统性 */
export function IconBalance({ size = 18, className = '' }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      {/* 印面外框 */}
      <rect x="2" y="2" width="20" height="20" rx="1" />
      {/* 國字 — 外框（囗） */}
      <rect x="5" y="5" width="14" height="14" rx="0.5" />
      {/* 或字简化：戈 + 口 */}
      <rect x="8" y="9" width="4" height="4" rx="0.3" />
      <line x1="14" y1="6" x2="14" y2="18" />
      <line x1="10" y1="7" x2="18" y2="15" />
    </svg>
  );
}

/** 交叉双剑 — 用于兵力 */
export function IconSword({ size = 18, className = '' }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2.2}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      {/* 左剑：柄左上 → 尖右下 */}
      <line x1="3" y1="3" x2="21" y2="21" />
      <circle cx="2.5" cy="2.5" r="1.2" fill="currentColor" />
      <line x1="6" y1="9" x2="9" y2="6" />
      {/* 右剑：柄右上 → 尖左下 */}
      <line x1="21" y1="3" x2="3" y2="21" />
      <circle cx="21.5" cy="2.5" r="1.2" fill="currentColor" />
      <line x1="15" y1="6" x2="18" y2="9" />
    </svg>
  );
}

/** 城池 — 用于领地 */
export function IconCastle({ size = 18, className = '' }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      {/* 城墙 */}
      <path d="M3 20h18" />
      <path d="M4 20V10h16v10" />
      {/* 城垛 */}
      <path d="M4 10V8h2v2M8 10V8h2v2M14 10V8h2v2M18 10V8h2v2" />
      {/* 城门（拱形） */}
      <path d="M9 20v-6a3 3 0 0 1 6 0v6" />
      {/* 门钉 */}
      <circle cx="11" cy="16" r="0.5" />
      <circle cx="13" cy="16" r="0.5" />
    </svg>
  );
}
