// ===== 人物面板底部标签页（亲族/关系/臣属/廷臣） =====

import React, { useState, useMemo } from 'react';
import type { Character } from '@engine/character/types';
import type { PolicyOpinionEntry } from '@engine/territory/TerritoryStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { calculateBaseOpinion, getOpinionBreakdown, getEffectiveAbilities } from '@engine/character/characterUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { getDynamicTitle, getSubordinates, getHeldPosts } from '@engine/official/officialUtils';
import { positionMap } from '@data/positions';
import { AvatarBadge } from './base';

// ── Types ─────────────────────────────────────────────

export type TabKey = 'family' | 'relations' | 'retainers' | 'vassals';

export interface CharacterTabsProps {
  character: Character;
  characters: Map<string, Character>;
  playerChar?: Character;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onPushCharacter: (id: string) => void;
  onShowOpinion: (from: Character, toward: Character) => void;
  expectedLegitimacy: Map<string, number>;
  policyCache: Map<string, PolicyOpinionEntry>;
}

// ── Internal tab props ────────────────────────────────

interface TabProps {
  character: Character;
  characters: Map<string, Character>;
  onClickChar: (id: string) => void;
  playerChar?: Character;
  onShowOpinion?: (from: Character, toward: Character) => void;
  expectedLegMap: Map<string, number>;
  policyCache: Map<string, PolicyOpinionEntry>;
}

// ── Tab sub-components ────────────────────────────────

