// ===== 三段式人物面板（左侧面板内嵌） =====

import React, { useState } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { getEffectiveAbilities, calculateBaseOpinion } from '@engine/character/characterUtils';
import { traitMap } from '@data/traits';
import { usePanelStore } from '@ui/stores/panelStore';
import type { Character } from '@engine/character/types';
import OpinionPopup from './OpinionPopup';
import { getRankTitle, getSubordinates, getDirectControlLimit, getDynamicTitle, getHeldPosts, getActualController } from '@engine/official/officialUtils';
import { rankMap } from '@data/ranks';
import { positionMap } from '@data/positions';
import type { Post } from '@engine/territory/types';
import InteractionMenu from './InteractionMenu';
import AppointFlow from './AppointFlow';
import DismissFlow from './DismissFlow';
import CentralizationFlow from './CentralizationFlow';

// ── Constants ──────────────────────────────────────

const ABILITY_LABELS: { key: keyof Character['abilities']; label: string }[] = [
  { key: 'military', label: '军事' },
  { key: 'administration', label: '管理' },
  { key: 'strategy', label: '谋略' },
  { key: 'diplomacy', label: '外交' },
  { key: 'scholarship', label: '学识' },
];

const TIER_LABELS: Record<string, string> = { zhou: '州', dao: '道', guo: '国' };

type TabKey = 'family' | 'relations' | 'retainers' | 'vassals';

// ── Sub-component: Avatar circle ───────────────────

interface AvatarProps {
  char: Character | undefined;
  mainChar: Character | undefined;  // player character, for opinion calculation
  label: string;
  size: 'lg' | 'sm';
  onClick?: () => void;
}

