import React, { useState, useEffect, useRef } from 'react';
import { useTurnManager } from '../../engine';
import type { GameDate } from '../../engine';
import { Era, GameSpeed } from '../../engine';
import EraPopup from './EraPopup';

interface ReignEra {
  start: number;
  end: number;
  name: string;
}

const reignEras: ReignEra[] = [
  { start: 860, end: 873, name: '咸通' },
  { start: 874, end: 879, name: '乾符' },
  { start: 880, end: 881, name: '广明' },
  { start: 881, end: 885, name: '中和' },
  { start: 885, end: 888, name: '光启' },
  { start: 888, end: 891, name: '文德' },
];

const monthNames = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
];

const dayNames = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
  '三十一',
];

const numberToChinese: Record<number, string> = {
  1: '元', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
  11: '十一', 12: '十二', 13: '十三', 14: '十四', 15: '十五',
  16: '十六', 17: '十七', 18: '十八', 19: '十九', 20: '二十',
};

function formatChineseDate(date: GameDate): string {
  const era = reignEras.find((e) => date.year >= e.start && date.year <= e.end);
  const month = monthNames[date.month - 1] || `${date.month}月`;
  const day = dayNames[date.day - 1] || `${date.day}日`;

  if (era) {
    const yearInEra = date.year - era.start + 1;
    const yearStr = numberToChinese[yearInEra] || String(yearInEra);
    return `大唐 ${era.name}${yearStr}年 ${month}${day}`;
  }

  return `大唐 ${date.year}年 ${month}${day}`;
}

function getEraBg(era: Era): string {
  switch (era) {
    case Era.ZhiShi:
      return 'bg-[var(--color-accent-green)]';
    case Era.WeiShi:
      return 'bg-[var(--color-accent-gold)]';
    case Era.LuanShi:
      return 'bg-[var(--color-accent-red)]';
  }
}

/** 速度档位对应的自动推进间隔（毫秒），0 表示暂停 */
const SPEED_INTERVALS: Record<number, number> = {
  [GameSpeed.Paused]: 0,
  [GameSpeed.Normal]: 500,
  [GameSpeed.Fast]: 200,
  [GameSpeed.VeryFast]: 50,
};

const SPEED_LABELS: Record<number, string> = {
  [GameSpeed.Paused]: '⏸',
  [GameSpeed.Normal]: '▶',
  [GameSpeed.Fast]: '▶▶',
  [GameSpeed.VeryFast]: '▶▶▶',
};

const TimeControl: React.FC = () => {
  const { currentDate, era, speed, advanceDay, advanceToNextMonth, setSpeed, isPaused } = useTurnManager();
  const [showEra, setShowEra] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 自动推进
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const ms = SPEED_INTERVALS[speed];
    if (ms > 0) {
      intervalRef.current = setInterval(() => {
        useTurnManager.getState().advanceDay();
      }, ms);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [speed]);

  const cycleSpeed = () => {
    if (isPaused) {
      setSpeed(GameSpeed.Normal);
    } else if (speed === GameSpeed.Normal) {
      setSpeed(GameSpeed.Fast);
    } else if (speed === GameSpeed.Fast) {
      setSpeed(GameSpeed.VeryFast);
    } else {
      setSpeed(GameSpeed.Paused);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="text-[var(--color-text)] text-sm font-medium">
        {formatChineseDate(currentDate)}
      </div>
      <button
        onClick={() => setShowEra(true)}
        className={`text-xs px-2 py-0.5 rounded-full ${getEraBg(era)} text-[var(--color-bg)] font-bold hover:brightness-110 transition-all cursor-pointer`}
      >
        {era}
      </button>
      {showEra && <EraPopup onClose={() => setShowEra(false)} />}
      {/* 速度控制 */}
      <button
        onClick={cycleSpeed}
        className={`px-2 py-1 text-sm font-bold rounded transition-all cursor-pointer ${
          isPaused
            ? 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
            : 'bg-[var(--color-accent-gold)] text-[var(--color-bg)] hover:brightness-110'
        }`}
        title={`速度: ${['暂停', '正常', '快速', '极速'][speed]}`}
      >
        {SPEED_LABELS[speed]}
      </button>
      {/* 下一日 */}
      <button
        onClick={() => { setSpeed(GameSpeed.Paused); advanceDay(); }}
        className="px-3 py-1 text-xs font-bold rounded bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:brightness-110 transition-all cursor-pointer"
      >
        下一日
      </button>
      {/* 下月 */}
      <button
        onClick={() => { setSpeed(GameSpeed.Paused); advanceToNextMonth(); }}
        className="px-3 py-1 text-xs font-bold rounded bg-[var(--color-accent-gold)] text-[var(--color-bg)] hover:brightness-110 active:brightness-90 transition-all cursor-pointer"
      >
        下月
      </button>
    </div>
  );
};

export default TimeControl;
