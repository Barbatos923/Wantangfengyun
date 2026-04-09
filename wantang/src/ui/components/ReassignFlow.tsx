// ===== 外放内调流程：京官 ↔ 有地臣属 =====

import { useState, useMemo } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { findEmperorId } from '@engine/official/postQueries';
import {
  isCentralOfficial,
  getTerritorialCandidates,
  getCentralCandidates,
  previewReassignChance,
  executeReassign,
  submitReassignProposal,
} from '@engine/interaction';
import type { ReassignCandidate } from '@engine/interaction';
import { positionMap } from '@data/positions';

interface ReassignFlowProps {
  targetId: string;
  onClose: () => void;
}

type FlowState = 'select' | 'preview' | 'result';

export default function ReassignFlow({ targetId, onClose }: ReassignFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const centralPosts = useTerritoryStore((s) => s.centralPosts);
  const target = characters.get(targetId);

  const [state, setState] = useState<FlowState>('select');
  const [selected, setSelected] = useState<ReassignCandidate | null>(null);
  // result: 'success'=调任成功, 'rebel'=有地者抗命, 'reject'=皇帝驳回, 'stale'=瞬时校验失败, null=未执行
  const [result, setResult] = useState<'success' | 'rebel' | 'reject' | 'stale' | null>(null);
  // 执行前锁定有地者名字（执行后角色状态变化会导致方向判断翻转）
  const [lockedTerritorialName, setLockedTerritorialName] = useState<string | null>(null);

  // 注：early-return 必须在所有 Hook 之后，否则 target 在生命周期内"有→无"切换会触发
  // React Hook 数量不一致报错。下方计算/useMemo 都允许 target 为空，最后再统一 return null。
  const emperorId = findEmperorId(territories, centralPosts);
  const isEmperor = playerId === emperorId;
  const isChancellor = centralPosts.some(p => p.templateId === 'pos-zaixiang' && p.holderId === playerId);

  // 判断 target 方向
  const targetIsCentral = isCentralOfficial(targetId, territories, centralPosts);

  // 获取候选人
  const candidates = useMemo(() => {
    if (!target) return [] as ReassignCandidate[];
    if (targetIsCentral) {
      // target 是京官 → 展示有地臣属
      return getTerritorialCandidates(targetId, characters, territories, centralPosts);
    } else {
      // target 是有地者 → 展示京官
      const terrStore = useTerritoryStore.getState();
      const posts = terrStore.getPostsByHolder(targetId);
      for (const p of posts) {
        const tpl = positionMap.get(p.templateId);
        if (tpl?.grantsControl && p.territoryId) {
          return getCentralCandidates(p, characters, territories, centralPosts);
        }
      }
      return [];
    }
  }, [target, targetId, targetIsCentral, characters, territories, centralPosts]);

  if (!playerId || !target) return null;
  if (candidates.length === 0) return null;

  // 计算成功率（有地者拒绝概率）
  function getChance(candidate: ReassignCandidate): number {
    if (!emperorId) return 50;
    if (targetIsCentral) {
      // target 是京官，candidate 是有地者 → 有地者可能拒绝
      return previewReassignChance(emperorId, candidate.character.id);
    } else {
      // target 是有地者 → target 可能拒绝
      return previewReassignChance(emperorId, targetId);
    }
  }

  function handleSelect(candidate: ReassignCandidate) {
    setSelected(candidate);
    setState('preview');
  }

  function handleConfirm() {
    if (!selected || !emperorId) return;

    // 确定谁是有地者、谁是京官
    let territorialPostId: string;
    let replacementId: string;
    let expectedTerritorialId: string;

    if (targetIsCentral) {
      // target=京官, selected=有地者
      territorialPostId = selected.post.id;
      replacementId = targetId;
      expectedTerritorialId = selected.character.id;
    } else {
      // target=有地者, selected=京官
      const terrStore = useTerritoryStore.getState();
      const posts = terrStore.getPostsByHolder(targetId);
      const controlPost = posts.find(p => positionMap.get(p.templateId)?.grantsControl);
      if (!controlPost) return;
      territorialPostId = controlPost.id;
      replacementId = selected.character.id;
      expectedTerritorialId = targetId;
    }

    if (isChancellor && !isEmperor) {
      // 宰相提案 → engine 层处理（NPC 皇帝评估或玩家皇帝 StoryEvent）
      const tName = targetIsCentral ? selected.character.name : target?.name ?? '?';
      setLockedTerritorialName(tName);
      const pr = submitReassignProposal(territorialPostId, replacementId, emperorId, playerId!);
      if (pr.type === 'async') {
        onClose(); // 玩家皇帝异步审批
        return;
      }
      if (pr.type === 'emperor-reject') setResult('reject');
      else if (pr.type === 'rebel') setResult('rebel');
      else setResult('success');
      setState('result');
      return;
    }

    // 锁定有地者名字（执行后状态变化会导致方向判断翻转）
    const tName = targetIsCentral ? selected.character.name : target?.name ?? '?';
    setLockedTerritorialName(tName);

    // 皇帝直接执行
    const r = executeReassign(territorialPostId, replacementId, emperorId, expectedTerritorialId);
    setResult(r === 'success' ? 'success' : r === 'rebel' ? 'rebel' : 'stale');
    setState('result');
  }

  // ── 渲染 ──

  const chance = selected ? getChance(selected) : null;
  const chanceColor = chance !== null
    ? chance >= 70 ? 'var(--color-success, #22c55e)'
    : chance >= 40 ? 'var(--color-warning, #eab308)'
    : 'var(--color-danger, #ef4444)'
    : undefined;

  // 结果弹窗
  if (state === 'result' && result !== null) {
    const territorialName = lockedTerritorialName ?? '?';
    let resultText: string;
    let resultColor: string;

    if (result === 'reject') {
      resultText = `皇帝驳回了调任提案，认为时机不当。`;
      resultColor = 'var(--color-warning, #eab308)';
    } else if (result === 'success') {
      resultText = `调任成功！${territorialName}已交出领地入京。`;
      resultColor = 'var(--color-success, #22c55e)';
    } else if (result === 'rebel') {
      resultText = `调任失败！${territorialName}不服从调令，发动了独立战争！`;
      resultColor = 'var(--color-danger, #ef4444)';
    } else {
      // stale
      resultText = `局势已发生变化，调任未生效。`;
      resultColor = 'var(--color-danger, #ef4444)';
    }

    return (
      <Modal size="sm" onOverlayClick={onClose}>
        <ModalHeader title="调任结果" onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm" style={{ color: resultColor }}>{resultText}</p>
          <div className="flex justify-end">
            <Button variant="default" onClick={onClose}>确定</Button>
          </div>
        </div>
      </Modal>
    );
  }

  // 预览确认弹窗
  if (state === 'preview' && selected) {
    const centralLabel = targetIsCentral
      ? getCentralLabel(targetId)
      : selected.label;
    const territorialLabel = targetIsCentral
      ? selected.label
      : getTerritorialLabel(targetId);
    const centralName = targetIsCentral ? target.name : selected.character.name;
    const territorialName = targetIsCentral ? selected.character.name : target.name;

    return (
      <Modal size="sm" onOverlayClick={() => setState('select')}>
        <ModalHeader title="确认调任" onClose={() => setState('select')} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="text-sm space-y-1">
            <p>
              <span className="font-bold text-[var(--color-text)]">{centralName}</span>
              <span className="text-[var(--color-text-muted)]">（{centralLabel}）</span>
              <span className="text-[var(--color-gold)] mx-1">&rarr;</span>
              <span className="text-[var(--color-text)]">{territorialLabel}</span>
            </p>
            <p>
              <span className="font-bold text-[var(--color-text)]">{territorialName}</span>
              <span className="text-[var(--color-text-muted)]">（{territorialLabel}）</span>
              <span className="text-[var(--color-gold)] mx-1">&rarr;</span>
              <span className="text-[var(--color-text)]">{centralLabel}</span>
            </p>
          </div>

          {chance !== null && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--color-text-muted)]">
                {isChancellor && !isEmperor ? '有地者抗命概率：' : '成功率：'}
              </span>
              <span className="font-bold" style={{ color: chanceColor }}>{chance}%</span>
            </div>
          )}

          {isChancellor && !isEmperor && chance !== null && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--color-text-muted)]">皇帝批准概率：</span>
              <span className="font-bold" style={{ color: chanceColor }}>{chance}%</span>
            </div>
          )}

          <p className="text-xs text-[var(--color-text-muted)]">
            {isChancellor && !isEmperor
              ? `皇帝批准后，${territorialName}仍可能抗命发动独立战争。`
              : `失败时，${territorialName}将发动独立战争。`
            }
          </p>
          <p className="text-xs text-[var(--color-gold)]">无好感变化</p>

          <div className="flex justify-end gap-2">
            <Button variant="default" onClick={() => setState('select')}>返回</Button>
            <Button
              variant={isChancellor && !isEmperor ? 'primary' : 'danger'}
              onClick={handleConfirm}
            >
              {isChancellor && !isEmperor ? '提交提案' : '确认调任'}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // 候选人选择列表
  return (
    <Modal size="md" onOverlayClick={onClose}>
      <ModalHeader
        title={`外放内调 — ${target.name}`}
        onClose={onClose}
      />
      <div className="px-5 py-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
        <p className="text-sm text-[var(--color-text-muted)] mb-1">
          {targetIsCentral
            ? `选择要内调入京的有地臣属（${target.name}将外放赴任）：`
            : `选择要外放赴任的京官（${target.name}将内调入京）：`
          }
        </p>
        {candidates.map((c) => {
          const ch = getChance(c);
          const color = ch >= 70 ? 'var(--color-success, #22c55e)'
            : ch >= 40 ? 'var(--color-warning, #eab308)'
            : 'var(--color-danger, #ef4444)';
          const tpl = positionMap.get(c.post.templateId);
          const isMilitary = tpl?.territoryType === 'military';
          const ability = isMilitary ? c.character.abilities.military : c.character.abilities.administration;
          const abilityLabel = isMilitary ? '武' : '政';

          return (
            <div
              key={c.character.id}
              className="flex items-center justify-between rounded px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-gold)]/50 transition-colors"
              onClick={() => handleSelect(c)}
            >
              <div className="min-w-0">
                <span className="text-sm font-bold text-[var(--color-text)]">{c.character.name}</span>
                <span className="text-xs text-[var(--color-text-muted)] ml-2">{c.label}</span>
                <span className="text-xs text-[var(--color-text-muted)] ml-2">
                  {abilityLabel}{Math.round(ability)} 贤能{Math.round(c.character.official?.virtue ?? 0)}
                </span>
              </div>
              <span className="text-xs font-bold ml-3 shrink-0" style={{ color }}>
                {ch}%
              </span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ── 辅助 ────────────────────────────────────────────

function getCentralLabel(charId: string): string {
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(charId);
  for (const p of posts) {
    const tpl = positionMap.get(p.templateId);
    if (tpl?.scope === 'central') return tpl.name;
  }
  return '京官';
}

function getTerritorialLabel(charId: string): string {
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(charId);
  for (const p of posts) {
    const tpl = positionMap.get(p.templateId);
    if (tpl?.grantsControl && p.territoryId) {
      const terr = terrStore.territories.get(p.territoryId);
      return `${terr?.name ?? ''}${tpl.name}`;
    }
  }
  return '地方官';
}