const Avatar: React.FC<AvatarProps> = ({ char, mainChar, label, size, onClick }) => {
  if (!char) return null;
  // mainChar here is the player character — show opinion toward player
  const opinion = mainChar && char.id !== mainChar.id ? calculateBaseOpinion(char, mainChar) : null;
  const sizeClass = size === 'lg' ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm';

  return (
    <button
      className="flex flex-col items-center gap-0.5"
      onClick={onClick}
      title={`${label}：${char.name}`}
    >
      <div className={`${sizeClass} rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-accent-gold)] font-bold hover:border-[var(--color-accent-gold)] transition-colors`}>
        {char.name[0]}
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)] leading-tight">{label}</div>
      {opinion !== null && (
        <div className={`text-[10px] font-bold ${opinion >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
          {opinion >= 0 ? '+' : ''}{opinion}
        </div>
      )}
    </button>
  );
};

// ── Main component ─────────────────────────────────

interface CharacterPanelProps {
  characterId: string;
}

const CharacterPanel: React.FC<CharacterPanelProps> = ({ characterId }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('family');
  const [opinionPopup, setOpinionPopup] = useState<{ from: Character; toward: Character } | null>(null);
  const [showInteractionMenu, setShowInteractionMenu] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<string | null>(null);

  const character = useCharacterStore((s) => s.characters.get(characterId));
  const playerId = useCharacterStore((s) => s.playerId);
  const playerChar = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const currentYear = useTurnManager((s) => s.currentDate.year);
  const { pushCharacter, openTerritoryModal, goBack, goToPlayer, close, togglePin } = usePanelStore();
  const pinned = usePanelStore((s) => s.pinned);
  const canGoBack = usePanelStore((s) => s.stack.length > 1);

  if (!character) return null;

  const effective = getEffectiveAbilities(character);
  const age = currentYear - character.birthYear;
  const traits = character.traitIds.map((id) => traitMap.get(id)).filter(Boolean);

  // Related characters
  const spouse = character.family.spouseId ? characters.get(character.family.spouseId) : undefined;
  const overlord = character.overlordId ? characters.get(character.overlordId) : undefined;
  const firstChild = character.family.childrenIds.length > 0 ? characters.get(character.family.childrenIds[0]) : undefined;

  // Controlled territories
  const controlledTerritories = Array.from(territories.values()).filter((t) => getActualController(t) === characterId);

  return (
    <div className="flex flex-col h-full">
      {/* ── Top buttons bar ── */}
      <div className="flex items-center justify-end gap-1 px-3 py-2 border-b border-[var(--color-border)] shrink-0">
        {characterId !== playerId && (
          <button
            onClick={() => setShowInteractionMenu(true)}
            className="w-7 h-7 rounded flex items-center justify-center text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-accent-gold)]"
            title="交互"
          >
            &#x26A1;
          </button>
        )}
        <button
          onClick={togglePin}
          className={`w-7 h-7 rounded flex items-center justify-center text-sm hover:bg-[var(--color-bg-surface)] ${pinned ? 'text-[var(--color-accent-gold)]' : 'text-[var(--color-text-muted)]'}`}
          title={pinned ? '取消固定' : '固定面板'}
        >
          &#x1F4CC;
        </button>
        <button
          onClick={goToPlayer}
          className="w-7 h-7 rounded flex items-center justify-center text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text)]"
          title="前往玩家角色"
        >
          &#x2302;
        </button>
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className="w-7 h-7 rounded flex items-center justify-center text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:cursor-default"
          title="返回"
        >
          &#x2190;
        </button>
        <button
          onClick={close}
          className="w-7 h-7 rounded flex items-center justify-center text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text)]"
          title="关闭"
        >
          &#x2715;
        </button>
      </div>

      {/* ── Top section: Portraits ── */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border)]">
        {/* Character name & title */}
        <div className="text-center mb-3">
          <h2 className="text-base font-bold text-[var(--color-accent-gold)]">
            {character.name}
            {character.courtesy && (
              <span className="text-sm text-[var(--color-text-muted)] ml-1 font-normal">字{character.courtesy}</span>
            )}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {getDynamicTitle(character, territories)} · {character.gender} · {age}岁
          </p>
        </div>

        {/* Avatar row */}
        <div className="flex items-start justify-center gap-4">
          {/* 本人头像 + 对玩家好感 */}
          <div className="flex flex-col items-center gap-0.5">
            <div className="w-14 h-14 rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-accent-gold)] text-lg font-bold">
              {character.name[0]}
            </div>
            <div className="text-[10px] text-[var(--color-text-muted)] leading-tight">本人</div>
            {playerChar && character.id !== playerId && (() => {
              const op = calculateBaseOpinion(character, playerChar);
              return (
                <button
                  className={`text-[10px] font-bold hover:underline cursor-pointer ${op >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}
                  onClick={() => setOpinionPopup({ from: character, toward: playerChar })}
                  title="点击查看好感明细"
                >
                  {op >= 0 ? '+' : ''}{op}
                </button>
              );
            })()}
          </div>
          <Avatar char={spouse} mainChar={playerChar} label="配偶" size="sm" onClick={() => spouse && pushCharacter(spouse.id)} />
          <Avatar char={overlord} mainChar={playerChar} label="领主" size="sm" onClick={() => overlord && pushCharacter(overlord.id)} />
          <Avatar char={firstChild} mainChar={playerChar} label="继承人" size="sm" onClick={() => firstChild && pushCharacter(firstChild.id)} />
        </div>
      </div>

      {/* ── Middle section: Scrollable info ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {/* Health & Stress */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-0.5">
              <span>健康</span>
              <span>{Math.floor(character.health)}/100</span>
            </div>
            <div className="w-full bg-[var(--color-bg)] rounded h-2.5">
              <div
                className="h-2.5 rounded"
                style={{
                  width: `${character.health}%`,
                  backgroundColor: character.health > 60 ? 'var(--color-accent-green)' : character.health > 30 ? '#f39c12' : 'var(--color-accent-red)',
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-0.5">
              <span>压力</span>
              <span>{Math.floor(character.stress)}/100</span>
            </div>
            <div className="w-full bg-[var(--color-bg)] rounded h-2.5">
              <div
                className="h-2.5 rounded"
                style={{
                  width: `${character.stress}%`,
                  backgroundColor: character.stress < 30 ? 'var(--color-accent-green)' : character.stress < 60 ? '#f39c12' : 'var(--color-accent-red)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Traits */}
        <div>
          <h3 className="text-xs font-bold text-[var(--color-text)] mb-1.5">特质</h3>
          <div className="flex flex-wrap gap-1">
            {traits.map((trait) => (
              <span
                key={trait!.id}
                className="px-1.5 py-0.5 rounded text-[11px] border"
                style={{
                  borderColor: trait!.category === 'innate' ? '#8e44ad'
                    : trait!.category === 'personality' ? '#2980b9'
                    : trait!.category === 'education' ? '#27ae60'
                    : '#c0392b',
                  color: 'var(--color-text)',
                }}
                title={trait!.description}
              >
                {trait!.name}
              </span>
            ))}
          </div>
        </div>

        {/* Five abilities */}
        <div>
          <h3 className="text-xs font-bold text-[var(--color-text)] mb-1.5">能力</h3>
          <div className="grid grid-cols-5 gap-1">
            {ABILITY_LABELS.map(({ key, label }) => {
              const base = character.abilities[key];
              const eff = effective[key];
              const diff = eff - base;
              return (
                <div key={key} className="text-center">
                  <div className="text-[10px] text-[var(--color-text-muted)]">{label}</div>
                  <div className="text-base font-bold text-[var(--color-text)]">
                    {eff}
                    {diff !== 0 && (
                      <span className={`text-[10px] ml-0.5 ${diff > 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
                        {diff > 0 ? '+' : ''}{diff}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resources */}
        <div>
          <h3 className="text-xs font-bold text-[var(--color-text)] mb-1.5">资源</h3>
          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              { label: '钱', value: character.resources.money },
              { label: '粮', value: character.resources.grain },
              { label: '名望', value: character.resources.prestige },
              { label: '合法性', value: character.resources.legitimacy },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-[10px] text-[var(--color-text-muted)]">{label}</div>
                <div className="text-sm text-[var(--color-text)] font-bold">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Official Position */}
        {character.official && (() => {
          const heldPosts = getHeldPosts(character.id);
          const isEmperor = heldPosts.some((p) => p.templateId === 'pos-emperor');
          return (
            <div>
              <h3 className="text-xs font-bold text-[var(--color-text)] mb-1.5">官职</h3>
              <div className="space-y-1 text-xs">
                {/* Rank */}
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">品位</span>
                  <span className="text-[var(--color-accent-gold)] font-bold">
                    {isEmperor ? 'N/A' : `${rankMap.get(character.official!.rankLevel)?.name ?? '无'} · ${getRankTitle(character)}`}
                  </span>
                </div>
                {/* Positions */}
                {heldPosts.map((post) => {
                  const posDef = positionMap.get(post.templateId);
                  const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
                  return (
                    <div key={post.id} className="flex justify-between">
                      <span className="text-[var(--color-text-muted)]">职位</span>
                      <span className="text-[var(--color-text)]">
                        {posDef?.name ?? post.templateId}
                        {terrName && <span className="text-[var(--color-text-muted)] ml-1">({terrName})</span>}
                      </span>
                    </div>
                  );
                })}
                {heldPosts.length === 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-muted)]">职位</span>
                    <span className="text-[var(--color-text-muted)]">无</span>
                  </div>
                )}
                {/* Virtue */}
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">贤能</span>
                  <span className="text-[var(--color-text)]">{isEmperor ? 'N/A' : Math.floor(character.official!.virtue)}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Controlled territories */}
        {controlledTerritories.length > 0 && (() => {
          const zhouCount = controlledTerritories.filter((t) => t.tier === 'zhou').length;
          const limit = character.official ? getDirectControlLimit(character) : zhouCount;
          const isOver = zhouCount > limit;
          return (
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text)] mb-1.5">
              直辖领地{' '}
              <span className={isOver ? 'text-[var(--color-accent-red)]' : ''}>
                ({zhouCount}/{limit})
              </span>
              {isOver && <span className="text-[var(--color-accent-red)] ml-1 font-normal">超额</span>}
            </h3>
            <div className="space-y-1">
              {controlledTerritories.map((t) => (
                <button
                  key={t.id}
                  className="w-full flex items-center justify-between px-2 py-1 rounded border border-[var(--color-border)] hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-bg)] transition-colors text-left"
                  onClick={() => openTerritoryModal(t.id)}
                >
                  <div>
                    <span className="text-xs text-[var(--color-accent-gold)] font-bold">{t.name}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] ml-1">
                      {TIER_LABELS[t.tier] ?? t.tier} · {t.territoryType === 'civil' ? '民政' : '军事'}
                    </span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-[var(--color-text-muted)]">
                    <span>控{Math.floor(t.control)}</span>
                    <span>发{Math.floor(t.development)}</span>
                    <span>民{Math.floor(t.populace)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          );
        })()}
      </div>

      {/* ── Bottom section: Tabs ── */}
      <div className="shrink-0 border-t border-[var(--color-border)] flex flex-col" style={{ height: '25%', minHeight: '140px' }}>
        {/* Tab bar */}
        <div className="flex border-b border-[var(--color-border)] shrink-0">
          {([
            { key: 'family' as TabKey, label: '亲族' },
            { key: 'relations' as TabKey, label: '关系' },
            { key: 'retainers' as TabKey, label: '臣属' },
            { key: 'vassals' as TabKey, label: '廷臣' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              className={`flex-1 py-1.5 text-xs font-bold transition-colors ${activeTab === key
                ? 'text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {activeTab === 'family' && (
            <FamilyTab
              character={character}
              characters={characters}
              onClickChar={pushCharacter}
              playerChar={playerChar}
              onShowOpinion={(from, toward) => setOpinionPopup({ from, toward })}
            />
          )}
          {activeTab === 'relations' && (
            <RelationsTab
              character={character}
              characters={characters}
              onClickChar={pushCharacter}
              playerChar={playerChar}
              onShowOpinion={(from, toward) => setOpinionPopup({ from, toward })}
            />
          )}
          {activeTab === 'retainers' && (
            <RetainersTab
              character={character}
              characters={characters}
              onClickChar={pushCharacter}
              playerChar={playerChar}
              onShowOpinion={(from, toward) => setOpinionPopup({ from, toward })}
            />
          )}
          {activeTab === 'vassals' && (
            <VassalsTab
              character={character}
              characters={characters}
              onClickChar={pushCharacter}
              playerChar={playerChar}
              onShowOpinion={(from, toward) => setOpinionPopup({ from, toward })}
            />
          )}
        </div>
      </div>

      {opinionPopup && (
        <OpinionPopup
          from={opinionPopup.from}
          toward={opinionPopup.toward}
          onClose={() => setOpinionPopup(null)}
        />
      )}

      {showInteractionMenu && (
        <InteractionMenu
          targetId={characterId}
          onClose={() => setShowInteractionMenu(false)}
          onSelect={(id) => {
            setShowInteractionMenu(false);
            setActiveInteraction(id);
          }}
        />
      )}

      {activeInteraction === 'appoint' && (
        <AppointFlow
          targetId={characterId}
          onClose={() => setActiveInteraction(null)}
        />
      )}

      {activeInteraction === 'dismiss' && (
        <DismissFlow
          targetId={characterId}
          onClose={() => setActiveInteraction(null)}
        />
      )}

      {activeInteraction === 'centralization' && (
        <CentralizationFlow
          targetId={characterId}
          onClose={() => setActiveInteraction(null)}
        />
      )}
    </div>
  );
};

// ── Tab sub-components ─────────────────────────────

interface TabProps {
  character: Character;
  characters: Map<string, Character>;
  onClickChar: (id: string) => void;
  playerChar?: Character;
  onShowOpinion?: (from: Character, toward: Character) => void;
}

const FamilyTab: React.FC<TabProps> = ({ character, characters, onClickChar, playerChar, onShowOpinion }) => {
  const entries: { label: string; char: Character | undefined }[] = [
    { label: '父', char: character.family.fatherId ? characters.get(character.family.fatherId) : undefined },
    { label: '母', char: character.family.motherId ? characters.get(character.family.motherId) : undefined },
    { label: '配偶', char: character.family.spouseId ? characters.get(character.family.spouseId) : undefined },
    ...character.family.childrenIds.map((id, i) => ({
      label: `子${i + 1}`,
      char: characters.get(id),
    })),
  ].filter((e) => e.char);

  if (entries.length === 0) return <div className="text-xs text-[var(--color-text-muted)] text-center py-2">无亲族记录</div>;

  return (
    <div className="space-y-1">
      {entries.map(({ label, char }) => (
        <button
          key={char!.id}
          className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--color-bg)] transition-colors text-left"
          onClick={() => onClickChar(char!.id)}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)] w-6">{label}</span>
            <span className="text-xs text-[var(--color-text)]">{char!.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">{getDynamicTitle(char!)}</span>
            {playerChar && char!.id !== playerChar.id && (
              <button
                className="text-[10px] font-bold cursor-pointer hover:underline"
                style={{ color: calculateBaseOpinion(char!, playerChar) >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowOpinion?.(char!, playerChar);
                }}
              >
                {calculateBaseOpinion(char!, playerChar) >= 0 ? '+' : ''}{calculateBaseOpinion(char!, playerChar)}
              </button>
            )}
          </div>
        </button>
      ))}
    </div>
  );
};

const RelationsTab: React.FC<TabProps> = ({ character, characters, onClickChar }) => {
  if (character.relationships.length === 0) {
    return <div className="text-xs text-[var(--color-text-muted)] text-center py-2">无关系记录</div>;
  }

  return (
    <div className="space-y-1">
      {character.relationships.map((rel) => {
        const target = characters.get(rel.targetId);
        if (!target) return null;
        const totalOpinion = rel.opinions.reduce((sum, op) => sum + op.value, 0);
        return (
          <button
            key={rel.targetId}
            className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--color-bg)] transition-colors text-left"
            onClick={() => onClickChar(rel.targetId)}
          >
            <span className="text-xs text-[var(--color-text)]">{target.name}</span>
            <span className={`text-[10px] font-bold ${totalOpinion >= 0 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
              {totalOpinion >= 0 ? '+' : ''}{totalOpinion}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const VassalsTab: React.FC<TabProps> = ({ character, characters, onClickChar, playerChar, onShowOpinion }) => {
  // 廷臣 = 效忠于你（overlordId）但没有由你任命岗位的人
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

  return (
    <div className="space-y-1">
      {courtiers.map((courtier) => {
        const opinion = playerChar && courtier.id !== playerChar.id ? calculateBaseOpinion(courtier, playerChar) : null;
        return (
          <button
            key={courtier.id}
            className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--color-bg)] transition-colors text-left"
            onClick={() => onClickChar(courtier.id)}
          >
            <div>
              <span className="text-xs text-[var(--color-text)]">{courtier.name}</span>
              <span className="text-[10px] text-[var(--color-text-muted)] ml-1">{getDynamicTitle(courtier)}</span>
            </div>
            {opinion !== null && (
              <button
                className="text-[10px] font-bold cursor-pointer hover:underline"
                style={{ color: opinion >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowOpinion?.(courtier, playerChar!);
                }}
              >
                {opinion >= 0 ? '+' : ''}{opinion}
              </button>
            )}
          </button>
        );
      })}
    </div>
  );
};

const RetainersTab: React.FC<TabProps> = ({ character, characters, onClickChar, playerChar, onShowOpinion }) => {
  const subs = getSubordinates(character.id, characters);

  if (subs.length === 0) {
    return <div className="text-xs text-[var(--color-text-muted)] text-center py-2">无臣属</div>;
  }

  return (
    <div className="space-y-1">
      {subs.map((sub) => {
        const subPosts = getHeldPosts(sub.id);
        const posNames = subPosts
          .filter((post) => post.appointedBy === character.id)
          .map((post) => positionMap.get(post.templateId)?.name ?? post.templateId)
          .join('、');
        const opinion = playerChar && sub.id !== playerChar.id ? calculateBaseOpinion(sub, playerChar) : null;
        return (
          <button
            key={sub.id}
            className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--color-bg)] transition-colors text-left"
            onClick={() => onClickChar(sub.id)}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text)]">{sub.name}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{posNames}</span>
            </div>
            {opinion !== null && (
              <button
                className="text-[10px] font-bold cursor-pointer hover:underline"
                style={{ color: opinion >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowOpinion?.(sub, playerChar!);
                }}
              >
                {opinion >= 0 ? '+' : ''}{opinion}
              </button>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default CharacterPanel;