function buildOpinionTooltip(from: Character, toward: Character, expectedLegMap: Map<string, number>, policyCache: Map<string, PolicyOpinionEntry>) {
  const entries = getOpinionBreakdown(from, toward,
    expectedLegMap.get(toward.id) ?? null,
    policyCache.get(from.id) ?? null,
    policyCache.get(toward.id) ?? null,
  );
  const total = calculateBaseOpinion(from, toward,
    expectedLegMap.get(toward.id) ?? null,
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

function FamilyAvatar({ char, playerChar, expectedLegMap, policyCache, onClickChar }: {
  char: Character; playerChar?: Character;
  expectedLegMap: Map<string, number>; policyCache: Map<string, PolicyOpinionEntry>;
  onClickChar: (id: string) => void;
}) {
  const opinion = playerChar && char.id !== playerChar.id && char.alive
    ? calculateBaseOpinion(char, playerChar, expectedLegMap.get(playerChar.id) ?? null, policyCache.get(char.id) ?? null, policyCache.get(playerChar.id) ?? null)
    : null;
  const tooltip = playerChar && opinion !== null
    ? buildOpinionTooltip(char, playerChar, expectedLegMap, policyCache)
    : undefined;

  return (
    <AvatarBadge
      name={char.name}
      size="md"
      opinion={opinion}
      opinionTooltip={tooltip}
      onClick={() => onClickChar(char.id)}
    />
  );
}

const FamilyTab: React.FC<TabProps> = ({ character, characters, onClickChar, playerChar, expectedLegMap, policyCache }) => {
  const father = character.family.fatherId ? characters.get(character.family.fatherId) : undefined;
  const mother = character.family.motherId ? characters.get(character.family.motherId) : undefined;
  const spouse = character.family.spouseId ? characters.get(character.family.spouseId) : undefined;
  const children = character.family.childrenIds
    .map((id) => characters.get(id))
    .filter((c): c is Character => c != null);

  const siblings = father
    ? father.family.childrenIds
        .filter((id) => id !== character.id)
        .map((id) => characters.get(id))
        .filter((c): c is Character => c != null)
    : [];

  return (
    <div className="flex flex-col justify-evenly h-full">
      {/* 父母 + 配偶 */}
      <div className="flex items-center gap-0">
        <div className="shrink-0 flex flex-col items-center justify-center mr-2 select-none self-stretch">
          <span className="text-xs text-[var(--color-text)]" style={{ writingMode: 'vertical-rl' }}>父母</span>
        </div>
        <div className="flex gap-2 items-end">
          {father ? (
            <FamilyAvatar char={father} playerChar={playerChar}
              expectedLegMap={expectedLegMap} policyCache={policyCache} onClickChar={onClickChar} />
          ) : (
            <AvatarBadge size="md" empty />
          )}
          {mother ? (
            <FamilyAvatar char={mother} playerChar={playerChar}
              expectedLegMap={expectedLegMap} policyCache={policyCache} onClickChar={onClickChar} />
          ) : (
            <AvatarBadge size="md" empty />
          )}
        </div>
        <div className="shrink-0 flex flex-col items-center justify-center mr-2 select-none self-stretch" style={{ marginLeft: '10%' }}>
          <span className="text-xs text-[var(--color-text)]" style={{ writingMode: 'vertical-rl' }}>配偶</span>
        </div>
        <div className="flex gap-2 items-end">
          {spouse ? (
            <FamilyAvatar char={spouse} playerChar={playerChar}
              expectedLegMap={expectedLegMap} policyCache={policyCache} onClickChar={onClickChar} />
          ) : (
            <AvatarBadge size="md" empty />
          )}
        </div>
      </div>

      {/* 子女 */}
      <div className="flex items-center gap-0">
        <div className="shrink-0 flex flex-col items-center justify-center mr-2 select-none self-stretch">
          <span className="text-xs text-[var(--color-text)]" style={{ writingMode: 'vertical-rl' }}>子女</span>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          {children.length > 0 ? children.map((c) => (
            <FamilyAvatar key={c.id} char={c} playerChar={playerChar}
              expectedLegMap={expectedLegMap} policyCache={policyCache} onClickChar={onClickChar} />
          )) : (
            <AvatarBadge size="md" empty />
          )}
        </div>
      </div>

      {/* 兄弟姐妹 */}
      <div className="flex items-center gap-0">
        <div className="shrink-0 flex flex-col items-center justify-center mr-2 select-none self-stretch">
          <span className="text-xs text-[var(--color-text)]" style={{ writingMode: 'vertical-rl' }}>兄弟</span>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          {siblings.length > 0 ? siblings.map((s) => (
            <FamilyAvatar key={s.id} char={s} playerChar={playerChar}
              expectedLegMap={expectedLegMap} policyCache={policyCache} onClickChar={onClickChar} />
          )) : (
            <AvatarBadge size="md" empty />
          )}
        </div>
      </div>
    </div>
  );
};

const RelationsTab: React.FC<TabProps> = () => {
  return <div className="text-xs text-[var(--color-text-muted)] text-center py-4">义兄弟、好友、义子义父、情人等关系（未开放）</div>;
};

/** 臣属/廷臣共用行组件：头像(好感) + 姓名岗位 + 能力值 + 兵力 */
function CharacterRow({ char, posNames, playerChar, expectedLegMap, policyCache, onClickChar }: {
  char: Character; posNames?: string; playerChar?: Character;
  expectedLegMap: Map<string, number>; policyCache: Map<string, PolicyOpinionEntry>;
  onClickChar: (id: string) => void;
}) {
  const opinion = playerChar && char.id !== playerChar.id && char.alive
    ? calculateBaseOpinion(char, playerChar, expectedLegMap.get(playerChar.id) ?? null, policyCache.get(char.id) ?? null, policyCache.get(playerChar.id) ?? null)
    : null;
  const tooltip = playerChar && opinion !== null
    ? buildOpinionTooltip(char, playerChar, expectedLegMap, policyCache)
    : undefined;
  const eff = getEffectiveAbilities(char);
  const armies = useMilitaryStore((s) => s.armies);
  const battalions = useMilitaryStore((s) => s.battalions);
  let troops = 0;
  for (const army of armies.values()) {
    if (army.ownerId === char.id) {
      for (const batId of army.battalionIds) {
        const bat = battalions.get(batId);
        if (bat) troops += bat.currentStrength;
      }
    }
  }

  return (
    <button
      className="w-full flex items-center gap-2 px-1 py-1 rounded hover:bg-[var(--color-bg)] transition-colors text-left"
      onClick={() => onClickChar(char.id)}
    >
      {/* 头像+好感 */}
      <AvatarBadge name={char.name} size="md" opinion={opinion} opinionTooltip={tooltip} interactive={false} />
      {/* 姓名+岗位 */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--color-text)] font-bold truncate">{char.name}</div>
        {posNames && <div className="text-xs text-[var(--color-text-muted)] truncate">{posNames}</div>}
      </div>
      {/* 能力值 — 只显示数字，标签在表头 */}
      <div className="flex gap-1.5 shrink-0">
        {(['military', 'administration', 'strategy', 'diplomacy', 'scholarship'] as const).map((k) => (
          <span key={k} className="text-xs text-[var(--color-text)] w-4 text-center">{eff[k]}</span>
        ))}
      </div>
      {/* 兵力 */}
      <span className="text-xs text-[var(--color-text-muted)] w-12 text-right shrink-0">
        {troops > 0 ? troops : ''}
      </span>
    </button>
  );
}

type SortKey = 'military' | 'administration' | 'strategy' | 'diplomacy' | 'scholarship' | 'troops';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'military', label: '军' },
  { key: 'administration', label: '管' },
  { key: 'strategy', label: '谋' },
  { key: 'diplomacy', label: '外' },
  { key: 'scholarship', label: '学' },
  { key: 'troops', label: '兵力' },
];

