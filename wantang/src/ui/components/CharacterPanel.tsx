// ===== 三段式人物面板（左侧面板内嵌） =====

import React, { useState, useMemo } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { getEffectiveAbilities, calculateBaseOpinion } from '@engine/character/characterUtils';
import type { PolicyOpinionEntry } from '@engine/territory/TerritoryStore';
import { traitMap } from '@data/traits';
import { usePanelStore } from '@ui/stores/panelStore';
import type { Character } from '@engine/character/types';
import OpinionPopup from './OpinionPopup';
import { getRankTitle, getSubordinates, getDirectControlLimit, getDynamicTitle, getHeldPosts, getActualController } from '@engine/official/officialUtils';
import { rankMap } from '@data/ranks';
import { positionMap } from '@data/positions';
import { formatAmount } from '@ui/utils/formatAmount';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { getTotalTreasury } from '@engine/territory/treasuryUtils';
import { useWarStore } from '@engine/military/WarStore';
import { isWarParticipant, getWarSide } from '@engine/military/warParticipantUtils';
import { toAbsoluteDay, fromAbsoluteDay } from '@engine/dateUtils';
import { Modal, ModalHeader, Button } from './base';
import InteractionMenu from './InteractionMenu';
import AppointFlow from './AppointFlow';
import DismissFlow from './DismissFlow';
import CentralizationFlow from './CentralizationFlow';
import DeclareWarFlow from './DeclareWarFlow';
import TransferVassalFlow from './TransferVassalFlow';
import RevokeFlow from './RevokeFlow';
import UsurpPostFlow from './UsurpPostFlow';
import ReassignFlow from './ReassignFlow';
import DemandRightsFlow from './DemandRightsFlow';
import { executeDemandFealty, previewDemandFealty, previewPledgeAllegiance, executePledgeAllegiance, getJoinableWars, executeJoinWar, getCallableWars, calcCallToArmsChance, executeCallToArms, previewNegotiateTax, executeNegotiateTax, TAX_LABELS, previewProposeAlliance, executeProposeAlliance, executeBreakAlliance } from '@engine/interaction';
import type { DemandFealtyResult, FealtyChanceResult, PledgeAllegianceChanceResult, PledgeAllegianceResult, JoinableWar, CallableWar, CallToArmsChanceResult, CallToArmsResult, NegotiateTaxChanceResult, NegotiateTaxResult, ProposeAllianceChanceResult, ProposeAllianceResult } from '@engine/interaction';
import { CASUS_BELLI_NAMES } from '@engine/military/types';

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
  // mainChar here is the player character — show opinion toward player (hide for dead)
  const bExpectedLeg = useTerritoryStore(s => s.expectedLegitimacy.get(mainChar?.id ?? '') ?? null);
  const aPolicyOp = useTerritoryStore(s => s.policyOpinionCache.get(char.id) ?? null);
  const bPolicyOp = useTerritoryStore(s => s.policyOpinionCache.get(mainChar?.id ?? '') ?? null);
  const opinion = mainChar && char.id !== mainChar.id && char.alive ? calculateBaseOpinion(char, mainChar, bExpectedLeg, aPolicyOp, bPolicyOp) : null;
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
  const [fealtyPreview, setFealtyPreview] = useState<FealtyChanceResult | null>(null);
  const [fealtyResult, setFealtyResult] = useState<DemandFealtyResult | null>(null);
  const [pledgePreview, setPledgePreview] = useState<PledgeAllegianceChanceResult | null>(null);
  const [pledgeResult, setPledgeResult] = useState<PledgeAllegianceResult | null>(null);
  const [ctaPreview, setCtaPreview] = useState<{ war: CallableWar; chance: CallToArmsChanceResult } | null>(null);
  const [ctaResult, setCtaResult] = useState<CallToArmsResult | null>(null);
  const [taxNegDelta, setTaxNegDelta] = useState<number | null>(null); // 议定进奉选定方向
  const [taxNegPreview, setTaxNegPreview] = useState<NegotiateTaxChanceResult | null>(null);
  const [taxNegResult, setTaxNegResult] = useState<NegotiateTaxResult | null>(null);
  const [alliancePreview, setAlliancePreview] = useState<ProposeAllianceChanceResult | null>(null);
  const [allianceResult, setAllianceResult] = useState<ProposeAllianceResult | null>(null);
  const [breakAllianceConfirm, setBreakAllianceConfirm] = useState(false);

  const character = useCharacterStore((s) => s.characters.get(characterId));
  const playerId = useCharacterStore((s) => s.playerId);
  const playerChar = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const expectedLegitimacy = useTerritoryStore((s) => s.expectedLegitimacy);
  const policyCache = useTerritoryStore((s) => s.policyOpinionCache);
  const currentDate = useTurnManager((s) => s.currentDate);
  const currentYear = currentDate.year;
  const { pushCharacter, openTerritoryModal, goBack, goToPlayer, close, togglePin } = usePanelStore();
  const pinned = usePanelStore((s) => s.pinned);
  const canGoBack = usePanelStore((s) => s.stack.length > 1);

  // 注：不能在这里 early-return —— 后面还有 useWarStore / useMemo 等 Hook，character 在
  // 生命周期内"有→无"切换会导致 Hook 数量不一致。所有非 Hook 派生值挪到全部 Hook 之后再算。

  // Active wars (responsive subscription)
  const wars = useWarStore((s) => s.wars);
  const activeWars = useMemo(
    () => [...wars.values()].filter(w => w.status === 'active' && isWarParticipant(characterId, w)),
    [wars, characterId],
  );

  // Truces (responsive subscription)
  const truces = useWarStore((s) => s.truces);
  const currentAbsDay = toAbsoluteDay(currentDate);
  const activeTruces = useMemo(() => {
    const result: { opponentId: string; opponentName: string; expiryDate: string }[] = [];
    for (const t of truces.values()) {
      if (t.expiryDay <= currentAbsDay) continue;
      let opponentId: string | null = null;
      if (t.partyA === characterId) opponentId = t.partyB;
      else if (t.partyB === characterId) opponentId = t.partyA;
      if (!opponentId) continue;
      const opponent = characters.get(opponentId);
      const expiry = fromAbsoluteDay(t.expiryDay);
      result.push({
        opponentId,
        opponentName: opponent?.name ?? '???',
        expiryDate: `${expiry.year}年${expiry.month}月`,
      });
    }
    return result;
  }, [truces, currentAbsDay, characterId, characters]);

  // Alliances (responsive subscription)
  const alliances = useWarStore((s) => s.alliances);
  const activeAlliances = useMemo(() => {
    const result: { allyId: string; allyName: string; expiryDate: string }[] = [];
    for (const a of alliances.values()) {
      if (a.expiryDay <= currentAbsDay) continue;
      let allyId: string | null = null;
      if (a.partyA === characterId) allyId = a.partyB;
      else if (a.partyB === characterId) allyId = a.partyA;
      if (!allyId) continue;
      const ally = characters.get(allyId);
      const expiry = fromAbsoluteDay(a.expiryDay);
      result.push({
        allyId,
        allyName: ally?.name ?? '???',
        expiryDate: `${expiry.year}年${expiry.month}月`,
      });
    }
    return result;
  }, [alliances, currentAbsDay, characterId, characters]);

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
            {playerChar && character.id !== playerId && character.alive && (() => {
              const op = calculateBaseOpinion(character, playerChar, expectedLegitimacy.get(playerChar.id) ?? null, policyCache.get(character.id) ?? null, policyCache.get(playerChar.id) ?? null);
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

        {/* Resources — 死者不显示 */}
        {character.alive && (
        <div>
          <h3 className="text-xs font-bold text-[var(--color-text)] mb-1.5">资源</h3>
          {(() => {
            const { controllerIndex } = useTerritoryStore.getState();
            const treasury = getTotalTreasury(character.id, territories, controllerIndex);
            const { armies, battalions } = useMilitaryStore.getState();
            let totalTroops = 0;
            for (const army of armies.values()) {
              if (army.ownerId === character.id) {
                for (const batId of army.battalionIds) {
                  const bat = battalions.get(batId);
                  if (bat) totalTroops += bat.currentStrength;
                }
              }
            }
            const items: { label: string; value: number; wan?: boolean }[] = [
              { label: '国库钱', value: treasury.money, wan: true },
              { label: '国库粮', value: treasury.grain, wan: true },
              { label: '私产钱', value: character.resources.money, wan: true },
              { label: '私产粮', value: character.resources.grain, wan: true },
              { label: '名望', value: character.resources.prestige },
              { label: '正统性', value: character.resources.legitimacy },
              { label: '兵力', value: totalTroops },
            ];
            return (
              <div className="grid grid-cols-4 gap-1 text-center">
                {items.map(({ label, value, wan }) => (
                  <div key={label}>
                    <div className="text-[10px] text-[var(--color-text-muted)]">{label}</div>
                    <div className="text-sm text-[var(--color-text)] font-bold">{wan ? formatAmount(value) : Math.floor(value)}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        )}

        {/* Official Position — 死者不显示 */}
        {character.alive && character.official && (() => {
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

        {/* Current wars */}
        {activeWars.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text)] mb-1.5">
              当前战争 ({activeWars.length})
            </h3>
            <div className="space-y-1">
              {activeWars.map((war) => {
                const side = getWarSide(characterId, war);
                const isAttacker = side === 'attacker';
                const enemyId = isAttacker ? war.defenderId : war.attackerId;
                const enemy = characters.get(enemyId);
                const cbName = CASUS_BELLI_NAMES[war.casusBelli] ?? war.casusBelli;
                const roleLabel = war.attackerId === characterId ? '发起' :
                  war.defenderId === characterId ? '防御' : isAttacker ? '攻方参战' : '守方参战';
                // 战分：正=该角色��方占优
                const myScore = isAttacker ? war.warScore : -war.warScore;
                return (
                  <div key={war.id} className="flex items-center justify-between px-2 py-1 rounded border border-[var(--color-border)] text-xs">
                    <div>
                      <span className="text-[var(--color-accent-red)] font-bold">⚔</span>
                      <span className="text-[var(--color-text)] ml-1">vs</span>
                      <button
                        className="text-[var(--color-accent-gold)] ml-1 hover:underline"
                        onClick={() => pushCharacter(enemyId)}
                      >
                        {enemy?.name ?? '???'}
                      </button>
                      <span className={`ml-1.5 font-bold ${myScore > 0 ? 'text-[var(--color-accent-green)]' : myScore < 0 ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-muted)]'}`}>
                        {myScore > 0 ? '+' : ''}{myScore}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      {roleLabel} · {cbName}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Diplomacy: truces + alliances */}
        {(activeTruces.length > 0 || activeAlliances.length > 0) && (
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text)] mb-1.5">外交</h3>
            <div className="space-y-1">
              {activeAlliances.map((al) => (
                <div key={`al-${al.allyId}`} className="flex items-center justify-between px-2 py-1 rounded border border-[var(--color-accent-gold)]/50 text-xs">
                  <div>
                    <span className="text-[var(--color-accent-gold)]">同盟</span>
                    <button
                      className="text-[var(--color-accent-gold)] ml-1 hover:underline"
                      onClick={() => pushCharacter(al.allyId)}
                    >
                      {al.allyName}
                    </button>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    至 {al.expiryDate}
                  </span>
                </div>
              ))}
              {activeTruces.map((truce) => (
                <div key={`tr-${truce.opponentId}`} className="flex items-center justify-between px-2 py-1 rounded border border-[var(--color-border)] text-xs">
                  <div>
                    <span className="text-[var(--color-text-muted)]">停战</span>
                    <button
                      className="text-[var(--color-accent-gold)] ml-1 hover:underline"
                      onClick={() => pushCharacter(truce.opponentId)}
                    >
                      {truce.opponentName}
                    </button>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    至 {truce.expiryDate}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
              expectedLegMap={expectedLegitimacy}
              policyCache={policyCache}
            />
          )}
          {activeTab === 'relations' && (
            <RelationsTab
              character={character}
              characters={characters}
              onClickChar={pushCharacter}
              playerChar={playerChar}
              onShowOpinion={(from, toward) => setOpinionPopup({ from, toward })}
              expectedLegMap={expectedLegitimacy}
              policyCache={policyCache}
            />
          )}
          {activeTab === 'retainers' && (
            <RetainersTab
              character={character}
              characters={characters}
              onClickChar={pushCharacter}
              playerChar={playerChar}
              onShowOpinion={(from, toward) => setOpinionPopup({ from, toward })}
              expectedLegMap={expectedLegitimacy}
              policyCache={policyCache}
            />
          )}
          {activeTab === 'vassals' && (
            <VassalsTab
              character={character}
              characters={characters}
              onClickChar={pushCharacter}
              playerChar={playerChar}
              onShowOpinion={(from, toward) => setOpinionPopup({ from, toward })}
              expectedLegMap={expectedLegitimacy}
              policyCache={policyCache}
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
            if (id === 'demandFealty' && playerId) {
              setFealtyPreview(previewDemandFealty(playerId, characterId));
              return;
            }
            if (id === 'pledgeAllegiance' && playerId) {
              setPledgePreview(previewPledgeAllegiance(playerId, characterId));
              return;
            }
            if (id === 'proposeAlliance' && playerId) {
              setAlliancePreview(previewProposeAlliance(playerId, characterId));
              return;
            }
            if (id === 'breakAlliance' && playerId) {
              setBreakAllianceConfirm(true);
              return;
            }
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

      {activeInteraction === 'declareWar' && (
        <DeclareWarFlow
          targetId={characterId}
          onClose={() => setActiveInteraction(null)}
        />
      )}

      {activeInteraction === 'transferVassal' && (
        <TransferVassalFlow
          targetId={characterId}
          onClose={() => setActiveInteraction(null)}
        />
      )}

      {activeInteraction === 'revoke' && (
        <RevokeFlow
          targetId={characterId}
          onClose={() => setActiveInteraction(null)}
        />
      )}

      {activeInteraction === 'usurpPost' && (
        <UsurpPostFlow
          targetId={characterId}
          onClose={() => setActiveInteraction(null)}
        />
      )}

      {activeInteraction === 'reassign' && (
        <ReassignFlow
          targetId={characterId}
          onClose={() => setActiveInteraction(null)}
        />
      )}

      {activeInteraction === 'demandRights' && (
        <DemandRightsFlow
          targetId={characterId}
          onClose={() => setActiveInteraction(null)}
        />
      )}

      {activeInteraction === 'negotiateTax' && !taxNegResult && (() => {
        const currentLevel = playerChar?.centralization ?? 2;
        const canDown = currentLevel > 1;
        const canUp = currentLevel < 4;

        // 已选方向 → 显示预览
        if (taxNegDelta !== null && taxNegPreview) {
          const newLevel = currentLevel + taxNegDelta;
          return (
            <Modal size="sm" onOverlayClick={() => { setTaxNegDelta(null); setTaxNegPreview(null); }}>
              <ModalHeader title={`议定进奉 — ${character?.name ?? ''}`} onClose={() => { setTaxNegDelta(null); setTaxNegPreview(null); }} />
              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="text-xs text-[var(--color-text-muted)]">
                  {TAX_LABELS[currentLevel]}（{currentLevel}级）→ {TAX_LABELS[newLevel]}（{newLevel}级）
                </div>
                <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                  <div>成功率：<span className="text-[var(--color-text)] font-bold">{taxNegPreview.chance}%</span></div>
                  <div className="border-t border-[var(--color-border)] pt-1 mt-1">
                    <div>基础：{taxNegPreview.breakdown.base}</div>
                    <div>好感：{taxNegPreview.breakdown.opinion >= 0 ? '+' : ''}{taxNegPreview.breakdown.opinion}</div>
                    <div>兵力：{taxNegPreview.breakdown.power >= 0 ? '+' : ''}{taxNegPreview.breakdown.power}</div>
                    <div>性格：{taxNegPreview.breakdown.personality >= 0 ? '+' : ''}{taxNegPreview.breakdown.personality}</div>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-accent-red)]">失败将导致好感 -15</p>
                <div className="flex gap-2">
                  <Button variant="default" className="flex-1" onClick={() => { setTaxNegDelta(null); setTaxNegPreview(null); }}>返回</Button>
                  <Button variant="primary" className="flex-1" onClick={() => {
                    if (!playerId) return;
                    const res = executeNegotiateTax(playerId, characterId, taxNegDelta);
                    setTaxNegResult(res);
                  }}>确认议定</Button>
                </div>
              </div>
            </Modal>
          );
        }

        // 未选方向 → 选择升/降
        return (
          <Modal size="sm" onOverlayClick={() => { setActiveInteraction(null); setTaxNegDelta(null); setTaxNegPreview(null); }}>
            <ModalHeader title={`议定进奉 — ${character?.name ?? ''}`} onClose={() => { setActiveInteraction(null); setTaxNegDelta(null); setTaxNegPreview(null); }} />
            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="text-xs text-[var(--color-text-muted)]">
                当前进奉等级：{TAX_LABELS[currentLevel]}（{currentLevel}级）
              </div>
              <div className="flex flex-col gap-2">
                {canDown && (
                  <Button variant="default" className="w-full text-left" onClick={() => {
                    if (!playerId) return;
                    setTaxNegDelta(-1);
                    setTaxNegPreview(previewNegotiateTax(playerId, characterId, -1));
                  }}>
                    <span className="text-[var(--color-accent-green)]">请求降低</span>
                    <span className="text-[var(--color-text-muted)] ml-2">→ {TAX_LABELS[currentLevel - 1]}（{currentLevel - 1}级）</span>
                  </Button>
                )}
                {canUp && (
                  <Button variant="default" className="w-full text-left" onClick={() => {
                    if (!playerId) return;
                    setTaxNegDelta(1);
                    setTaxNegPreview(previewNegotiateTax(playerId, characterId, 1));
                  }}>
                    <span className="text-[var(--color-accent-red)]">提议提高</span>
                    <span className="text-[var(--color-text-muted)] ml-2">→ {TAX_LABELS[currentLevel + 1]}（{currentLevel + 1}级）</span>
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {taxNegResult && (
        <Modal size="sm" onOverlayClick={() => { setTaxNegResult(null); setTaxNegPreview(null); setTaxNegDelta(null); setActiveInteraction(null); }}>
          <ModalHeader title={taxNegResult.stale ? '操作未生效' : (taxNegResult.success ? '议定成功' : '议定失败')} onClose={() => { setTaxNegResult(null); setTaxNegPreview(null); setTaxNegDelta(null); setActiveInteraction(null); }} />
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className={`text-sm ${taxNegResult.stale ? 'text-[var(--color-accent-red)]' : (taxNegResult.success ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]')}`}>
              {taxNegResult.stale
                ? '局势已发生变化，议定未生效。'
                : (taxNegResult.success
                  ? `${character?.name ?? ''}同意调整进奉等级`
                  : `${character?.name ?? ''}拒绝了你的请求，关系恶化`)}
            </p>
            <Button variant="default" className="w-full" onClick={() => { setTaxNegResult(null); setTaxNegPreview(null); setTaxNegDelta(null); setActiveInteraction(null); }}>确定</Button>
          </div>
        </Modal>
      )}

      {activeInteraction === 'joinWar' && (() => {
        const player = playerId ? useCharacterStore.getState().characters.get(playerId) : undefined;
        const target = useCharacterStore.getState().characters.get(characterId);
        const joinable = player && target ? getJoinableWars(player, target) : [];
        const chars = useCharacterStore.getState().characters;
        return (
          <Modal size="sm" onOverlayClick={() => setActiveInteraction(null)}>
            <ModalHeader title={`干涉战争 — ${target?.name ?? ''}`} onClose={() => setActiveInteraction(null)} />
            <div className="px-5 py-4 flex flex-col gap-3">
              {joinable.length === 0 ? (
                <div className="text-xs text-[var(--color-text-muted)] py-2">无可干涉的战争</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {joinable.map(({ war, targetSide }: JoinableWar) => {
                    const attackerName = chars.get(war.attackerId)?.name ?? '?';
                    const defenderName = chars.get(war.defenderId)?.name ?? '?';
                    return (
                      <div key={war.id} className="border border-[var(--color-border)] rounded px-3 py-2">
                        <div className="text-xs mb-1">
                          <span className="font-bold">{attackerName}</span>
                          <span className="text-[var(--color-text-muted)]"> 对 </span>
                          <span className="font-bold">{defenderName}</span>
                          <span className="text-[var(--color-text-muted)]"> — {CASUS_BELLI_NAMES[war.casusBelli]}</span>
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)] mb-1.5">
                          战分：<span className={war.warScore > 0 ? 'text-[var(--color-accent-green)]' : war.warScore < 0 ? 'text-[var(--color-accent-red)]' : ''}>{war.warScore > 0 ? '+' : ''}{Math.round(war.warScore)}</span>
                          {' · '}{target?.name}在{targetSide === 'attacker' ? '攻方' : '守方'}
                        </div>
                        <Button variant="primary" size="sm" className="w-full" onClick={() => {
                          executeJoinWar(playerId!, war.id, targetSide);
                          setActiveInteraction(null);
                        }}>
                          加入{targetSide === 'attacker' ? '攻方' : '守方'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* 召集参战：选择战争 */}
      {activeInteraction === 'callToArms' && !ctaPreview && !ctaResult && (() => {
        const player = playerId ? useCharacterStore.getState().characters.get(playerId) : undefined;
        const target = useCharacterStore.getState().characters.get(characterId);
        const callable = player && target ? getCallableWars(player, target) : [];
        const chars = useCharacterStore.getState().characters;
        return (
          <Modal size="sm" onOverlayClick={() => setActiveInteraction(null)}>
            <ModalHeader title={`召集参战 — ${target?.name ?? ''}`} onClose={() => setActiveInteraction(null)} />
            <div className="px-5 py-4 flex flex-col gap-3">
              {callable.length === 0 ? (
                <div className="text-xs text-[var(--color-text-muted)] py-2">无可召集的战争</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {callable.map(({ war, side }: CallableWar) => {
                    const attackerName = chars.get(war.attackerId)?.name ?? '?';
                    const defenderName = chars.get(war.defenderId)?.name ?? '?';
                    return (
                      <div key={war.id} className="border border-[var(--color-border)] rounded px-3 py-2">
                        <div className="text-xs mb-1">
                          <span className="font-bold">{attackerName}</span>
                          <span className="text-[var(--color-text-muted)]"> 对 </span>
                          <span className="font-bold">{defenderName}</span>
                          <span className="text-[var(--color-text-muted)]"> — {CASUS_BELLI_NAMES[war.casusBelli]}</span>
                        </div>
                        <Button variant="primary" size="sm" className="w-full" onClick={() => {
                          const chance = calcCallToArmsChance(playerId!, characterId);
                          setCtaPreview({ war: { war, side }, chance });
                        }}>
                          召集加入{side === 'attacker' ? '攻方' : '守方'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* 召集参战：概率预览 */}
      {ctaPreview && !ctaResult && (
        <Modal size="sm" onOverlayClick={() => { setCtaPreview(null); setActiveInteraction(null); }}>
          <ModalHeader title={`召集参战 — ${character?.name ?? ''}`} onClose={() => { setCtaPreview(null); setActiveInteraction(null); }} />
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="text-xs text-[var(--color-text-muted)] space-y-1">
              <div>接受概率：<span className="text-[var(--color-text)] font-bold">{ctaPreview.chance.chance}%</span></div>
              <div className="border-t border-[var(--color-border)] pt-1 mt-1">
                <div>基础：{ctaPreview.chance.breakdown.base}</div>
                <div>好感：{ctaPreview.chance.breakdown.opinion >= 0 ? '+' : ''}{ctaPreview.chance.breakdown.opinion}</div>
                <div>荣誉：{ctaPreview.chance.breakdown.honor >= 0 ? '+' : ''}{ctaPreview.chance.breakdown.honor}</div>
                <div>胆识：{ctaPreview.chance.breakdown.boldness >= 0 ? '+' : ''}{ctaPreview.chance.breakdown.boldness}</div>
              </div>
              <div className="text-[var(--color-accent-red)] mt-1">拒绝后好感 -30</div>
            </div>
            <div className="flex gap-2">
              <Button variant="default" className="flex-1" onClick={() => { setCtaPreview(null); setActiveInteraction(null); }}>取消</Button>
              <Button variant="primary" className="flex-1" onClick={() => {
                if (!playerId) return;
                const result = executeCallToArms(playerId, characterId, ctaPreview.war.war.id, ctaPreview.war.side);
                setCtaResult(result);
              }}>召集</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 召集参战：结果 */}
      {ctaResult && (
        <Modal size="sm" onOverlayClick={() => { setCtaResult(null); setCtaPreview(null); setActiveInteraction(null); }}>
          <ModalHeader title={ctaResult.stale ? '操作未生效' : (ctaResult.success ? '召集成功' : '召集被拒')} onClose={() => { setCtaResult(null); setCtaPreview(null); setActiveInteraction(null); }} />
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className={`text-sm ${ctaResult.stale ? 'text-[var(--color-accent-red)]' : (ctaResult.success ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]')}`}>
              {ctaResult.stale
                ? '局势已发生变化，召集未生效。'
                : (ctaResult.success
                  ? `${ctaResult.targetName}响应号召，加入战争`
                  : `${ctaResult.targetName}拒绝了召集（好感-30）`)}
            </p>
            <Button variant="default" className="w-full" onClick={() => { setCtaResult(null); setCtaPreview(null); setActiveInteraction(null); }}>确定</Button>
          </div>
        </Modal>
      )}

      {/* 要求效忠：预览 */}
      {fealtyPreview && !fealtyResult && (
        <Modal size="sm" onOverlayClick={() => setFealtyPreview(null)}>
          <ModalHeader title={`要求效忠 — ${character?.name ?? ''}`} onClose={() => setFealtyPreview(null)} />
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="text-xs text-[var(--color-text-muted)] space-y-1">
              <div>成功率：<span className="text-[var(--color-text)] font-bold">{fealtyPreview.chance}%</span></div>
              <div className="border-t border-[var(--color-border)] pt-1 mt-1">
                <div>基础：{fealtyPreview.breakdown.base}</div>
                <div>好感：{fealtyPreview.breakdown.opinion >= 0 ? '+' : ''}{fealtyPreview.breakdown.opinion}</div>
                <div>兵力：{fealtyPreview.breakdown.power >= 0 ? '+' : ''}{fealtyPreview.breakdown.power}</div>
                <div>性格：{fealtyPreview.breakdown.personality >= 0 ? '+' : ''}{fealtyPreview.breakdown.personality}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="default" className="flex-1" onClick={() => setFealtyPreview(null)}>取消</Button>
              <Button variant="primary" className="flex-1" onClick={() => {
                if (!playerId) return;
                const result = executeDemandFealty(playerId, characterId);
                setFealtyResult(result);
              }}>确定</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 要求效忠：结果 */}
      {fealtyResult && (
        <Modal size="sm" onOverlayClick={() => { setFealtyResult(null); setFealtyPreview(null); }}>
          <ModalHeader title={fealtyResult.stale ? '操作未生效' : (fealtyResult.success ? '效忠成功' : '要求被拒')} onClose={() => { setFealtyResult(null); setFealtyPreview(null); }} />
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className={`text-sm ${fealtyResult.stale ? 'text-[var(--color-accent-red)]' : (fealtyResult.success ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]')}`}>
              {fealtyResult.stale
                ? '局势已发生变化，要求效忠未生效。'
                : (fealtyResult.success
                  ? `${character?.name ?? ''}宣誓效忠于${playerChar?.name ?? '我'}`
                  : `${character?.name ?? ''}对此无动于衷`)}
            </p>
            <Button variant="default" className="w-full" onClick={() => { setFealtyResult(null); setFealtyPreview(null); }}>确定</Button>
          </div>
        </Modal>
      )}

      {/* 归附：预览 */}
      {pledgePreview && !pledgeResult && (
        <Modal size="sm" onOverlayClick={() => setPledgePreview(null)}>
          <ModalHeader title={`归附 — ${character?.name ?? ''}`} onClose={() => setPledgePreview(null)} />
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="text-xs text-[var(--color-text-muted)] space-y-1">
              <div>成功率：<span className="text-[var(--color-text)] font-bold">{pledgePreview.chance}%</span></div>
              <div className="border-t border-[var(--color-border)] pt-1 mt-1">
                <div>基础：{pledgePreview.breakdown.base}</div>
                <div>法理：{pledgePreview.breakdown.dejure >= 0 ? '+' : ''}{pledgePreview.breakdown.dejure}</div>
                <div>好感：{pledgePreview.breakdown.opinion >= 0 ? '+' : ''}{pledgePreview.breakdown.opinion}</div>
                <div>性格：{pledgePreview.breakdown.personality >= 0 ? '+' : ''}{pledgePreview.breakdown.personality}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="default" className="flex-1" onClick={() => setPledgePreview(null)}>取消</Button>
              <Button variant="primary" className="flex-1" onClick={() => {
                if (!playerId) return;
                const result = executePledgeAllegiance(playerId, characterId);
                setPledgeResult(result);
              }}>确定</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 归附：结果 */}
      {pledgeResult && (
        <Modal size="sm" onOverlayClick={() => { setPledgeResult(null); setPledgePreview(null); }}>
          <ModalHeader title={pledgeResult.stale ? '操作未生效' : (pledgeResult.success ? '归附成功' : '归附被拒')} onClose={() => { setPledgeResult(null); setPledgePreview(null); }} />
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className={`text-sm ${pledgeResult.stale ? 'text-[var(--color-accent-red)]' : (pledgeResult.success ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]')}`}>
              {pledgeResult.stale
                ? '局势已发生变化，归附未生效。'
                : (pledgeResult.success
                  ? `${playerChar?.name ?? '我'}成功归附${character?.name ?? ''}`
                  : `${character?.name ?? ''}拒绝了你的归附请求`)}
            </p>
            <Button variant="default" className="w-full" onClick={() => { setPledgeResult(null); setPledgePreview(null); }}>确定</Button>
          </div>
        </Modal>
      )}

      {/* 提议结盟：预览 */}
      {alliancePreview && !allianceResult && (
        <Modal size="sm" onOverlayClick={() => setAlliancePreview(null)}>
          <ModalHeader title={`提议结盟 — ${character?.name ?? ''}`} onClose={() => setAlliancePreview(null)} />
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="text-xs text-[var(--color-text-muted)] space-y-1">
              <div>对方接受成功率：<span className="text-[var(--color-accent-gold)] font-bold">{alliancePreview.chance}%</span></div>
              <div className="border-t border-[var(--color-border)] pt-1 mt-1">
                <div>基础：{alliancePreview.breakdown.base}</div>
                <div>好感：{alliancePreview.breakdown.opinion >= 0 ? '+' : ''}{alliancePreview.breakdown.opinion}</div>
                <div>共同敌人：{alliancePreview.breakdown.commonEnemy >= 0 ? '+' : ''}{alliancePreview.breakdown.commonEnemy}</div>
                <div>地缘：{alliancePreview.breakdown.geo >= 0 ? '+' : ''}{alliancePreview.breakdown.geo}</div>
                <div>实力对比：{alliancePreview.breakdown.powerGap >= 0 ? '+' : ''}{alliancePreview.breakdown.powerGap}</div>
                <div>危局：{alliancePreview.breakdown.dire >= 0 ? '+' : ''}{alliancePreview.breakdown.dire}</div>
                <div>性格：{alliancePreview.breakdown.personality >= 0 ? '+' : ''}{alliancePreview.breakdown.personality}</div>
              </div>
              <div className="border-t border-[var(--color-border)] pt-2 mt-2 text-[var(--color-text-muted)]">
                同盟期限：3 年。期间双方战争将自动拉入盟友。背弃盟约将受巨额名望/正统性惩罚。
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="default" className="flex-1" onClick={() => setAlliancePreview(null)}>取消</Button>
              <Button variant="primary" className="flex-1" onClick={() => {
                if (!playerId) return;
                const result = executeProposeAlliance(playerId, characterId);
                setAllianceResult(result);
              }}>提议</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 提议结盟：结果 */}
      {allianceResult && (
        <Modal size="sm" onOverlayClick={() => { setAllianceResult(null); setAlliancePreview(null); }}>
          <ModalHeader
            title={allianceResult.kind === 'stale' ? '操作未生效' : (allianceResult.kind === 'accepted' ? '缔结同盟' : '结盟被拒')}
            onClose={() => { setAllianceResult(null); setAlliancePreview(null); }}
          />
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className={`text-sm ${allianceResult.kind === 'accepted' ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
              {allianceResult.kind === 'stale'
                ? '局势已发生变化，结盟提议未生效。'
                : (allianceResult.kind === 'accepted'
                  ? `${character?.name ?? ''}接受了你的结盟提议，双方缔结盟约（三年）。`
                  : `${character?.name ?? ''}拒绝了你的结盟提议。`)}
            </p>
            <Button variant="default" className="w-full" onClick={() => { setAllianceResult(null); setAlliancePreview(null); }}>确定</Button>
          </div>
        </Modal>
      )}

      {/* 解除同盟：确认 */}
      {breakAllianceConfirm && (
        <Modal size="sm" onOverlayClick={() => setBreakAllianceConfirm(false)}>
          <ModalHeader title={`解除同盟 — ${character?.name ?? ''}`} onClose={() => setBreakAllianceConfirm(false)} />
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              确认单方面解除与{character?.name ?? ''}的盟约？
            </p>
            <div className="text-xs text-[var(--color-accent-red)] border-t border-[var(--color-border)] pt-2">
              代价：威望 -40，对方好感 -50，双方关系降至中立。
            </div>
            <div className="flex gap-2">
              <Button variant="default" className="flex-1" onClick={() => setBreakAllianceConfirm(false)}>取消</Button>
              <Button variant="danger" className="flex-1" onClick={() => {
                if (!playerId) return;
                executeBreakAlliance(playerId, characterId);
                setBreakAllianceConfirm(false);
              }}>解除</Button>
            </div>
          </div>
        </Modal>
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
  expectedLegMap: Map<string, number>;
  policyCache: Map<string, PolicyOpinionEntry>;
}

const FamilyTab: React.FC<TabProps> = ({ character, characters, onClickChar, playerChar, onShowOpinion, expectedLegMap, policyCache }) => {
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
            {playerChar && char!.id !== playerChar.id && char!.alive && (
              <button
                className="text-[10px] font-bold cursor-pointer hover:underline"
                style={{ color: calculateBaseOpinion(char!, playerChar, expectedLegMap.get(playerChar.id) ?? null, policyCache.get(char!.id) ?? null, policyCache.get(playerChar.id) ?? null) >= 0 ? 'var(--color-accent-green)' : 'var(--color-accent-red)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowOpinion?.(char!, playerChar);
                }}
              >
                {calculateBaseOpinion(char!, playerChar, expectedLegMap.get(playerChar.id) ?? null, policyCache.get(char!.id) ?? null, policyCache.get(playerChar.id) ?? null) >= 0 ? '+' : ''}{calculateBaseOpinion(char!, playerChar, expectedLegMap.get(playerChar.id) ?? null, policyCache.get(char!.id) ?? null, policyCache.get(playerChar.id) ?? null)}
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

const VassalsTab: React.FC<TabProps> = ({ character, characters, onClickChar, playerChar, onShowOpinion, expectedLegMap, policyCache }) => {
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
        const opinion = playerChar && courtier.id !== playerChar.id ? calculateBaseOpinion(courtier, playerChar, expectedLegMap.get(playerChar.id) ?? null, policyCache.get(courtier.id) ?? null, policyCache.get(playerChar.id) ?? null) : null;
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

const RetainersTab: React.FC<TabProps> = ({ character, characters, onClickChar, playerChar, onShowOpinion, expectedLegMap, policyCache }) => {
  const territories = useTerritoryStore((s) => s.territories);
  const subs = getSubordinates(character.id, characters);

  if (subs.length === 0) {
    return <div className="text-xs text-[var(--color-text-muted)] text-center py-2">无臣属</div>;
  }

  return (
    <div className="space-y-1">
      {subs.map((sub) => {
        const subPosts = getHeldPosts(sub.id);
        const posNames = subPosts
          .map((post) => {
            const tplName = positionMap.get(post.templateId)?.name ?? post.templateId;
            const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
            return terrName ? `${terrName}${tplName}` : tplName;
          })
          .join('、');
        const opinion = playerChar && sub.id !== playerChar.id ? calculateBaseOpinion(sub, playerChar, expectedLegMap.get(playerChar.id) ?? null, policyCache.get(sub.id) ?? null, policyCache.get(playerChar.id) ?? null) : null;
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
