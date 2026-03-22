import React, { useState } from 'react';
import TimeControl from './TimeControl';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { getDynamicTitle, calculateMonthlyLedger } from '@engine/official/officialUtils';
import { useLedgerStore } from '@engine/official/LedgerStore';

interface BottomBarProps {
  onClickPlayer?: () => void;
}

const BottomBar: React.FC<BottomBarProps> = ({ onClickPlayer }) => {
  const [showSwitcher, setShowSwitcher] = useState(false);
  const player = useCharacterStore((s) => {
    const pid = s.playerId;
    return pid ? s.characters.get(pid) : undefined;
  });
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const currentYear = useTurnManager((s) => s.currentDate.year);

  const age = player ? currentYear - player.birthYear : 0;

  function switchPlayer(newId: string) {
    const charStore = useCharacterStore.getState();
    const oldId = charStore.playerId;

    // 切换 isPlayer 标记
    if (oldId) {
      charStore.updateCharacter(oldId, { isPlayer: false });
    }
    charStore.updateCharacter(newId, { isPlayer: true });
    charStore.setPlayerId(newId);

    // 重算新玩家的 ledger
    const newPlayer = charStore.getCharacter(newId);
    if (newPlayer) {
      const territories = useTerritoryStore.getState().territories;
      const characters = charStore.characters;
      const ledger = calculateMonthlyLedger(newPlayer, territories, characters);
      useLedgerStore.getState().updatePlayerLedger(ledger);
    }

    setShowSwitcher(false);
  }

  // 可切换的角色列表：所有存活的有官职的角色
  const switchable = Array.from(characters.values()).filter(
    (c) => c.alive && c.id !== player?.id
  );

  return (
    <div className="flex items-center justify-between bg-[var(--color-bg-panel)] border-t border-[var(--color-border)] px-4 py-2 shrink-0 relative">
      {/* Player character info */}
      <div className="flex items-center gap-2">
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
        <button
          className="w-6 h-6 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
          onClick={() => setShowSwitcher(!showSwitcher)}
          title="切换角色"
        >
          &#x21C5;
        </button>
      </div>

      {/* Character switcher dropdown */}
      {showSwitcher && (
        <div className="absolute bottom-full left-0 mb-1 bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg shadow-xl max-h-64 overflow-y-auto w-72 z-50">
          <div className="px-3 py-2 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-accent-gold)]">
            切换扮演角色
          </div>
          {switchable.map((c) => (
            <button
              key={c.id}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-bg)] transition-colors text-left"
              onClick={() => switchPlayer(c.id)}
            >
              <div className="w-7 h-7 rounded bg-[var(--color-bg-surface)] border border-[var(--color-border)] flex items-center justify-center text-xs font-bold text-[var(--color-accent-gold)]">
                {c.name[0]}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm text-[var(--color-text)] font-bold truncate">{c.name}</span>
                <span className="text-xs text-[var(--color-text-muted)] truncate">{getDynamicTitle(c, territories)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Time control */}
      <TimeControl />
    </div>
  );
};

export default BottomBar;
