import React from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import type { PolicyOpinionEntry } from '@engine/territory/TerritoryStore';
import { calculateBaseOpinion, getOpinionBreakdown } from '@engine/character/characterUtils';
import { getDynamicTitle } from '@engine/official/officialUtils';
import { useTurnManager } from '@engine/TurnManager';
import { traitMap } from '@data/traits';
import { AvatarBadge } from './base';
import { Tooltip } from './base/Tooltip';
import { usePanelStore } from '@ui/stores/panelStore';

interface CharacterHeaderProps {
  character: Character;
  characterId: string;
  playerId: string | null;
  playerChar: Character | undefined;
  territories: Map<string, Territory>;
  expectedLegitimacy: Map<string, number>;
  policyCache: Map<string, PolicyOpinionEntry>;
  onPushCharacter: (id: string) => void;
  onShowInteractionMenu: () => void;
}

const TRAIT_CATEGORY_COLORS: Record<string, string> = {
  innate: '#8e44ad',
  personality: '#2980b9',
  education: '#27ae60',
  lifestyle: '#c0392b',
};

const CharacterHeader: React.FC<CharacterHeaderProps> = ({
  character,
  characterId,
  playerId,
  playerChar,
  territories,
  expectedLegitimacy,
  policyCache,
  onPushCharacter,
  onShowInteractionMenu,
}) => {
  const currentYear = useTurnManager((s) => s.currentDate.year);
  const age = currentYear - character.birthYear;
  const title = getDynamicTitle(character, territories);
  const { goBack, goToPlayer, close, togglePin } = usePanelStore();
  const pinned = usePanelStore((s) => s.pinned);
  const canGoBack = usePanelStore((s) => s.stack.length > 1);

  const selfOpinion = playerChar && character.id !== playerChar.id && character.alive
    ? calculateBaseOpinion(
        character, playerChar,
        expectedLegitimacy.get(playerChar.id) ?? null,
        policyCache.get(character.id) ?? null,
        policyCache.get(playerChar.id) ?? null,
      )
    : null;

  const traits = character.traitIds.map((id) => traitMap.get(id)).filter(Boolean);
  const healthPct = Math.max(0, Math.min(100, character.health));

  // 构建好感明细 tooltip
  function buildOpinionTooltip(from: Character, toward: Character) {
    const entries = getOpinionBreakdown(from, toward,
      expectedLegitimacy.get(toward.id) ?? null,
      policyCache.get(from.id) ?? null,
      policyCache.get(toward.id) ?? null,
    );
    const total = calculateBaseOpinion(from, toward,
      expectedLegitimacy.get(toward.id) ?? null,
      policyCache.get(from.id) ?? null,
      policyCache.get(toward.id) ?? null,
    );
    return (
      <div style={{ minWidth: '140px' }}>
        <div className="text-xs font-bold text-[var(--color-text)] mb-1.5">{from.name} → {toward.name}</div>
        {entries.length === 0 && <div className="text-xs text-[var(--color-text-muted)]">无特殊修正</div>}
        {entries.map((e, i) => (
          <div key={i} className="flex justify-between text-xs gap-3">
            <span className="text-[var(--color-text-muted)]">{e.label}</span>
            <span className={`font-bold ${e.value >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
              {e.value >= 0 ? '+' : ''}{e.value}
            </span>
          </div>
        ))}
        <div className="flex justify-between text-xs mt-1.5 pt-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="font-bold text-[var(--color-text)]">总计</span>
          <span className={`font-bold ${total >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
            {total >= 0 ? '+' : ''}{total}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 px-4 pt-2 pb-3" style={{ borderBottom: '1px solid rgba(74,62,49,0.3)' }}>

      {/* ── 功能按钮行 ── */}
      <div className="flex items-center justify-end gap-0.5 mb-2">
        {characterId !== playerId && (
          <IconBtn title="交互" onClick={onShowInteractionMenu}>
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </IconBtn>
        )}
        <IconBtn title={pinned ? '取消固定' : '固定面板'} onClick={togglePin} active={pinned}>
          <path d="M12 2v8" /><path d="M4.93 10.93l2.83-2.83" /><path d="M19.07 10.93l-2.83-2.83" />
          <path d="M2 18h20" /><path d="M12 18v4" /><circle cx="12" cy="10" r="3" />
        </IconBtn>
        <IconBtn title="前往玩家角色" onClick={goToPlayer}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
        </IconBtn>
        <IconBtn title="返回" onClick={goBack} disabled={!canGoBack}>
          <polyline points="15 18 9 12 15 6" />
        </IconBtn>
        <IconBtn title="关闭" onClick={close}>
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </IconBtn>
      </div>

      {/* ── 头像区：本人+配偶（左） / 领主+继承人（右），底部对齐 ── */}
      <div className="flex items-end mb-2">
        {/* 左侧：本人大头像 + 配偶 */}
        <div className="flex items-end gap-2 flex-1">
          <AvatarBadge
            name={character.name}
            label="本人"
            size="xl"
            opinion={selfOpinion}
            opinionTooltip={playerChar && selfOpinion !== null ? buildOpinionTooltip(character, playerChar) : undefined}
          />
          {character.family.spouseId ? (
            <RelatedAvatar charId={character.family.spouseId} label="妻子" playerChar={playerChar}
              expectedLegitimacy={expectedLegitimacy} policyCache={policyCache}
              onPushCharacter={onPushCharacter} size="lg" />
          ) : (
            <AvatarBadge label="妻子" size="lg" empty />
          )}
        </div>

        {/* 右侧：领主(顶部) + 继承人(底部)，纵向两端分布 */}
        <div className="flex flex-col items-end justify-between shrink-0 self-stretch">
          {character.overlordId ? (
            <RelatedAvatar charId={character.overlordId} label="领主" playerChar={playerChar}
              expectedLegitimacy={expectedLegitimacy} policyCache={policyCache}
              onPushCharacter={onPushCharacter} size="md" />
          ) : (
            <AvatarBadge label="领主" size="md" empty />
          )}
          {character.family.childrenIds.length > 0 ? (
            <RelatedAvatar charId={character.family.childrenIds[0]} label="继承人" playerChar={playerChar}
              expectedLegitimacy={expectedLegitimacy} policyCache={policyCache}
              onPushCharacter={onPushCharacter} size="md" />
          ) : (
            <AvatarBadge label="继承人" size="md" empty />
          )}
        </div>
      </div>

      {/* 金线分隔 */}
      <div className="my-2 -mx-4" style={{ height: '1px', background: 'rgba(74,62,49,0.3)' }} />

      {/* ── 第二+三区：姓名/特质（左） + 家族入口（右） ── */}
      <div className="flex items-stretch gap-3">
        {/* 左侧：姓名行 + 特质行 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-xl font-bold text-[var(--color-text)]">{character.name}</span>
            {character.courtesy && (
              <span className="text-xs text-[var(--color-text-muted)]">字{character.courtesy}</span>
            )}
            <span className="text-base text-[var(--color-accent-gold)]">{title}</span>
            <span className="text-xs text-[var(--color-text-muted)]">{age}岁</span>
            <Tooltip content={
              <div className="text-xs">
                <div>健康：{Math.floor(character.health)}</div>
                <div>压力：{Math.floor(character.stress)}</div>
              </div>
            }>
              <span className="text-base cursor-default" style={{ color: healthPct > 60 ? 'var(--color-accent-green)' : healthPct > 30 ? '#f39c12' : 'var(--color-accent-red)' }}>
                ❤
              </span>
            </Tooltip>
          </div>
          {traits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {traits.map((trait) => {
                const color = TRAIT_CATEGORY_COLORS[trait!.category] ?? '#c0392b';
                return (
                  <Tooltip key={trait!.id} content={
                    <div>
                      <div className="text-xs font-bold text-[var(--color-text)] mb-1">{trait!.name}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">{trait!.description}</div>
                      <div className="text-[10px] text-[var(--color-text-muted)] mt-1 opacity-60">
                        {trait!.category === 'innate' ? '先天' : trait!.category === 'personality' ? '性格' : trait!.category === 'education' ? '教育' : '生活'}
                      </div>
                    </div>
                  }>
                    <div
                      className="flex items-center justify-center text-[11px] font-bold cursor-default select-none"
                      style={{
                        width: '44px',
                        height: '44px',
                        border: `1px solid ${color}`,
                        backgroundColor: `${color}1a`,
                        color: 'var(--color-text)',
                      }}
                    >
                      {trait!.name.slice(0, 2)}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>

        {/* 右侧：家族入口预留 */}
        <Tooltip content={<div className="text-xs">家族（未开放）</div>}>
          <div
            className="shrink-0 self-stretch flex flex-col items-center justify-center cursor-pointer transition-colors hover:border-[var(--color-accent-gold)]"
            style={{
              width: '72px',
              background: 'linear-gradient(145deg, #1e1a14 0%, #0e0c0a 100%)',
              border: '1px solid rgba(74,62,49,0.4)',
              boxShadow: 'inset 0 0 6px rgba(0,0,0,0.4)',
            }}
            title="家族（未开放）"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="text-[10px] text-[var(--color-text-muted)] mt-1">家族</span>
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

// ── Helper: icon button ──

function IconBtn({ title, onClick, disabled, active, children }: {
  title: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--color-bg-surface)] transition-colors disabled:opacity-30 disabled:cursor-default ${active ? 'text-[var(--color-accent-gold)]' : 'text-[var(--color-text-muted)]'}`}
      title={title}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

// ── Helper: related character avatar ──

interface RelatedAvatarProps {
  charId: string;
  label: string;
  playerChar: Character | undefined;
  expectedLegitimacy: Map<string, number>;
  policyCache: Map<string, PolicyOpinionEntry>;
  onPushCharacter: (id: string) => void;
  size?: 'xl' | 'lg' | 'md' | 'sm';
}

function RelatedAvatar({ charId, label, playerChar, expectedLegitimacy, policyCache, onPushCharacter, size = 'sm' }: RelatedAvatarProps) {
  const char = useCharacterStore((s) => s.characters.get(charId));
  if (!char) return null;

  const opinion = playerChar && char.id !== playerChar.id && char.alive
    ? calculateBaseOpinion(
        char, playerChar,
        expectedLegitimacy.get(playerChar.id) ?? null,
        policyCache.get(char.id) ?? null,
        policyCache.get(playerChar.id) ?? null,
      )
    : null;

  const tooltip = playerChar && opinion !== null ? (() => {
    const entries = getOpinionBreakdown(char, playerChar,
      expectedLegitimacy.get(playerChar.id) ?? null,
      policyCache.get(char.id) ?? null,
      policyCache.get(playerChar.id) ?? null,
    );
    return (
      <div style={{ minWidth: '140px' }}>
        <div className="text-xs font-bold text-[var(--color-text)] mb-1.5">{char.name} → {playerChar.name}</div>
        {entries.length === 0 && <div className="text-xs text-[var(--color-text-muted)]">无特殊修正</div>}
        {entries.map((e, i) => (
          <div key={i} className="flex justify-between text-xs gap-3">
            <span className="text-[var(--color-text-muted)]">{e.label}</span>
            <span className={`font-bold ${e.value >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
              {e.value >= 0 ? '+' : ''}{e.value}
            </span>
          </div>
        ))}
        <div className="flex justify-between text-xs mt-1.5 pt-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="font-bold text-[var(--color-text)]">总计</span>
          <span className={`font-bold ${opinion >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
            {opinion >= 0 ? '+' : ''}{opinion}
          </span>
        </div>
      </div>
    );
  })() : undefined;

  return (
    <AvatarBadge
      name={char.name}
      label={label}
      size={size}
      opinion={opinion}
      opinionTooltip={tooltip}
      onClick={() => onPushCharacter(charId)}
    />
  );
}

export default CharacterHeader;