function getTroops(charId: string, armies: Map<string, any>, battalions: Map<string, any>): number {
  let total = 0;
  for (const army of armies.values()) {
    if (army.ownerId === charId) {
      for (const batId of army.battalionIds) {
        const bat = battalions.get(batId);
        if (bat) total += bat.currentStrength;
      }
    }
  }
  return total;
}

function SortableCharacterList({ chars, posNamesMap, playerChar, expectedLegMap, policyCache, onClickChar }: {
  chars: Character[];
  posNamesMap: Map<string, string>;
  playerChar?: Character;
  expectedLegMap: Map<string, number>;
  policyCache: Map<string, PolicyOpinionEntry>;
  onClickChar: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const armies = useMilitaryStore((s) => s.armies);
  const battalions = useMilitaryStore((s) => s.battalions);

  const sorted = useMemo(() => {
    if (!sortKey) return chars;
    return [...chars].sort((a, b) => {
      if (sortKey === 'troops') {
        return getTroops(b.id, armies, battalions) - getTroops(a.id, armies, battalions);
      }
      const effA = getEffectiveAbilities(a);
      const effB = getEffectiveAbilities(b);
      return effB[sortKey] - effA[sortKey];
    });
  }, [chars, sortKey, armies, battalions]);

  return (
    <div className="flex flex-col h-full">
      {/* 排序表头 — 固定不滚动 */}
      <div className="flex items-center gap-2 px-1 pb-1 shrink-0 overflow-y-scroll" style={{ borderBottom: '1px solid rgba(74,62,49,0.2)' }}>
        {/* 占位：对齐头像 */}
        <div style={{ width: '52px' }} className="shrink-0" />
        {/* 占位：对齐姓名区 */}
        <div className="flex-1 min-w-0" />
        {/* 能力表头 */}
        <div className="flex gap-1.5 shrink-0">
          {SORT_OPTIONS.filter(o => o.key !== 'troops').map(({ key, label }) => (
            <button
              key={key}
              className={`text-xs w-4 text-center cursor-pointer transition-colors ${sortKey === key ? 'text-[var(--color-accent-gold)] font-bold' : 'text-[var(--color-text)] hover:text-[var(--color-accent-gold)]'}`}
              onClick={() => setSortKey(sortKey === key ? null : key)}
              title={`按${label}排序`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 兵力表头 */}
        <button
          className={`text-xs w-12 text-right shrink-0 cursor-pointer transition-colors ${sortKey === 'troops' ? 'text-[var(--color-accent-gold)] font-bold' : 'text-[var(--color-text)] hover:text-[var(--color-accent-gold)]'}`}
          onClick={() => setSortKey(sortKey === 'troops' ? null : 'troops')}
          title="按兵力排序"
        >
          兵力
        </button>
      </div>
      {/* 列表 — 可滚动 */}
      <div className="flex-1 overflow-y-scroll space-y-0.5 pt-1">
        {sorted.map((c) => (
          <CharacterRow key={c.id} char={c}
            posNames={posNamesMap.get(c.id)}
            playerChar={playerChar} expectedLegMap={expectedLegMap} policyCache={policyCache}
            onClickChar={onClickChar} />
        ))}
      </div>
    </div>
  );
}

const VassalsTab: React.FC<TabProps> = ({ character, characters, onClickChar, playerChar, expectedLegMap, policyCache }) => {
  const subordinates = getSubordinates(character.id, characters);
  const subordinateIds = new Set(subordinates.map(s => s.id));

  const courtiers: Character[] = [];
  for (const c of characters.values()) {
    if (!c.alive || c.overlordId !== character.id) continue;
    if (!subordinateIds.has(c.id)) courtiers.push(c);
  }

  if (courtiers.length === 0) {
    return <div className="text-xs text-[var(--color-text-muted)] text-center py-2">无廷臣</div>;
  }

  const posNamesMap = new Map(courtiers.map(c => [c.id, getDynamicTitle(c)]));

  return (
    <SortableCharacterList chars={courtiers} posNamesMap={posNamesMap}
      playerChar={playerChar} expectedLegMap={expectedLegMap} policyCache={policyCache}
      onClickChar={onClickChar} />
  );
};

const RetainersTab: React.FC<TabProps> = ({ character, characters, onClickChar, playerChar, expectedLegMap, policyCache }) => {
  const territories = useTerritoryStore((s) => s.territories);
  const subs = getSubordinates(character.id, characters);

  if (subs.length === 0) {
    return <div className="text-xs text-[var(--color-text-muted)] text-center py-2">无臣属</div>;
  }

  const posNamesMap = new Map(subs.map(sub => {
    const subPosts = getHeldPosts(sub.id);
    const posNames = subPosts
      .map((post) => {
        const tplName = positionMap.get(post.templateId)?.name ?? post.templateId;
        const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
        return terrName ? `${terrName}${tplName}` : tplName;
      })
      .join('、');
    return [sub.id, posNames] as const;
  }));

  return (
    <SortableCharacterList chars={subs} posNamesMap={posNamesMap}
      playerChar={playerChar} expectedLegMap={expectedLegMap} policyCache={policyCache}
      onClickChar={onClickChar} />
  );
};

// ── Main component ────────────────────────────────────

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'family', label: '亲族' },
  { key: 'relations', label: '关系' },
  { key: 'retainers', label: '臣属' },
  { key: 'vassals', label: '廷臣' },
];

const CharacterTabs: React.FC<CharacterTabsProps> = ({
  character,
  characters,
  playerChar,
  activeTab,
  onTabChange,
  onPushCharacter,
  onShowOpinion,
  expectedLegitimacy,
  policyCache,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ borderTop: '1px solid rgba(74,62,49,0.3)' }}>
      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-border)] shrink-0">
        {TAB_ITEMS.map(({ key, label }) => (
          <button
            key={key}
            className={`relative flex-1 py-1.5 text-xs font-bold transition-colors ${
              activeTab === key
                ? 'text-[var(--color-accent-gold)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
            style={activeTab === key ? { backgroundColor: 'rgba(184,154,83,0.08)' } : undefined}
            onClick={() => onTabChange(key)}
          >
            {label}
            {activeTab === key && (
              <span
                className="absolute bottom-0 left-1/4 right-1/4 h-[2px]"
                style={{ backgroundColor: 'var(--color-accent-gold)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {activeTab === 'family' && (
          <FamilyTab
            character={character}
            characters={characters}
            onClickChar={onPushCharacter}
            playerChar={playerChar}
            onShowOpinion={onShowOpinion}
            expectedLegMap={expectedLegitimacy}
            policyCache={policyCache}
          />
        )}
        {activeTab === 'relations' && (
          <RelationsTab
            character={character}
            characters={characters}
            onClickChar={onPushCharacter}
            playerChar={playerChar}
            onShowOpinion={onShowOpinion}
            expectedLegMap={expectedLegitimacy}
            policyCache={policyCache}
          />
        )}
        {activeTab === 'retainers' && (
          <RetainersTab
            character={character}
            characters={characters}
            onClickChar={onPushCharacter}
            playerChar={playerChar}
            onShowOpinion={onShowOpinion}
            expectedLegMap={expectedLegitimacy}
            policyCache={policyCache}
          />
        )}
        {activeTab === 'vassals' && (
          <VassalsTab
            character={character}
            characters={characters}
            onClickChar={onPushCharacter}
            playerChar={playerChar}
            onShowOpinion={onShowOpinion}
            expectedLegMap={expectedLegitimacy}
            policyCache={policyCache}
          />
        )}
      </div>
    </div>
  );
};

export default CharacterTabs;
