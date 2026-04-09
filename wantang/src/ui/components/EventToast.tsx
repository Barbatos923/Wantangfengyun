import React, { useState, useMemo, useEffect } from 'react';
import { useTurnManager } from '@engine/TurnManager';
import { type GameEvent } from '@engine/types';
import { diffDays } from '@engine/dateUtils';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useNotificationStore } from '@ui/stores/notificationStore';
import BattleDetailModal from './BattleDetailModal';

// ── 事件图标 ──────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  '野战': '⚔',
  '城破': '🏰',
  '兵变': '🔥',
  '继位': '👑',
  '绝嗣': '💀',
  '岗位空缺': '🏛',
  '王朝覆灭': '⚡',
  '宣战': '📯',
  '战争结束': '🏳',
  '退出战争': '🏃',
  '参战': '🛡',
  'chronicle-ready': '📜',
};

// ── 边框颜色：按事件性质区分 ──────────────────────────────

type EventTone = 'danger' | 'positive' | 'neutral';

function getEventTone(event: GameEvent): EventTone {
  switch (event.type) {
    case '宣战':
    case '兵变':
    case '城破':
    case '王朝覆灭':
    case '绝嗣':
    case '退出战争':
      return 'danger';
    case '战争结束':
    case '继位':
    case 'chronicle-ready':
      return 'positive';
    default:
      return 'neutral';
  }
}

const TONE_BORDER: Record<EventTone, string> = {
  danger: 'rgba(192,57,43,0.6)',
  positive: 'rgba(201,169,89,0.5)',
  neutral: 'rgba(139,126,106,0.35)',
};

const TONE_BORDER_HOVER: Record<EventTone, string> = {
  danger: 'rgba(192,57,43,0.85)',
  positive: 'rgba(201,169,89,0.8)',
  neutral: 'rgba(201,169,89,0.5)',
};

// ── 与玩家关联度 ──────────────────────────────────────────

function getDisplayRelevance(
  event: GameEvent,
  playerId: string | null,
  characters: Map<string, import('@engine/character/types').Character>,
): 'major' | 'normal' | 'minor' {
  if (!playerId) return 'minor';

  const isSelfInvolved = event.actors.includes(playerId);

  const ALWAYS_SHOW_TYPES = new Set(['野战', '城破', '兵变', '继位', '绝嗣', '王朝覆灭', '岗位空缺', 'chronicle-ready']);
  if (ALWAYS_SHOW_TYPES.has(event.type)) {
    return isSelfInvolved ? 'major' : 'normal';
  }

  if (isSelfInvolved) return 'major';

  for (const actorId of event.actors) {
    const actor = characters.get(actorId);
    if (actor?.overlordId === playerId) return 'normal';
  }

  return 'minor';
}

// ── 获取事件主角（第一个非玩家的 actor） ──────────────────

function getPrimaryActorId(event: GameEvent, playerId: string | null): string | null {
  // 优先返回非玩家的 actor（宣战者/死者等）
  for (const actorId of event.actors) {
    if (actorId !== playerId) return actorId;
  }
  return event.actors[0] ?? null;
}

// ── 单条通知卡片 ──────────────────────────────────────────

