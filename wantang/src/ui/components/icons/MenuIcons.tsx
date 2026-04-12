interface IconProps {
  size?: number;
  className?: string;
}

/** 殿堂/宫阙 — 政体 */
export function IconPalace({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* 屋顶 */}
      <path d="M2 10l10-7 10 7" />
      {/* 柱子 */}
      <line x1="6" y1="10" x2="6" y2="20" />
      <line x1="18" y1="10" x2="18" y2="20" />
      {/* 门 */}
      <path d="M10 20v-5h4v5" />
      {/* 台基 */}
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  );
}

/** 折叠舆图 — 领地 */
export function IconMap({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* 折叠地图外形 */}
      <path d="M3 4l6 2v14l-6-2V4z" />
      <path d="M9 6l6-2v14l-6 2V6z" />
      <path d="M15 4l6 2v14l-6-2V4z" />
      {/* 地图上的标记点 */}
      <circle cx="6" cy="11" r="1" fill="currentColor" />
      <circle cx="12" cy="9" r="1" fill="currentColor" />
      <circle cx="18" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

/** 交叉双剑 — 军事 */
export function IconMilitary({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="3" y1="3" x2="21" y2="21" />
      <circle cx="2.5" cy="2.5" r="1.2" fill="currentColor" />
      <line x1="6" y1="9" x2="9" y2="6" />
      <line x1="21" y1="3" x2="3" y2="21" />
      <circle cx="21.5" cy="2.5" r="1.2" fill="currentColor" />
      <line x1="15" y1="6" x2="18" y2="9" />
    </svg>
  );
}

/** 竹简/诏书 — 官职 */
export function IconScroll({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* 竹简卷轴 */}
      <path d="M6 2c-1.5 0-2.5 1-2.5 2v16c0 1 1 2 2.5 2" />
      <path d="M18 2c1.5 0 2.5 1 2.5 2v16c0 1-1 2-2.5 2" />
      {/* 简面 */}
      <rect x="6" y="2" width="12" height="20" rx="0.5" />
      {/* 文字行 */}
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="10" x2="15" y2="10" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

/** 人物侧影 — 廷臣 */
export function IconOfficials({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* 头 */}
      <circle cx="12" cy="7" r="4" />
      {/* 身体 */}
      <path d="M5 22c0-4 3-7 7-7s7 3 7 7" />
    </svg>
  );
}

/** 算筹/暗棋 — 计谋 */
export function IconScheme({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* 三个节点 */}
      <circle cx="5" cy="5" r="2.5" fill="currentColor" />
      <circle cx="19" cy="10" r="2.5" fill="currentColor" />
      <circle cx="8" cy="19" r="2.5" fill="currentColor" />
      {/* 暗线连接（三角关系） */}
      <path d="M7 6.5l10 2.5" strokeDasharray="2 2" />
      <path d="M17.5 12l-8 5.5" strokeDasharray="2 2" />
      <path d="M7 17l-1-10" strokeDasharray="2 2" />
    </svg>
  );
}

/** 三旌并列 — 派系 */
export function IconFaction({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* 左旗 */}
      <line x1="4" y1="2" x2="4" y2="22" />
      <path d="M4 3l7 3-7 3" />
      {/* 中旗 */}
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M12 2l7 3-7 3" />
      {/* 右旗杆 */}
      <line x1="20" y1="2" x2="20" y2="22" />
      <path d="M20 4l-5 2.5 5 2.5" />
    </svg>
  );
}

/** 奏折 — 决议 */
export function IconDecree({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* 折子外形（上卷下展） */}
      <path d="M5 2c0 1.5 1 2.5 2.5 2.5H19v15H5V2z" />
      <path d="M5 2c-1.5 0-2 1-2 2v16.5c0 1 .5 1.5 2 1.5h14" />
      {/* 朱批标记 */}
      <circle cx="9" cy="9" r="2" />
      <path d="M8 8l2 2" />
      {/* 文字行 */}
      <line x1="13" y1="8" x2="16" y2="8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="16" x2="14" y2="16" />
    </svg>
  );
}

/** 酒爵 — 活动 */
export function IconGoblet({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* 爵杯口 */}
      <path d="M6 4h12" />
      {/* 爵身（上宽下窄） */}
      <path d="M6 4l2 10h8l2-10" />
      {/* 爵柱 */}
      <line x1="12" y1="14" x2="12" y2="18" />
      {/* 底座 */}
      <path d="M8 18h8v1.5H8z" />
      {/* 爵耳（两侧把手） */}
      <path d="M6 6c-2 0-3 2-2 4l2 1" />
      <path d="M18 6c2 0 3 2 2 4l-2 1" />
    </svg>
  );
}
