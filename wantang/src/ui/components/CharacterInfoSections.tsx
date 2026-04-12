// ===== CharacterInfoSections — 属性行 + 可滚动中段（官职/资源/领地/战争/外交） =====

import React from 'react';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import type { War } from '@engine/military/types';
import { CASUS_BELLI_NAMES } from '@engine/military/types';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { getRankTitle, getDirectControlLimit, getHeldPosts } from '@engine/official/officialUtils';
import { rankMap } from '@data/ranks';
import { positionMap } from '@data/positions';
import { formatAmount } from '@ui/utils/formatAmount';
import { getTotalTreasury } from '@engine/territory/treasuryUtils';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { getWarSide } from '@engine/military/warParticipantUtils';
import { Tooltip } from './base/Tooltip';
import { IconCoins, IconGrain, IconSeal, IconBalance, IconSword, IconCastle } from './icons/ResourceIcons';

// ── Constants ──────────────────────────────────────

const ABILITY_LABELS: { key: keyof Character['abilities']; label: string }[] = [
  { key: 'military', label: '军事' },
  { key: 'administration', label: '管理' },
  { key: 'strategy', label: '谋略' },
  { key: 'diplomacy', label: '外交' },
  { key: 'scholarship', label: '学识' },
];

const TIER_LABELS: Record<string, string> = { zhou: '州', dao: '道', guo: '国' };

// ── Props ──────────────────────────────────────────

interface CharacterInfoSectionsProps {
  character: Character;
  characterId: string;
  territories: Map<string, Territory>;
  characters: Map<string, Character>;
  controlledTerritories: Territory[];
  activeWars: War[];
  activeTruces: { opponentId: string; opponentName: string; expiryDate: string }[];
  activeAlliances: { allyId: string; allyName: string; expiryDate: string }[];
  onPushCharacter: (id: string) => void;
  onOpenTerritoryModal: (id: string) => void;
}

// ── Component ──────────────────────────────────────

