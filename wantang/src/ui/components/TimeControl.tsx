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
  [GameSpeed.Normal]: 1000,   // 1天/秒（≈CK3 2速）
  [GameSpeed.Fast]: 500,      // 2天/秒（≈CK3 3速）
  [GameSpeed.VeryFast]: 100,  // 10天/秒（拍视频用）
};

/** 三个速度档位（不含 Paused） */
const SPEED_TIERS = [GameSpeed.Normal, GameSpeed.Fast, GameSpeed.VeryFast] as const;

const TimeControl: React.FC = () => {
  const { currentDate, era, speed, setSpeed, isPaused } = useTurnManager();
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

  // 空格键：播放/暂停
  const togglePause = useCallback(() => {
    const tm = useTurnManager.getState();
    if (tm.isPaused) {
      // 恢复到上次的速度（默认 Normal）
      setSpeed(tm.speed === GameSpeed.Paused ? GameSpeed.Normal : tm.speed);
    } else {
      setSpeed(GameSpeed.Paused);
    }
  }, [setSpeed]);

  // 键盘快捷键
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // 忽略在输入框中的按键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // StoryEvent 弹窗期间屏蔽时间控制快捷键
      if (useStoryEventBus.getState().storyEventQueue.length > 0) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === '+' || e.key === '=') {
        // 加速
        const tm = useTurnManager.getState();
        if (tm.speed === GameSpeed.Normal) setSpeed(GameSpeed.Fast);
        else if (tm.speed === GameSpeed.Fast) setSpeed(GameSpeed.VeryFast);
      } else if (e.key === '-') {
        // 减速
        const tm = useTurnManager.getState();
        if (tm.speed === GameSpeed.VeryFast) setSpeed(GameSpeed.Fast);
        else if (tm.speed === GameSpeed.Fast) setSpeed(GameSpeed.Normal);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setSpeed, togglePause]);

  return (
    <div className="flex items-center gap-2">
      {/* ── 时代标签 ── */}
      <button
        onClick={() => setShowEra(true)}
        className={`text-xs px-2 py-0.5 rounded-full ${getEraBg(era)} text-[var(--color-bg)] font-bold hover:brightness-110 transition-all cursor-pointer`}
      >
        {era}
      </button>
      {showEra && <EraPopup onClose={() => setShowEra(false)} />}

      {/* ── 日期 ── */}
      <div className="text-[var(--color-text)] text-sm font-bold tracking-wide whitespace-nowrap">
        大唐 {formatEraYear(currentDate)} {formatMonthDay(currentDate)}
      </div>

      {/* ── 播放三角 + 三档速率色块（CK3 风格紧凑排列） ── */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <filter id="rough-edge">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" seed="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <div className="flex items-center gap-[3px]">
        {/* 播放/暂停小三角 */}
        <button
          onClick={togglePause}
          className="cursor-pointer flex items-center justify-center transition-colors overflow-hidden"
          style={{
            width: 20,
            height: 16,
            color: isPaused ? '#8b4539' : '#6b8f5e',
            fontSize: 16,
            lineHeight: '16px',
            position: 'relative',
            top: -2,
          }}
          title="播放/暂停（空格）"
        >
          {isPaused ? '▶' : '⏸'}
        </button>

        {/* 三档色块 */}
        {SPEED_TIERS.map((tier, i) => {
          const isActive = !isPaused && speed >= tier;
          return (
            <button
              key={tier}
              onClick={() => setSpeed(tier)}
              className="cursor-pointer transition-colors"
              style={{
                width: 18,
                height: 16,
                backgroundColor: isActive ? '#6b8f5e' : '#8b4539',
                filter: 'url(#rough-edge)',
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