function ToastCard({
  event,
  playerId,
  isNew,
  onClick,
  onDismiss,
}: {
  event: GameEvent;
  playerId: string | null;
  isNew: boolean;
  onClick: () => void;
  onDismiss: () => void;
}) {
  const characters = useCharacterStore((s) => s.characters);
  const tone = getEventTone(event);
  const relevance = getDisplayRelevance(event, playerId, characters);
  const isMajor = relevance === 'major';
  const [hovered, setHovered] = useState(false);

  // 主角头像
  const primaryActorId = getPrimaryActorId(event, playerId);
  const primaryActor = primaryActorId ? characters.get(primaryActorId) : null;

  const borderColor = hovered ? TONE_BORDER_HOVER[tone] : TONE_BORDER[tone];

  return (
    <div
      className={`flex items-stretch gap-0 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 ${
        isNew ? 'animate-slide-in-right' : ''
      }`}
      style={{
        border: `1px solid ${borderColor}`,
        background: 'linear-gradient(135deg, rgba(30,26,20,0.93) 0%, rgba(45,38,28,0.88) 50%, rgba(30,26,20,0.93) 100%)',
        boxShadow: isMajor
          ? `0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(201,169,89,0.1)`
          : '0 2px 8px rgba(0,0,0,0.4)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onDismiss(); }}
      title="左键查看 | 右键清除"
    >
      {/* 左侧：功能图标条 */}
      <div
        className="flex items-center justify-center shrink-0 w-9"
        style={{
          background: `linear-gradient(180deg, ${TONE_BORDER[tone]} 0%, transparent 100%)`,
        }}
      >
        <span className="text-base">{EVENT_ICONS[event.type] ?? '📋'}</span>
      </div>

      {/* 中间：文字区 */}
      <div className="flex-1 flex flex-col justify-center py-2 px-2.5 min-w-0">
        <span className={`text-xs font-bold leading-tight ${
          isMajor ? 'text-[var(--color-accent-gold)]' : 'text-[var(--color-text)]'
        }`}>
          {event.type}
        </span>
        <span className="text-[11px] text-[var(--color-text)] leading-snug mt-0.5 line-clamp-2">
          {event.description}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
          {event.date.year}年{event.date.month}月{event.date.day}日
        </span>
      </div>

      {/* 右侧：角色头像 */}
      {primaryActor && (
        <div className="flex items-center justify-center shrink-0 pr-2.5 pl-1">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--color-bg-surface), var(--color-bg))',
              border: `1.5px solid ${TONE_BORDER[tone]}`,
              color: 'var(--color-accent-gold)',
            }}
            title={primaryActor.name}
          >
            {primaryActor.name.charAt(0)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────

const EventToast: React.FC = () => {
  const events = useTurnManager((s) => s.events);
  const currentDate = useTurnManager((s) => s.currentDate);
  const playerId = useCharacterStore((s) => s.playerId);
  const characters = useCharacterStore((s) => s.characters);
  const dismissedIds = useNotificationStore((s) => s.dismissedIds);
  const dismissEvent = useNotificationStore((s) => s.dismissEvent);
  const dismissAll = useNotificationStore((s) => s.dismissAll);
  const [battleEvent, setBattleEvent] = useState<GameEvent | null>(null);

  // 跟踪已渲染过的事件 ID，用于入场动画判断。
  // 改用 state 而非 ref：render 阶段读 ref 不纯，并发渲染下不可靠；这里 toast 列表很短，
  // 多一次 commit 后的 setState 重渲成本可忽略。
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());

  const visibleEvents = useMemo(() => {
    return events
      .filter((e) => {
        if (dismissedIds.has(e.id)) return false;
        const daysDiff = diffDays(e.date, currentDate);
        if (daysDiff < 0 || daysDiff > 30) return false;
        const relevance = getDisplayRelevance(e, playerId, characters);
        return relevance !== 'minor';
      })
      .slice(-5);
  }, [events, currentDate, dismissedIds, playerId, characters]);

  // 渲染提交后再补 seen，避免 render 阶段写 ref / state（用 functional setter 防止循环）
  useEffect(() => {
    setSeenIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const e of visibleEvents) {
        if (!next.has(e.id)) { next.add(e.id); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [visibleEvents]);

  if (visibleEvents.length === 0) return null;

  const handleClick = (event: GameEvent) => {
    if (event.type === '野战' && event.payload) {
      setBattleEvent(event);
    }
  };

  const handleClearAll = () => {
    dismissAll(visibleEvents.map(e => e.id));
  };

  return (
    <>
      <div className="flex flex-col gap-2" style={{ width: '320px' }}>
        {visibleEvents.map((event) => (
          <ToastCard
            key={event.id}
            event={event}
            playerId={playerId}
            isNew={!seenIds.has(event.id)}
            onClick={() => handleClick(event)}
            onDismiss={() => dismissEvent(event.id)}
          />
        ))}
        {/* 清空按钮 + 分隔线 */}
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex-1 h-px" style={{ background: 'rgba(139,126,106,0.2)' }} />
          <button
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent-gold)] transition-colors px-1"
            onClick={handleClearAll}
          >
            清除全部
          </button>
          <div className="flex-1 h-px" style={{ background: 'rgba(139,126,106,0.2)' }} />
        </div>
      </div>

      {battleEvent && (
        <BattleDetailModal event={battleEvent} onClose={() => setBattleEvent(null)} />
      )}
    </>
  );
};

export default EventToast;