const CharacterInfoSections: React.FC<CharacterInfoSectionsProps> = ({
  character,
  characterId,
  territories,
  characters,
  controlledTerritories,
  activeWars,
  activeTruces,
  activeAlliances,
  onPushCharacter,
  onOpenTerritoryModal,
}) => {
  const controllerIndex = useTerritoryStore((s) => s.controllerIndex);
  const armies = useMilitaryStore((s) => s.armies);
  const battalions = useMilitaryStore((s) => s.battalions);

  const effective = getEffectiveAbilities(character);

  return (
    <>
      {/* ════ 属性行（不可滚动） ════ */}
      <div className="shrink-0 px-4 py-2" style={{ borderBottom: '1px solid rgba(74,62,49,0.3)' }}>
        <div className="grid grid-cols-5 gap-1">
          {ABILITY_LABELS.map(({ key, label }) => {
            const base = character.abilities[key];
            const eff = effective[key];
            const diff = eff - base;
            return (
              <div key={key} className="text-center">
                <div className="text-xs text-[var(--color-text)]">{label}</div>
                <div className="text-lg font-bold text-[var(--color-text)]">
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

      {/* ════ 可滚动中段 ════ */}
      <div className="overflow-y-auto px-4 py-2 shrink-0" style={{ height: '380px' }}>

        {/* 资源（图标+数字，hover tooltip） — 死者不显示 */}
        {character.alive && (() => {
          const treasury = getTotalTreasury(character.id, territories, controllerIndex);
          let totalTroops = 0;
          for (const army of armies.values()) {
            if (army.ownerId === character.id) {
              for (const batId of army.battalionIds) {
                const bat = battalions.get(batId);
                if (bat) totalTroops += bat.currentStrength;
              }
            }
          }
          const zhouCount = controlledTerritories.filter((t) => t.tier === 'zhou').length;
          const limit = character.official ? getDirectControlLimit(character) : zhouCount;

          return (
            <div className="pb-3 mb-3" style={{ borderBottom: '1px solid rgba(74,62,49,0.3)' }}>
              <div className="flex items-start gap-0">
                {/* 左侧：资源二字竖排 */}
                <div className="shrink-0 flex flex-col items-center justify-center mr-2 select-none self-stretch">
                  <span className="text-xs font-bold text-[var(--color-text)]" style={{ writingMode: 'vertical-rl', letterSpacing: '0.5em' }}>资源</span>
                </div>

                {/* 资源项 — 8列网格 */}
                <div className="flex-1 grid grid-cols-8" style={{ justifyItems: 'center' }}>
                  {/* 第一行：标题 */}
                  <div className="col-span-2 text-center text-xs text-[var(--color-text-muted)] pb-1">国库</div>
                  <div className="col-span-2 text-center text-xs text-[var(--color-text-muted)] pb-1">私产</div>
                  <div className="col-span-4" />
                  {/* 第二行：8个图标各占1格，统一尺寸对齐 */}
                  {[
                    { tip: `国库·钱：${formatAmount(treasury.money)}贯`, icon: <IconCoins size={20} className="text-[var(--color-accent-gold)]" />, val: formatAmount(Math.floor(treasury.money)) },
                    { tip: `国库·粮：${formatAmount(treasury.grain)}斛`, icon: <IconGrain size={20} className="text-[var(--color-accent-gold)]" />, val: formatAmount(Math.floor(treasury.grain)) },
                    { tip: `私产·钱：${formatAmount(character.resources.money)}贯`, icon: <IconCoins size={20} className="text-[var(--color-accent-gold)]" />, val: formatAmount(Math.floor(character.resources.money)) },
                    { tip: `私产·粮：${formatAmount(character.resources.grain)}斛`, icon: <IconGrain size={20} className="text-[var(--color-accent-gold)]" />, val: formatAmount(Math.floor(character.resources.grain)) },
                    { tip: `名望：${Math.floor(character.resources.prestige)}`, icon: <span style={{ display: 'inline-flex', transform: 'scaleY(1.2)' }}><IconSeal size={24} className="text-[var(--color-accent-gold)]" /></span>, val: String(Math.floor(character.resources.prestige)) },
                    { tip: `正统性：${Math.floor(character.resources.legitimacy)}`, icon: <IconBalance size={20} className="text-[var(--color-accent-gold)]" />, val: String(Math.floor(character.resources.legitimacy)) },
                    { tip: `兵力：${totalTroops}`, icon: <IconSword size={17} className="text-[var(--color-accent-gold)]" />, val: String(totalTroops) },
                    { tip: `直辖州数：${zhouCount}/${limit}`, icon: <span style={{ display: 'inline-flex', transform: 'scaleY(1.25)' }}><IconCastle size={23} className="text-[var(--color-accent-gold)]" /></span>, val: `${zhouCount}/${limit}` },
                  ].map((item, i) => (
                    <Tooltip key={i} content={<div className="text-xs">{item.tip}</div>}>
                      <div className="flex flex-col items-center justify-start cursor-default">
                        <div className="w-5 h-5 flex items-center justify-center">{item.icon}</div>
                        <span className="text-xs font-bold text-[var(--color-text)] mt-0.5" style={{ fontFeatureSettings: '"tnum"' }}>{item.val}</span>
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 官职 — 死者不显示 */}
        {character.alive && character.official && (() => {
          const heldPosts = getHeldPosts(character.id);
          const isEmperor = heldPosts.some((p) => p.templateId === 'pos-emperor');
          return (
            <div className="pb-3 mb-3" style={{ borderBottom: '1px solid rgba(74,62,49,0.3)' }}>
              <div className="flex items-start gap-0">
                {/* 左侧：官职二字竖排 */}
                <div className="shrink-0 flex flex-col items-center justify-center mr-2 select-none self-stretch">
                  <span className="text-xs font-bold text-[var(--color-text)]" style={{ writingMode: 'vertical-rl', letterSpacing: '0.5em' }}>官职</span>
                </div>
                {/* 右侧内容 */}
                <div className="flex-1 min-w-0">
                  {/* 品位 · 贤能 一行 */}
                  <div className="text-xs text-[var(--color-text-muted)] mb-1.5">
                    品位 <span className="text-[var(--color-accent-gold)] font-bold">
                      {isEmperor ? 'N/A' : `${rankMap.get(character.official!.rankLevel)?.name ?? '无'} · ${getRankTitle(character)}`}
                    </span>
                    <span className="mx-2">·</span>
                    贤能 <span className="text-[var(--color-text)] font-bold">{isEmperor ? 'N/A' : Math.floor(character.official!.virtue)}</span>
                  </div>
                  {/* 职位标签密集排列 */}
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-xs text-[var(--color-text-muted)] mr-0.5">职位</span>
                    {heldPosts.map((post) => {
                      const posDef = positionMap.get(post.templateId);
                      const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
                      return (
                        <span
                          key={post.id}
                          className="px-1.5 py-0.5 text-[11px] rounded"
                          style={{
                            background: 'rgba(184,154,83,0.1)',
                            border: '1px solid rgba(184,154,83,0.3)',
                            color: 'var(--color-text)',
                          }}
                        >
                          {posDef?.name ?? post.templateId}
                          {terrName && <span className="ml-0.5">({terrName})</span>}
                        </span>
                      );
                    })}
                    {heldPosts.length === 0 && (
                      <span className="text-xs text-[var(--color-text-muted)]">无职位</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 直辖领地 */}
        {controlledTerritories.length > 0 && (() => {
          const zhouCount = controlledTerritories.filter((t) => t.tier === 'zhou').length;
          const limit = character.official ? getDirectControlLimit(character) : zhouCount;
          const isOver = zhouCount > limit;
          return (
            <div className="pb-3 mb-3" style={{ borderBottom: '1px solid rgba(74,62,49,0.3)' }}>
              <div className="flex items-start gap-0">
                {/* 左侧竖排 */}
                <div className="shrink-0 flex flex-col items-center justify-center mr-2 select-none self-stretch">
                  <span className="text-xs font-bold text-[var(--color-text)]" style={{ writingMode: 'vertical-rl', letterSpacing: '0.5em' }}>领地</span>
                </div>
                {/* 右侧内容 */}
                <div className="flex-1 min-w-0">
                  {/* 直辖计数 */}
                  <div className="text-xs text-[var(--color-text-muted)] mb-1.5">
                    直辖 <span className={`font-bold ${isOver ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text)]'}`}>{zhouCount}/{limit}</span>
                    {isOver && <span className="text-[var(--color-accent-red)] ml-1">超额</span>}
                  </div>
                  {/* 领地标签密集排列 */}
                  <div className="flex flex-wrap gap-1">
                    {controlledTerritories.map((t) => (
                      <Tooltip key={t.id} content={
                        <div className="text-xs">
                          <div className="font-bold text-[var(--color-text)] mb-1">{t.name}</div>
                          <div>类型：{TIER_LABELS[t.tier] ?? t.tier} · {t.territoryType === 'civil' ? '民政' : '军事'}</div>
                          <div>控制：{Math.floor(t.control)} · 发展：{Math.floor(t.development)} · 民力：{Math.floor(t.populace)}</div>
                        </div>
                      }>
                        <button
                          className="px-1.5 py-0.5 text-[11px] rounded cursor-pointer transition-colors hover:brightness-125"
                          style={{
                            background: 'rgba(184,154,83,0.1)',
                            border: '1px solid rgba(184,154,83,0.3)',
                            color: 'var(--color-text)',
                          }}
                          onClick={() => onOpenTerritoryModal(t.id)}
                        >
                          <span className="text-[var(--color-accent-gold)] font-bold">{t.name}</span>
                          <span className="ml-0.5">{TIER_LABELS[t.tier] ?? t.tier}</span>
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 当前战争 */}
        {activeWars.length > 0 && (
          <div className="pb-3 mb-3" style={{ borderBottom: '1px solid rgba(74,62,49,0.3)' }}>
            <div className="flex items-start gap-0">
              <div className="shrink-0 flex flex-col items-center justify-center mr-2 select-none self-stretch">
                <span className="text-xs font-bold text-[var(--color-text)]" style={{ writingMode: 'vertical-rl', letterSpacing: '0.5em' }}>战争</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[var(--color-text-muted)] mb-1.5">
                  进行中 <span className="text-[var(--color-text)] font-bold">{activeWars.length}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {activeWars.map((war) => {
                    const side = getWarSide(characterId, war);
                    const isAttacker = side === 'attacker';
                    const enemyId = isAttacker ? war.defenderId : war.attackerId;
                    const enemy = characters.get(enemyId);
                    const cbName = CASUS_BELLI_NAMES[war.casusBelli] ?? war.casusBelli;
                    const roleLabel = war.attackerId === characterId ? '发起' :
                      war.defenderId === characterId ? '防御' : isAttacker ? '攻方参战' : '守方参战';
                    const myScore = isAttacker ? war.warScore : -war.warScore;
                    return (
                      <Tooltip key={war.id} content={
                        <div className="text-xs">
                          <div className="font-bold text-[var(--color-text)] mb-1">vs {enemy?.name ?? '???'}</div>
                          <div>战分：<span className={myScore > 0 ? 'text-[var(--color-accent-green)]' : myScore < 0 ? 'text-[var(--color-accent-red)]' : ''}>{myScore > 0 ? '+' : ''}{myScore}</span></div>
                          <div>{roleLabel} · {cbName}</div>
                        </div>
                      }>
                        <button
                          className="px-1.5 py-0.5 text-[11px] rounded cursor-pointer transition-colors hover:brightness-125"
                          style={{
                            background: 'rgba(168,69,53,0.15)',
                            border: '1px solid rgba(168,69,53,0.4)',
                            color: 'var(--color-text)',
                          }}
                          onClick={() => onPushCharacter(enemyId)}
                        >
                          <span className="text-[var(--color-accent-red)]">⚔</span>
                          <span className="ml-0.5">{enemy?.name ?? '???'}</span>
                          <span className={`ml-1 font-bold ${myScore > 0 ? 'text-[var(--color-accent-green)]' : myScore < 0 ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-text-muted)]'}`}>
                            {myScore > 0 ? '+' : ''}{myScore}
                          </span>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 外交 */}
        {(activeTruces.length > 0 || activeAlliances.length > 0) && (
          <div className="pb-3 mb-3" style={{ borderBottom: '1px solid rgba(74,62,49,0.3)' }}>
            <div className="flex items-start gap-0">
              <div className="shrink-0 flex flex-col items-center justify-center mr-2 select-none self-stretch">
                <span className="text-xs font-bold text-[var(--color-text)]" style={{ writingMode: 'vertical-rl', letterSpacing: '0.5em' }}>外交</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-1">
                  {activeAlliances.map((al) => (
                    <button
                      key={`al-${al.allyId}`}
                      className="px-1.5 py-0.5 text-[11px] rounded cursor-pointer transition-colors hover:brightness-125"
                      style={{
                        background: 'rgba(184,154,83,0.1)',
                        border: '1px solid rgba(184,154,83,0.3)',
                        color: 'var(--color-text)',
                      }}
                      onClick={() => onPushCharacter(al.allyId)}
                    >
                      <span className="text-[var(--color-accent-gold)]">同盟</span>
                      <span className="ml-0.5">{al.allyName}</span>
                      <span className="text-[var(--color-text-muted)] ml-0.5">至{al.expiryDate}</span>
                    </button>
                  ))}
                  {activeTruces.map((truce) => (
                    <button
                      key={`tr-${truce.opponentId}`}
                      className="px-1.5 py-0.5 text-[11px] rounded cursor-pointer transition-colors hover:brightness-125"
                      style={{
                        background: 'rgba(74,62,49,0.15)',
                        border: '1px solid rgba(74,62,49,0.4)',
                        color: 'var(--color-text)',
                      }}
                      onClick={() => onPushCharacter(truce.opponentId)}
                    >
                      <span className="text-[var(--color-text-muted)]">停战</span>
                      <span className="ml-0.5">{truce.opponentName}</span>
                      <span className="text-[var(--color-text-muted)] ml-0.5">至{truce.expiryDate}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default CharacterInfoSections;
