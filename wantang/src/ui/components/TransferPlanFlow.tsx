// ===== 调动名单审批弹窗（支持逐条调整） =====

import { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useNpcStore } from '@engine/npc/NpcStore';
import { executeTransferPlan } from '@engine/npc/NpcEngine';
import { positionMap } from '@data/positions';
import { getHeldPosts } from '@engine/official/officialUtils';
import {
  generateCandidates,
  resolveAppointAuthority,
  resolveLegalAppointer,
} from '@engine/official/selectionUtils';
import type { CandidateEntry, CandidateTier } from '@engine/official/selectionUtils';
import type { TransferEntry } from '@engine/npc/types';

interface TransferPlanFlowProps {
  onClose: () => void;
}

const TIER_LABEL: Record<CandidateTier, string> = {
  promote: '升调',
  transfer: '平调',
  fresh: '新授',
};

const TIER_CLASS: Record<CandidateTier, string> = {
  promote: 'bg-green-900/40 text-green-400 border border-green-700/60',
  transfer: 'bg-blue-900/40 text-blue-400 border border-blue-700/60',
  fresh: 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)]',
};

export default function TransferPlanFlow({ onClose }: TransferPlanFlowProps) {
  const task = useNpcStore((s) => s.playerTasks.find(t => t.type === 'appoint-approve') ?? null);
  const plan = task ? (task.data as import('@engine/npc/types').TransferPlan) : null;
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const centralPosts = useTerritoryStore((s) => s.centralPosts);

  // 可编辑的 entries 副本
  const [entries, setEntries] = useState<TransferEntry[]>(() => plan?.entries ?? []);
  // 当前展开调整的 entry index
  const [adjustingIdx, setAdjustingIdx] = useState<number | null>(null);
  // 已被玩家修改过的 index 集合
  const [modifiedSet, setModifiedSet] = useState<Set<number>>(new Set());

  if (!plan || entries.length === 0) return null;

  function getProposerLabel(proposedBy: string): string {
    const cp = centralPosts.find(p => p.holderId === proposedBy);
    if (cp) {
      const tpl = positionMap.get(cp.templateId);
      if (tpl) return `${characters.get(proposedBy)?.name ?? '?'}（${tpl.name}）`;
    }
    return characters.get(proposedBy)?.name ?? proposedBy;
  }

  function getPostLabel(postId: string): string {
    const terrStore = useTerritoryStore.getState();
    const post = terrStore.findPost(postId);
    if (!post) return postId;
    const tpl = positionMap.get(post.templateId);
    if (!tpl) return postId;
    const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
    return terrName ? `${terrName}${tpl.name}` : tpl.name;
  }

  function getCharName(charId: string): string {
    return characters.get(charId)?.name ?? charId;
  }

  function getCurrentPostLabel(charId: string): string {
    const posts = getHeldPosts(charId);
    if (posts.length === 0) return '';
    return posts.map(p => {
      const tpl = positionMap.get(p.templateId);
      if (!tpl) return '';
      const terrName = p.territoryId ? territories.get(p.territoryId)?.name : undefined;
      return terrName ? `${terrName}${tpl.name}` : tpl.name;
    }).filter(Boolean).join('、');
  }

  /**
   * 生成候选人池，考虑名单中的规划状态：
   * - 排除已在其他条目中被占用的角色
   * - 加入被释放的角色（原方案中有、当前名单中没有的）
   */
  function getCandidatesForEntry(entryIdx: number): CandidateEntry[] {
    const entry = entries[entryIdx];
    const terrStore = useTerritoryStore.getState();
    const post = terrStore.findPost(entry.postId);
    if (!post) return [];
    const executorId = resolveAppointAuthority(post);
    if (!executorId) return [];
    const legalId = resolveLegalAppointer(executorId, post);

    // 基础候选人池
    const baseCandidates = generateCandidates(post, legalId);

    // 其他条目占用的角色（排除当前条目自身的被任命者）
    const usedByOthers = new Set<string>();
    entries.forEach((e, i) => {
      if (i !== entryIdx) usedByOthers.add(e.appointeeId);
    });

    // 被释放的角色：原方案中存在但当前名单中不再作为候选人的角色
    const currentAppointees = new Set(entries.map(e => e.appointeeId));
    const originalAppointees = new Set((plan?.entries ?? []).map(e => e.appointeeId));
    const freedCharIds = new Set<string>();
    for (const id of originalAppointees) {
      if (!currentAppointees.has(id)) freedCharIds.add(id);
    }

    // 过滤：排除被其他条目占用的
    let result = baseCandidates.filter(c => !usedByOthers.has(c.character.id));

    // 补入被释放的角色（如果不在基础池中）
    const resultIds = new Set(result.map(c => c.character.id));
    for (const freedId of freedCharIds) {
      if (resultIds.has(freedId) || usedByOthers.has(freedId)) continue;
      const char = characters.get(freedId);
      if (!char || !char.alive || !char.official) continue;
      // 作为"新授"加入（因为他们在规划中已从原岗位释放）
      result.push({
        character: char,
        tier: 'fresh',
        score: Math.round(char.official.virtue * 0.4 + char.abilities.administration * 0.2),
        underRank: char.official.rankLevel < (positionMap.get(post.templateId)?.minRank ?? 0) || undefined,
      });
    }

    // 重新按分数排序
    result.sort((a, b) => b.score - a.score);
    return result;
  }

  function handleSelectCandidate(entryIdx: number, candidate: CandidateEntry) {
    const oldEntry = entries[entryIdx];
    const newEntry: TransferEntry = {
      ...oldEntry,
      appointeeId: candidate.character.id,
      vacateOldPost: candidate.tier === 'promote' || candidate.tier === 'transfer',
    };

    const newEntries = [...entries];
    newEntries[entryIdx] = newEntry;

    // 如果新选的人是升调/平调，需要为其腾出的旧岗自动补位（NPC推荐新授）
    if (newEntry.vacateOldPost) {
      const candidateOldPosts = getHeldPosts(candidate.character.id);
      // 已经在名单中的岗位 ID
      const usedPostIds = new Set(newEntries.map(e => e.postId));
      // 已经在名单中的候选人 ID
      const usedCharIds = new Set(newEntries.map(e => e.appointeeId));

      for (const oldPost of candidateOldPosts) {
        if (usedPostIds.has(oldPost.id)) continue;
        // 为这个空出的岗位找一个新授候选人
        const executor = resolveAppointAuthority(oldPost);
        if (!executor) continue;
        const legal = resolveLegalAppointer(executor, oldPost);
        const candidates = generateCandidates(oldPost, legal);
        // 优先新授，避免连锁
        const freshPick = candidates.find(c => !usedCharIds.has(c.character.id) && !c.underRank && c.tier === 'fresh');
        const pick = freshPick ?? candidates.find(c => !usedCharIds.has(c.character.id) && !c.underRank);
        if (pick) {
          newEntries.push({
            postId: oldPost.id,
            appointeeId: pick.character.id,
            legalAppointerId: legal,
            vacateOldPost: pick.tier === 'promote' || pick.tier === 'transfer',
            proposedBy: oldEntry.proposedBy,
          });
          usedPostIds.add(oldPost.id);
          usedCharIds.add(pick.character.id);
        }
      }
    }

    setEntries(newEntries);
    setModifiedSet(prev => new Set(prev).add(entryIdx));
    setAdjustingIdx(null);
  }

  function handleApprove() {
    executeTransferPlan({ entries, date: plan!.date });
    if (task) useNpcStore.getState().removePlayerTask(task.id);
    onClose();
  }

  // 按经办人分组，保留 entry 的全局 index
  const groups: { proposerId: string; items: { entry: TransferEntry; globalIdx: number }[] }[] = [];
  const groupMap = new Map<string, typeof groups[0]>();
  entries.forEach((entry, idx) => {
    let group = groupMap.get(entry.proposedBy);
    if (!group) {
      group = { proposerId: entry.proposedBy, items: [] };
      groupMap.set(entry.proposedBy, group);
      groups.push(group);
    }
    group.items.push({ entry, globalIdx: idx });
  });

  return (
    <Modal size="xl" onOverlayClick={onClose}>
      <ModalHeader title={`官员调动名单 — ${plan.date.year}年${plan.date.month}月`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-3">
          {groups.map(({ proposerId, items }) => (
            <div key={proposerId}>
              <div className="text-xs text-[var(--color-text-muted)] mb-1.5">
                {getProposerLabel(proposerId)} 呈报：
              </div>
              <div className="flex flex-col gap-1">
                {items.map(({ entry, globalIdx }) => (
                  <div key={`${entry.postId}-${globalIdx}`} className="shrink-0">
                    {/* entry 主行 */}
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded border bg-[var(--color-bg)] ${
                        modifiedSet.has(globalIdx)
                          ? 'border-[var(--color-accent-gold)]/60'
                          : 'border-[var(--color-border)]'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-[var(--color-text)]">
                          {getCharName(entry.appointeeId)}
                        </span>
                        {(() => {
                          const cur = getCurrentPostLabel(entry.appointeeId);
                          return cur
                            ? <span className="text-xs text-[var(--color-text-muted)] ml-1">（{cur}）</span>
                            : null;
                        })()}
                        <span className="text-xs text-[var(--color-text-muted)] mx-1">&rarr;</span>
                        <span className="text-sm text-[var(--color-text)]">
                          {getPostLabel(entry.postId)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {entry.vacateOldPost && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-700/60">
                            调任
                          </span>
                        )}
                        {modifiedSet.has(globalIdx) && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-accent-gold)]/20 text-[var(--color-accent-gold)] border border-[var(--color-accent-gold)]/40">
                            已调整
                          </span>
                        )}
                        <button
                          onClick={() => setAdjustingIdx(adjustingIdx === globalIdx ? null : globalIdx)}
                          className="text-xs px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-accent-gold)]/60 transition-colors"
                        >
                          {adjustingIdx === globalIdx ? '收起' : '调整'}
                        </button>
                      </div>
                    </div>

                    {/* 展开的候选人池 */}
                    {adjustingIdx === globalIdx && (
                      <CandidatePool
                        entry={entry}
                        candidates={getCandidatesForEntry(globalIdx)}
                        territories={territories}
                        onSelect={(c) => handleSelectCandidate(globalIdx, c)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

      <div className="px-5 py-3 border-t border-[var(--color-border)] shrink-0 flex gap-2">
        <Button variant="default" className="flex-1 py-2" onClick={onClose}>留中不发</Button>
        <Button variant="primary" className="flex-1 py-2 font-bold" onClick={handleApprove}>
          批准（{entries.length}项）
        </Button>
      </div>
    </Modal>
  );
}

// ── 候选人池子组件 ────────────────────────────────────────────────────────────

function CandidatePool({
  entry,
  candidates,
  territories,
  onSelect,
}: {
  entry: TransferEntry;
  candidates: CandidateEntry[];
  territories: Map<string, import('@engine/territory/types').Territory>;
  onSelect: (c: CandidateEntry) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="px-3 py-2 border border-t-0 border-[var(--color-border)] rounded-b bg-[var(--color-bg)] text-xs text-[var(--color-text-muted)] text-center">
        暂无合适人选
      </div>
    );
  }

  return (
    <div className="border border-t-0 border-[var(--color-border)] rounded-b bg-[var(--color-bg)] px-3 py-2 flex flex-col gap-1 max-h-[30vh] overflow-y-auto">
      {candidates.map(c => {
        const isCurrent = c.character.id === entry.appointeeId;
        let currentPostLabel: string | null = null;
        if (c.currentPost) {
          const cpTpl = positionMap.get(c.currentPost.templateId);
          const cpTerrName = c.currentPost.territoryId ? territories.get(c.currentPost.territoryId)?.name : undefined;
          currentPostLabel = cpTerrName && cpTpl ? `${cpTerrName}${cpTpl.name}` : cpTpl?.name ?? null;
        }
        return (
          <button
            key={c.character.id}
            onClick={() => !isCurrent && onSelect(c)}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded border text-left transition-colors ${
              isCurrent
                ? 'border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/5'
                : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)]/60'
            }`}
          >
            <div className="min-w-0">
              <span className="text-xs text-[var(--color-text)]">{c.character.name}</span>
              {currentPostLabel && (
                <span className="text-xs text-[var(--color-text-muted)] ml-1">（{currentPostLabel}）</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {c.underRank && (
                <span className="text-xs px-1 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-700/60">
                  品位不足
                </span>
              )}
              <span className={`text-xs px-1 py-0.5 rounded ${TIER_CLASS[c.tier]}`}>
                {TIER_LABEL[c.tier]}
              </span>
              <span className="text-xs text-[var(--color-text-muted)] w-8 text-right">{c.score}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
