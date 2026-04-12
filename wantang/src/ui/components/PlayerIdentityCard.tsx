import React from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getDynamicTitle } from '@engine/official/officialUtils';

interface PlayerIdentityCardProps {
  onClick?: () => void;
}

const PlayerIdentityCard: React.FC<PlayerIdentityCardProps> = ({ onClick }) => {
  const player = useCharacterStore((s) => {
    const pid = s.playerId;
    return pid ? s.characters.get(pid) : undefined;
  });
  const territories = useTerritoryStore((s) => s.territories);

  const healthPct = player ? Math.max(0, Math.min(100, player.health)) : 0;
  const stressPct = player ? Math.max(0, Math.min(100, player.stress)) : 0;

  return (
    <div className="flex flex-col items-center">
      {/* ═══ 第一行：大头像 ═══ */}
      <button
        className="cursor-pointer transition-all hover:brightness-110"
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
      </button>

      {/* ═══ 下方信息区（半透明暗底） ═══ */}
      <div
        className="flex flex-col items-center mt-0 rounded-b px-1 pt-1 pb-1.5"
        style={{
          width: '168px',
          background: 'rgba(18,16,14,0.85)',
          borderLeft: '1px solid rgba(74,62,49,0.3)',
          borderRight: '1px solid rgba(74,62,49,0.3)',
          borderBottom: '1px solid rgba(74,62,49,0.3)',
        }}
      >

      {/* 家族图标 + 姓名头衔 + 生活图标 */}
      <div className="flex items-center w-full">
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

      {/* 健康条 + 压力条 */}
      <div className="flex flex-col gap-0.5 mt-1 w-full px-1">
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

      </div>{/* 暗底容器结束 */}
    </div>
  );
};

export default PlayerIdentityCard;
