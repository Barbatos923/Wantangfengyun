import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTurnManager } from '../../engine';
import type { GameDate } from '../../engine';
import { Era, GameSpeed } from '../../engine';
import { useStoryEventBus } from '@engine/storyEventBus';
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

function formatEraYear(date: GameDate): string {
  const era = reignEras.find((e) => date.year >= e.start && date.year <= e.end);
  if (era) {
    const yearInEra = date.year - era.start + 1;
    const yearStr = numberToChinese[yearInEra] || String(yearInEra);
    return `${era.name}${yearStr}年`;
  }
  return `${date.year}年`;
}

function formatMonthDay(date: GameDate): string {
  const month = monthNames[date.month - 1] || `${date.month}月`;
  const day = dayNames[date.day - 1] || `${date.day}日`;
  return `${month}${day}`;
}

function getEraColor(era: Era): string {
  switch (era) {
    case Era.ZhiShi:
      return 'var(--color-accent-green)';
    case Era.WeiShi:
      return 'var(--color-accent-gold)';
    case Era.LuanShi:
      return 'var(--color-accent-red)';
  }
}


/** 速度档位对应的自动推进间隔（毫秒），0 表示暂停 */
const SPEED_INTERVALS: Record<number, number> = {
  [GameSpeed.Paused]: 0,
  [GameSpeed.Normal]: 1000,
  [GameSpeed.Fast]: 500,
  [GameSpeed.VeryFast]: 100,
};

/** 三个速度档位（不含 Paused） */
const SPEED_TIERS = [GameSpeed.Normal, GameSpeed.Fast, GameSpeed.VeryFast] as const;


const TimeControl: React.FC = () => {
  const { currentDate, era, speed, setSpeed, isPaused } = useTurnManager();
  const [showEra, setShowEra] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 暂停前的速度，恢复时用 */
  const lastSpeedRef = useRef<GameSpeed>(GameSpeed.Normal);

  // 自动推进
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const ms = SPEED_INTERVALS[speed];
    if (ms > 0) {
      // 记住最近一次非暂停的速度
      lastSpeedRef.current = speed;
      intervalRef.current = setInterval(() => {
        useTurnManager.getState().advanceDay();
      }, ms);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [speed]);

  const togglePause = useCallback(() => {
    const tm = useTurnManager.getState();
    if (tm.isPaused) {
      setSpeed(lastSpeedRef.current);
    } else {
      setSpeed(GameSpeed.Paused);
    }
  }, [setSpeed]);

  // 键盘快捷键
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (useStoryEventBus.getState().storyEventQueue.length > 0) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === '+' || e.key === '=') {
        const tm = useTurnManager.getState();
        if (tm.speed === GameSpeed.Normal) setSpeed(GameSpeed.Fast);
        else if (tm.speed === GameSpeed.Fast) setSpeed(GameSpeed.VeryFast);
      } else if (e.key === '-') {
        const tm = useTurnManager.getState();
        if (tm.speed === GameSpeed.VeryFast) setSpeed(GameSpeed.Fast);
        else if (tm.speed === GameSpeed.Fast) setSpeed(GameSpeed.Normal);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setSpeed, togglePause]);

  const eraColor = getEraColor(era);

  return (
    <div
      className="flex items-center gap-0 px-3 py-1.5 rounded"
      style={{
        background: 'rgba(21,17,16,0.92)',
        border: '1px solid rgba(74,62,49,0.5)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}
    >
      {/* ── 时代标签 ── */}
      <button
        onClick={() => setShowEra(true)}
        className="text-xs px-2 py-0.5 rounded-full font-bold transition-all cursor-pointer hover:brightness-110 shrink-0"
        style={{
          backgroundColor: eraColor,
          color: 'var(--color-bg)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        {era}
      </button>
      {showEra && <EraPopup onClose={() => setShowEra(false)} />}

      {/* 分隔 */}
      <div className="w-px h-5 mx-2.5 shrink-0" style={{ background: 'rgba(74,62,49,0.5)' }} />

      {/* ── 日期（双行：年号 + 月日） ── */}
      <div className="flex flex-col items-start leading-none select-none mr-3">
        <span className="text-[var(--color-text)] text-sm font-bold tracking-wide whitespace-nowrap">
          {formatEraYear(currentDate)}
        </span>
        <span className="text-[var(--color-text-muted)] text-xs whitespace-nowrap" style={{ marginTop: '2px' }}>
          {formatMonthDay(currentDate)}
        </span>
      </div>

      {/* 分隔 */}
      <div className="w-px h-5 mr-2 shrink-0" style={{ background: 'rgba(74,62,49,0.5)' }} />

      {/* ── 播放/暂停 ── */}
      <button
        onClick={togglePause}
        className="w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer hover:bg-[rgba(42,37,32,0.6)]"
        title="播放/暂停（空格）"
      >
        {isPaused ? (
          <svg width="14" height="14" viewBox="0 0 24 24">
            <rect x="4" y="3" width="5" height="18" rx="1" fill="var(--color-accent-red)" />
            <rect x="15" y="3" width="5" height="18" rx="1" fill="var(--color-accent-red)" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24">
            <polygon points="6,3 20,12 6,21" fill="var(--color-accent-green)" />
          </svg>
        )}
      </button>

      {/* ── 三档速度（色块） ── */}
      <div className="flex items-center gap-[3px]">
        {SPEED_TIERS.map((tier, i) => {
          const isActive = !isPaused && speed >= tier;
          return (
            <button
              key={tier}
              onClick={() => setSpeed(tier)}
              className="cursor-pointer transition-colors hover:brightness-125"
              style={{
                width: 18,
                height: 14,
                borderRadius: '2px',
                backgroundColor: isActive ? 'var(--color-accent-green)' : 'rgba(139,69,57,0.7)',
              }}
              title={['正常 (1天/秒)', '快速 (2天/秒)', '极速 (5天/秒)'][i]}
            />
          );
        })}
      </div>
    </div>
  );
};

export default TimeControl;
