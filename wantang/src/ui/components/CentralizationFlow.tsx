import React, { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import {
  executeTaxChange,
  executeToggleType,
  executeToggleSuccession,
  executeToggleAppointRight,
  executeDeclareWar,
} from '@engine/interaction';
import { positionMap } from '@data/positions';
import { hasAuthorityOverPost, isCapitalZhouOfDao } from '@engine/npc/policyCalc';
import { calcPolicyAcceptChance } from '@engine/official/policyRebelCalc';
import { calcPersonality } from '@engine/character/personalityUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { useTurnManager } from '@engine/TurnManager';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { random } from '@engine/random';

import type { Post } from '@engine/territory/types';

const TAX_LEVEL_LABELS: Record<number, string> = { 1: '放任', 2: '一般', 3: '严控', 4: '压榨' };

type ConfirmAction =
  | { kind: 'grantAppointRight'; postId: string; label: string }
  | { kind: 'revokeAppointRight'; postId: string; label: string; chance: number }
  | { kind: 'toClan'; postId: string; label: string }
  | { kind: 'toBureaucratic'; postId: string; label: string; chance: number };

interface CentralizationFlowProps {
  targetId: string;
  onClose: () => void;
}

const CentralizationFlow: React.FC<CentralizationFlowProps> = ({ targetId, onClose }) => {
  const target = useCharacterStore((s) => s.characters.get(targetId));
  const playerId = useCharacterStore((s) => s.playerId);
  const playerChar = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const territories = useTerritoryStore((s) => s.territories);
  const policyCache = useTerritoryStore((s) => s.policyOpinionCache);
  const expectedLeg = useTerritoryStore((s) => s.expectedLegitimacy);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!target) { onClose(); return null; }

  const currentLevel = target.centralization ?? 2;

  // ── 查找 target 持有的 grantsControl 岗位 ──
  const controlPosts: Array<{
    post: Post;
    territoryId: string;
    territoryName: string;
    tier: string;
    capitalZhouId?: string;
  }> = [];
  for (const terr of territories.values()) {
    for (const post of terr.posts) {
      if (post.holderId !== targetId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      if (isCapitalZhouOfDao(terr.id, territories)) continue;
      controlPosts.push({
        post,
        territoryId: terr.id,
        territoryName: terr.name,
        tier: terr.tier,
        capitalZhouId: terr.capitalZhouId,
      });
    }
  }

  function playerCanSetPolicy(territoryId: string): boolean {
    if (!playerId) return false;
    return hasAuthorityOverPost(playerId, territoryId, territories);
  }

  /** 计算臣属对玩家（领主）的好感 */
  function getVassalOpinion(): number {
    if (!playerChar || !target) return 0;
    const bExpLeg = expectedLeg.get(playerChar.id) ?? null;
    const aPol = policyCache.get(target.id) ?? null;
    const bPol = policyCache.get(playerChar.id) ?? null;
    return calculateBaseOpinion(target, playerChar, bExpLeg, aPol, bPol);
  }

  function getMilStrength(charId: string): number {
    const milState = useMilitaryStore.getState();
    let total = 0;
    for (const army of milState.getArmiesByOwner(charId)) {
      total += getArmyStrength(army, milState.battalions);
    }
    return total;
  }

  function getAcceptChance(): number {
    const personality = calcPersonality(target!);
    const opinion = getVassalOpinion();
    const overlordStr = playerId ? getMilStrength(playerId) : 0;
    const vassalStr = getMilStrength(targetId);
    return calcPolicyAcceptChance(opinion, personality, overlordStr, vassalStr).total;
  }

  function handleConfirm() {
    if (!confirm || !playerId) return;

    if (confirm.kind === 'grantAppointRight') {
      executeToggleAppointRight(confirm.postId);
      setConfirm(null);
      return;
    }
    if (confirm.kind === 'toClan') {
      executeToggleSuccession(confirm.postId);
      setConfirm(null);
      return;
    }

    // 削权操作：骰子判定
    const roll = random() * 100;
    const chance = confirm.kind === 'revokeAppointRight' ? confirm.chance : confirm.chance;
    if (roll < chance) {
      if (confirm.kind === 'revokeAppointRight') executeToggleAppointRight(confirm.postId);
      else executeToggleSuccession(confirm.postId);
      setResult({ success: true, message: `${target!.name}接受了变更。` });
    } else {
      // 臣属造反
      const date = useTurnManager.getState().currentDate;
      useCharacterStore.getState().addOpinion(targetId, playerId, {
        reason: confirm.kind === 'revokeAppointRight' ? '强削辟署权' : '强改继承法',
        value: -30,
        decayable: true,
      });
      executeDeclareWar(
        targetId, playerId, 'independence', [],
        date, { prestige: 0, legitimacy: 0 },
      );
      setResult({ success: false, message: `${target!.name}拒绝变更，起兵反叛！` });
    }
    setConfirm(null);
  }

  // ── 结果弹窗 ──
  if (result) {
    return (
      <Modal size="sm" onOverlayClick={() => { setResult(null); }}>
        <ModalHeader title={result.success ? '变更成功' : '臣属反叛'} onClose={() => setResult(null)} />
        <div className="p-4">
          <p className={`text-sm mb-4 ${result.success ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>
            {result.message}
          </p>
          <Button variant="primary" size="sm" onClick={() => setResult(null)}>确定</Button>
        </div>
      </Modal>
    );
  }

  // ── 确认弹窗 ──
  if (confirm) {
    const isRisky = confirm.kind === 'revokeAppointRight' || confirm.kind === 'toBureaucratic';
    const chance = isRisky ? (confirm as { chance: number }).chance : 0;
    return (
      <Modal size="sm" onOverlayClick={() => setConfirm(null)}>
        <ModalHeader title="确认变更" onClose={() => setConfirm(null)} />
        <div className="p-4">
          <p className="text-sm text-[var(--color-text)] mb-3">{confirm.label}</p>
          {isRisky ? (
            <div className="text-xs text-[var(--color-text-muted)] mb-4 space-y-1">
              <p>此操作可能引发臣属反叛，发动独立战争。</p>
              <p>接受概率：<span className={`font-bold ${chance >= 50 ? 'text-[var(--color-accent-green)]' : 'text-[var(--color-accent-red)]'}`}>{chance}%</span></p>
            </div>
          ) : (
            <div className="text-xs text-[var(--color-text-muted)] mb-4">
              <p>{confirm.kind === 'grantAppointRight'
                ? '这将允许臣属自行任免属官，增强其自治权。'
                : '这将允许臣属世袭传承此职位。'}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleConfirm}>确认</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>取消</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal size="md" onOverlayClick={onClose}>
      <ModalHeader title={`调整对 ${target.name} 的权责`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* ===== 赋税等级 ===== */}
          <div className="flex items-center justify-between px-3 py-2 rounded border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">赋税等级</span>
            <div className="flex items-center gap-2">
              <button
                className="w-6 h-6 rounded border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={currentLevel <= 1}
                onClick={() => playerId && executeTaxChange(targetId, playerId, -1)}
              >−</button>
              <span className="text-sm font-bold text-[var(--color-accent-gold)] w-16 text-center">
                {currentLevel}级 {TAX_LEVEL_LABELS[currentLevel] ?? ''}
              </span>
              <button
                className="w-6 h-6 rounded border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-accent-gold)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={currentLevel >= 4}
                onClick={() => playerId && executeTaxChange(targetId, playerId, 1)}
              >+</button>
            </div>
          </div>

          {/* ===== 岗位设置（职类 + 继承法 + 辟署权） ===== */}
          {controlPosts.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] mb-1.5">岗位设置</h4>
              <div className="space-y-1.5">
                {controlPosts.map((entry) => {
                  const tpl = positionMap.get(entry.post.templateId);
                  const isMilitary = tpl?.territoryType === 'military';
                  const canToggleType = isMilitary
                    ? !!({ 'pos-jiedushi': true, 'pos-fangyu-shi': true } as Record<string, boolean>)[entry.post.templateId]
                    : !!({ 'pos-guancha-shi': true, 'pos-cishi': true } as Record<string, boolean>)[entry.post.templateId];
                  const isClan = entry.post.successionLaw === 'clan';
                  const canSetPolicy = entry.post.territoryId
                    ? playerCanSetPolicy(entry.post.territoryId)
                    : false;

                  return (
                    <div
                      key={entry.post.id}
                      className="px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
                    >
                      {/* 岗位名称 */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[var(--color-text)]">{entry.territoryName}</span>
                          <span className="text-xs text-[var(--color-text-muted)] ml-1.5">{tpl?.name ?? ''}</span>
                        </div>
                      </div>
                      {/* 按钮行 */}
                      <div className="flex flex-wrap gap-1.5">
                        {/* 职类 */}
                        {canToggleType && canSetPolicy && (
                          <button
                            onClick={() => executeToggleType(entry.post.id)}
                            className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                              isMilitary
                                ? 'border-blue-400/50 text-blue-400 hover:bg-blue-400/10'
                                : 'border-red-400/50 text-red-400 hover:bg-red-400/10'
                            }`}
                          >
                            转为{isMilitary ? '民政' : '军事'}
                          </button>
                        )}
                        {/* 继承法 */}
                        {canSetPolicy && <button
                          onClick={() => {
                            if (isClan) {
                              // 世袭→流官：削权，需骰子
                              setConfirm({ kind: 'toBureaucratic', postId: entry.post.id, label: `将${entry.territoryName}${tpl?.name ?? ''}的继承法由世袭改为流官？`, chance: getAcceptChance() });
                            } else {
                              // 流官→世袭：授权，纯确认
                              setConfirm({ kind: 'toClan', postId: entry.post.id, label: `将${entry.territoryName}${tpl?.name ?? ''}的继承法由流官改为世袭？` });
                            }
                          }}
                          className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                            isClan
                              ? 'border-amber-400/50 text-amber-400 hover:bg-amber-400/10'
                              : 'border-cyan-400/50 text-cyan-400 hover:bg-cyan-400/10'
                          }`}
                        >
                          {isClan ? '世袭 → 流官' : '流官 → 世袭'}
                        </button>}
                        {/* 辟署权 */}
                        {canSetPolicy && (
                          <button
                            onClick={() => {
                              if (entry.post.hasAppointRight) {
                                // 收回辟署权：削权，需骰子
                                setConfirm({ kind: 'revokeAppointRight', postId: entry.post.id, label: `收回${target.name}在${entry.territoryName}${tpl?.name ?? ''}的辟署权？`, chance: getAcceptChance() });
                              } else {
                                // 授予辟署权：授权，纯确认
                                setConfirm({ kind: 'grantAppointRight', postId: entry.post.id, label: `授予${target.name}在${entry.territoryName}${tpl?.name ?? ''}的辟署权？` });
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                              entry.post.hasAppointRight
                                ? 'border-purple-400/50 text-purple-400 hover:bg-purple-400/10'
                                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-purple-400 hover:border-purple-400/50'
                            }`}
                          >
                            {entry.post.hasAppointRight ? '收回辟署权' : '授予辟署权'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
      </div>
    </Modal>
  );
};

export default CentralizationFlow;
