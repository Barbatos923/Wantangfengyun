import React, { useState } from 'react';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority, type GameEvent } from '@engine/types';
import BattleDetailModal from './BattleDetailModal';

const AlertBar: React.FC = () => {
  const events = useTurnManager((s) => s.events);
  const currentDate = useTurnManager((s) => s.currentDate);
  const [battleEvent, setBattleEvent] = useState<GameEvent | null>(null);

  // 显示最近3个月的重要事件
  const recentEvents = events.filter((e) => {
    if (e.priority < EventPriority.Major) return false;
    const monthsDiff = (currentDate.year - e.date.year) * 12 + (currentDate.month - e.date.month);
    return monthsDiff >= 0 && monthsDiff <= 3;
  }).slice(-5); // 最多5条

  if (recentEvents.length === 0) return null;

  const handleClick = (event: GameEvent) => {
    if (event.type === '野战' && event.payload) {
      setBattleEvent(event);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 p-3">
        {recentEvents.map((event) => {
          const icon = event.type === '野战' ? '⚔' : event.type === '城破' ? '🏰' : event.type === '兵变' ? '🔥' : '📋';
          const isClickable = event.type === '野战' && !!event.payload;
          return (
            <div
              key={event.id}
              className="flex items-center gap-1 bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] px-2.5 py-1 rounded text-xs hover:text-[var(--color-text)] cursor-pointer transition-colors max-w-xs"
              title={isClickable ? `点击查看战斗详情` : `${event.date.year}年${event.date.month}月 ${event.description}`}
              onClick={() => handleClick(event)}
            >
              <span>{icon}</span>
              <span className="truncate">{event.description}</span>
            </div>
          );
        })}
      </div>
      {battleEvent && (
        <BattleDetailModal event={battleEvent} onClose={() => setBattleEvent(null)} />
      )}
    </>
  );
};

export default AlertBar;
