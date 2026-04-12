// ===== 人物面板 Shell（三段布局 + 交互弹窗调度） =====

import React, { useState, useMemo } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import type { Character } from '@engine/character/types';
import { usePanelStore } from '@ui/stores/panelStore';
import OpinionPopup from './OpinionPopup';
import { getActualController } from '@engine/official/officialUtils';
import { useWarStore } from '@engine/military/WarStore';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
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
import SchemeInitFlow from './SchemeInitFlow';
import { executeDemandFealty, previewDemandFealty, previewPledgeAllegiance, executePledgeAllegiance, getJoinableWars, executeJoinWar, getCallableWars, calcCallToArmsChance, executeCallToArms, previewNegotiateTax, executeNegotiateTax, TAX_LABELS, previewProposeAlliance, executeProposeAlliance, executeBreakAlliance } from '@engine/interaction';
import type { DemandFealtyResult, FealtyChanceResult, PledgeAllegianceChanceResult, PledgeAllegianceResult, JoinableWar, CallableWar, CallToArmsChanceResult, CallToArmsResult, NegotiateTaxChanceResult, NegotiateTaxResult, ProposeAllianceChanceResult, ProposeAllianceResult } from '@engine/interaction';
import { CASUS_BELLI_NAMES } from '@engine/military/types';
import CharacterHeader from './CharacterHeader';
import CharacterInfoSections from './CharacterInfoSections';
import CharacterTabs, { type TabKey } from './CharacterTabs';

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
  const [taxNegDelta, setTaxNegDelta] = useState<number | null>(null);
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
  const { pushCharacter, openTerritoryModal } = usePanelStore();

  // Active wars
  const wars = useWarStore((s) => s.wars);
  const activeWars = useMemo(
    () => [...wars.values()].filter(w => w.status === 'active' && isWarParticipant(characterId, w)),
    [wars, characterId],
  );

  // Truces
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

  // Alliances
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

  const controlledTerritories = Array.from(territories.values()).filter((t) => getActualController(t) === characterId);

  return (
    <div className="flex flex-col h-full">
      {/* ── 头部身份区（含功能键） ── */}
      <CharacterHeader
        character={character}
        characterId={characterId}
        playerId={playerId}
        playerChar={playerChar}
        territories={territories}
        expectedLegitimacy={expectedLegitimacy}
        policyCache={policyCache}
        onPushCharacter={pushCharacter}
        onShowInteractionMenu={() => setShowInteractionMenu(true)}
      />

      {/* ── 中段信息区 ── */}
      <CharacterInfoSections
        character={character}
        characterId={characterId}
        territories={territories}
        characters={characters}
        controlledTerritories={controlledTerritories}
        activeWars={activeWars}
        activeTruces={activeTruces}
        activeAlliances={activeAlliances}
        onPushCharacter={pushCharacter}
        onOpenTerritoryModal={openTerritoryModal}
      />

      {/* ── 底部标签区 ── */}
      <CharacterTabs
        character={character}
        characters={characters}
        playerChar={playerChar}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onPushCharacter={pushCharacter}
        onShowOpinion={(from, toward) => setOpinionPopup({ from, toward })}
        expectedLegitimacy={expectedLegitimacy}
        policyCache={policyCache}
      />

      {/* ── 弹窗层 ── */}
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

      {activeInteraction === 'appoint' && <AppointFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}
      {activeInteraction === 'dismiss' && <DismissFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}
      {activeInteraction === 'centralization' && <CentralizationFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}
      {activeInteraction === 'declareWar' && <DeclareWarFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}
      {activeInteraction === 'transferVassal' && <TransferVassalFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}
      {activeInteraction === 'revoke' && <RevokeFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}
      {activeInteraction === 'usurpPost' && <UsurpPostFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}
      {activeInteraction === 'reassign' && <ReassignFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}
      {activeInteraction === 'demandRights' && <DemandRightsFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}
      {activeInteraction === 'scheme' && <SchemeInitFlow targetId={characterId} onClose={() => setActiveInteraction(null)} />}

      {activeInteraction === 'negotiateTax' && !taxNegResult && (() => {
        const currentLevel = playerChar?.centralization ?? 2;
        const canDown = currentLevel > 1;
        const canUp = currentLevel < 4;

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

export default CharacterPanel;
