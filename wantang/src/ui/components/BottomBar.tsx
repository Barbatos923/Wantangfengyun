import React from 'react';
import TimeControl from './TimeControl';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { getDynamicTitle } from '@engine/official/officialUtils';

interface BottomBarProps {
  onClickPlayer?: () => void;
}

const BottomBar: React.FC<BottomBarProps> = ({ onClickPlayer }) => {
  const player = useCharacterStore((s) => {
    const pid = s.playerId;
    return pid ? s.characters.get(pid) : undefined;
  });
  const territories = useTerritoryStore((s) => s.territories);
  const currentYear = useTurnManager((s) => s.currentDate.year);

  const age = player ? currentYear - player.birthYear : 0;

  return (
    <div className="flex items-center justify-between bg-[var(--color-bg-panel)] border-t border-[var(--color-border)] px-4 py-2 shrink-0">
      {/* Player character info */}
      <button className="flex items-center gap-3 hover:opacity-80" onClick={onClickPlayer}>
        <div className="w-10 h-10 rounded bg-[var(--color-accent-gold)] shrink-0 flex items-center justify-center text-sm font-bold text-[var(--color-bg)]">
          {player?.name?.charAt(0) ?? '?'}
        </div>
        <div className="flex flex-col text-left">
          <span className="text-[var(--color-text)] text-sm font-bold">
            {player?.name ?? '未知'} · {player ? getDynamicTitle(player, territories) : ''}
          </span>
          <span className="text-[var(--color-text-muted)] text-xs">
            {player ? `${age}岁 | 健康${Math.floor(player.health)} | 压力${Math.floor(player.stress)}` : ''}
          </span>
        </div>
      </button>

      {/* Time control */}
      <TimeControl />
    </div>
  );
};

export default BottomBar;
