import React from 'react';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority } from '@engine/types';

const AlertBar: React.FC = () => {
  const events = useTurnManager((s) => s.events);
  const currentDate = useTurnManager((s) => s.currentDate);

  // 显示最近3个月的重要事件
  const recentEvents = events.filter((e) => {
    if (e.priority < EventPriority.Major) return false;
    const monthsDiff = (currentDate.year - e.date.year) * 12 + (currentDate.month - e.date.month);
    return monthsDiff >= 0 && monthsDiff <= 3;
  }).slice(-5); // 最多5条

  if (recentEvents.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3">
      {recentEvents.map((event) => {
        const icon = event.type === '野战' ? '⚔' : event.type === '城破' ? '🏰' : event.type === '兵变' ? '🔥' : '📋';
        return (
          <div
            key={event.id}
            className="flex items-center gap-1 bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] px-2.5 py-1 rounded text-xs hover:text-[var(--color-text)] cursor-pointer transition-colors max-w-xs"
            title={`${event.date.year}年${event.date.month}月 ${event.description}`}
          >
            <span>{icon}</span>
            <span className="truncate">{event.description}</span>
          </div>
        );
      })}
    </div>
  );
};

export default AlertBar;
