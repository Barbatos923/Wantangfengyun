import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { getDynamicTitle, calculateMonthlyLedger } from '@engine/official/officialUtils';
import { useLedgerStore } from '@engine/official/LedgerStore';

interface PlayerIdentityCardProps {
  onClick?: () => void;
}

const PlayerIdentityCard: React.FC<PlayerIdentityCardProps> = ({ onClick }) => {
  const [showSwitcher, setShowSwitcher] = useState(false);
  const player = useCharacterStore((s) => {
    const pid = s.playerId;
    return pid ? s.characters.get(pid) : undefined;
  });
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const currentYear = useTurnManager((s) => s.currentDate.year);

  const age = player ? currentYear - player.birthYear : 0;
  const healthPct = player ? Math.max(0, Math.min(100, player.health)) : 0;
  const stressPct = player ? Math.max(0, Math.min(100, player.stress)) : 0;

  function switchPlayer(newId: string) {
    const charStore = useCharacterStore.getState();
    const oldId = charStore.playerId;

    if (oldId) {
      charStore.updateCharacter(oldId, { isPlayer: false });
    }
    charStore.updateCharacter(newId, { isPlayer: true });
    charStore.setPlayerId(newId);

    const newPlayer = charStore.getCharacter(newId);
    if (newPlayer) {
      const territories = useTerritoryStore.getState().territories;
      const characters = charStore.characters;
      const ledger = calculateMonthlyLedger(newPlayer, territories, characters);
      useLedgerStore.getState().updatePlayerLedger(ledger);
    }

    setShowSwitcher(false);
  }

  const switchable = Array.from(characters.values()).filter(
    (c) => c.alive && c.id !== player?.id
  );

  return (
    <div className="relative flex flex-col items-center">
      {/* ═══ 第一行：大头像 ═══ */}
      <button
        className="cursor-pointer transition-all hover:brightness-110 relative"
        onClick={onClick}
        title="查看人物"
      >
        <div
          className="flex items-center justify-center font-bold select-none"
          style={{
            width: '168px',
            height: '168px',
            fontSize: '3rem',
            background: 'linear-gradient(145deg, #1e1a14 0%, #0e0c0a 100%)',
            border: '2px solid rgba(184,154,83,0.7)',
            boxShadow: 'inset 0 0 16px rgba(0,0,0,0.7), 0 3px 12px rgba(0,0,0,0.5)',
            color: 'var(--color-accent-gold)',
          }}
        >
          {player?.name?.charAt(0) ?? '?'}
        </div>
        {/* 切换角色 debug 按钮 */}
        <div
          className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
          style={{
            background: 'rgba(21,17,16,0.9)',
            border: '1px solid rgba(74,62,49,0.5)',
          }}
          onClick={(e) => { e.stopPropagation(); setShowSwitcher(!showSwitcher); }}
          title="切换角色"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7,3 7,10" />
            <polyline points="4,7 7,10 10,7" />
            <polyline points="17,21 17,14" />
            <polyline points="14,17 17,14 20,17" />
          </svg>
        </div>
      </button>

      {/* ═══ 第二行：家族图标 + 姓名头衔 + 生活图标 ═══ */}
      <div className="flex items-center mt-1" style={{ width: '160px' }}>
        {/* 左：家族入口预留 */}
        <div
          className="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[rgba(42,37,32,0.6)] shrink-0"
          style={{
            background: 'rgba(21,17,16,0.85)',
            border: '1px solid rgba(74,62,49,0.4)',
          }}
          title="家族（未开放）"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>

        {/* 中：姓名 + 头衔，居中撑满 */}
        <div className="flex-1 flex flex-col items-center leading-none select-none min-w-0">
          <span className="text-[var(--color-text)] text-base font-bold tracking-wide whitespace-nowrap">
            {player?.name ?? '未知'}
          </span>
          <span className="text-[var(--color-accent-gold)] text-sm whitespace-nowrap" style={{ marginTop: '2px' }}>
            {player ? getDynamicTitle(player, territories) : ''}
          </span>
        </div>

        {/* 右：生活重心预留 */}
        <div
          className="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[rgba(42,37,32,0.6)] shrink-0"
          style={{
            background: 'rgba(21,17,16,0.85)',
            border: '1px solid rgba(74,62,49,0.4)',
          }}
          title="生活重心（未开放）"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
      </div>

      {/* ═══ 第三行：健康条 + 压力条 ═══ */}
      <div className="flex flex-col gap-0.5 mt-1" style={{ width: '160px' }}>
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: 'rgba(74,62,49,0.4)' }}
          title={`健康 ${Math.floor(player?.health ?? 0)}`}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${healthPct}%`,
              background: 'var(--color-accent-green)',
            }}
          />
        </div>
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: 'rgba(74,62,49,0.4)' }}
          title={`压力 ${Math.floor(player?.stress ?? 0)}`}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${stressPct}%`,
              background: 'var(--color-accent-red)',
            }}
          />
        </div>
      </div>

      {/* 角色切换下拉 */}
      {showSwitcher && (
        <div
          className="absolute bottom-full left-0 mb-1 max-h-64 overflow-y-auto w-72 z-50"
          style={{
            background: 'linear-gradient(180deg, #1e1a14 0%, #151110 100%)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-panel)',
          }}
        >
          <div className="px-3 py-2 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-accent-gold)]">
            切换扮演角色
          </div>
          {switchable.map((c) => (
            <button
              key={c.id}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-bg-surface)] transition-colors text-left"
              onClick={() => switchPlayer(c.id)}
            >
              <div
                className="w-7 h-7 flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-accent-gold)',
                }}
              >
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
    </div>
  );
};

export default PlayerIdentityCard;
