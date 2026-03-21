import React from 'react';
import { useTurnManager } from '../../engine';
import type { GameDate } from '../../engine';
import { Era } from '../../engine';

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

const numberToChinese: Record<number, string> = {
  1: '元', 2: '二', 3: '三', 4: '四', 5: '五',
  6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
  11: '十一', 12: '十二', 13: '十三', 14: '十四', 15: '十五',
  16: '十六', 17: '十七', 18: '十八', 19: '十九', 20: '二十',
};

function formatChineseDate(date: GameDate): string {
  const era = reignEras.find((e) => date.year >= e.start && date.year <= e.end);
  const month = monthNames[date.month - 1] || `${date.month}月`;

  if (era) {
    const yearInEra = date.year - era.start + 1;
    const yearStr = numberToChinese[yearInEra] || String(yearInEra);
    return `大唐 ${era.name}${yearStr}年 ${month}`;
  }

  return `大唐 ${date.year}年 ${month}`;
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

const TimeControl: React.FC = () => {
  const { currentDate, era, advanceMonth } = useTurnManager();

  return (
    <div className="flex items-center gap-3">
      <div className="text-[var(--color-text)] text-sm font-medium">
        {formatChineseDate(currentDate)}
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full ${getEraBg(era)} text-[var(--color-bg)] font-bold`}>
        {era}
      </span>
      <button
        onClick={advanceMonth}
        className="ml-2 px-4 py-1.5 text-sm font-bold rounded bg-[var(--color-accent-gold)] text-[var(--color-bg)] hover:brightness-110 active:brightness-90 transition-all"
      >
        结束回合
      </button>
    </div>
  );
};

export default TimeControl;
