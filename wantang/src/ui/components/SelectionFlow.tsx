import { useState, useMemo } from 'react';
import { Modal, ModalHeader, Button } from './base';
import type { Post } from '@engine/territory/types';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import { executeAppoint } from '@engine/interaction';
import {
  generateCandidates,
  resolveAppointAuthority,
  resolveLegalAppointer,
  getEffectiveMinRank,
  getPendingVacancies,
  HONORARY_TEMPLATES,
} from '@engine/official/selectionUtils';
import type { CandidateEntry, CandidateTier } from '@engine/official/selectionUtils';
import { positionMap } from '@data/positions';
import { rankMap } from '@data/ranks';
import { useNpcStore } from '@engine/npc/NpcStore';
import type { TransferEntry } from '@engine/npc/types';
import {
  getTransferableChildren,
  autoTransferChildrenAfterAppoint,
} from '@engine/official/postTransfer';
import type { TransferableChild } from '@engine/official/postTransfer';
import TransferChildrenFlow from './TransferChildrenFlow';

interface SelectionFlowProps {
  vacantPosts: Post[];
  onClose: () => void;
  /** 特旨模式：连锁扫描时不限于 playerId 有权的岗位 */
  specialDecree?: boolean;
  /** 草稿模式：确认后写入 draftPlan 而非立即执行 */
  draft?: boolean;
}

/** 构建岗位显示名称 */
function buildPostLabel(post: Post, territories: Map<string, import('@engine/territory/types').Territory>): string {
  const tpl = positionMap.get(post.templateId);
  if (!tpl) return post.id;
  const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
  return terrName ? `${terrName}${tpl.name}` : tpl.name;
}

/** tier 的中文标签和颜色样式 */
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

/** 单行候选人条目 */
function CandidateRow({
  entry,
  selected,
  onSelect,
  territories,
}: {
  entry: CandidateEntry;
  selected: boolean;
  onSelect: () => void;
  territories: Map<string, import('@engine/territory/types').Territory>;
}) {
  // 当前岗位标签
  let currentPostLabel: string | null = null;
  if (entry.currentPost) {
    const cpTpl = positionMap.get(entry.currentPost.templateId);
    const cpTerrName = entry.currentPost.territoryId ? territories.get(entry.currentPost.territoryId)?.name : undefined;
    currentPostLabel = cpTerrName && cpTpl ? `${cpTerrName}${cpTpl.name}` : cpTpl?.name ?? null;
  }

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center justify-between px-3 py-2 rounded border text-left transition-colors ${
        selected
          ? 'border-[var(--color-accent-gold)] bg-[var(--color-bg)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-accent-gold)]/60 hover:bg-[var(--color-bg)]'
      }`}
    >
      <div className="min-w-0">
        <span className="text-sm text-[var(--color-text)]">{entry.character.name}</span>
        {currentPostLabel && (
          <span className="text-xs text-[var(--color-text-muted)] ml-1.5">({currentPostLabel})</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {entry.underRank && (
          <span className="text-xs px-1 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-700/60">
            品位不足
          </span>
        )}
        <span className={`text-xs px-1.5 py-0.5 rounded ${TIER_CLASS[entry.tier]}`}>
          {TIER_LABEL[entry.tier]}
        </span>
        <span className="text-xs text-[var(--color-text-muted)] w-8 text-right">{entry.score}</span>
      </div>
    </button>
  );
}

/** 单个空缺岗位的行组件 */
function VacantPostRow({
  post,
  territories,
  selectedId,
  onSelect,
  onConfirm,
  confirmed,
}: {
  post: Post;
  territories: Map<string, import('@engine/territory/types').Territory>;
  selectedId: string | null;
  onSelect: (candidateId: string | null) => void;
  onConfirm: () => void;
  confirmed: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const candidates: CandidateEntry[] = useMemo(() => {
    const executorId = resolveAppointAuthority(post);
    if (!executorId) return [];
    const legalId = resolveLegalAppointer(executorId, post);
    return generateCandidates(post, legalId);
  }, [post]);

  const effectiveRank = getEffectiveMinRank(post);
  const rankDef = rankMap.get(effectiveRank);
  const rankLabel = rankDef?.name ?? `${effectiveRank}品`;
  const postLabel = buildPostLabel(post, territories);

  const selectedEntry = candidates.find(c => c.character.id === selectedId) ?? null;
  const noCandidates = candidates.length === 0;
  const canConfirm = !noCandidates && selectedId !== null;

  if (confirmed) return null;

  return (
    <div className="border border-[var(--color-border)] rounded overflow-hidden shrink-0">
      {/* 主行 */}
      <div className="px-3 py-2 bg-[var(--color-bg-panel)]">
        {/* 第一行：岗位名 + 品级 */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-[var(--color-text)] truncate">{postLabel}</span>
            <span className="text-xs text-[var(--color-text-muted)] shrink-0">{rankLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-accent-gold)]/60 transition-colors"
            >
              {expanded ? '收起' : '展开'}
            </button>
            <button
              disabled={!canConfirm}
              onClick={onConfirm}
              className={`text-xs px-2 py-0.5 rounded border font-bold transition-colors ${
                canConfirm
                  ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold)]/10'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
              }`}
            >
              确认
            </button>
          </div>
        </div>
        {/* 第二行：推荐人 */}
        <div className="flex items-center gap-1.5">
          {noCandidates ? (
            <span className="text-xs text-[var(--color-text-muted)] italic">暂无人选</span>
          ) : selectedEntry ? (
            <>
              <span className="text-xs text-[var(--color-text-muted)]">推荐：</span>
              <span className="text-xs text-[var(--color-text)]">{selectedEntry.character.name}</span>
              <span className={`text-xs px-1 py-0.5 rounded ${TIER_CLASS[selectedEntry.tier]}`}>
                {TIER_LABEL[selectedEntry.tier]}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">{selectedEntry.score}</span>
            </>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">未选择</span>
          )}
        </div>
      </div>

      {/* 展开候选人池 */}
      {expanded && (
        <div className="px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg)] flex flex-col gap-1 max-h-[40vh] overflow-y-auto">
          {noCandidates ? (
            <p className="text-xs text-[var(--color-text-muted)] py-1 text-center">暂无合适人选</p>
          ) : (
            <>
              {/* 按 tier 分组显示 */}
              {(['promote', 'transfer', 'fresh'] as CandidateTier[]).map(tier => {
                const group = candidates.filter(c => c.tier === tier);
                if (group.length === 0) return null;
                return (
                  <div key={tier} className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--color-text-muted)] mt-1">{TIER_LABEL[tier]}</span>
                    {group.map(entry => (
                      <CandidateRow
                        key={entry.character.id}
                        entry={entry}
                        selected={selectedId === entry.character.id}
                        onSelect={() => onSelect(entry.character.id)}
                        territories={territories}
                      />
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 构建默认推荐选择，同时追加连锁空缺岗位。
 * 返回 { selections, allPosts }：allPosts 包含原始空缺 + 连锁追加的岗位。
 */
function buildDefaultSelections(posts: Post[]): { selections: Map<string, string | null>; allPosts: Post[] } {
  const map = new Map<string, string | null>();
  const usedIds = new Set<string>();
  const processedPostIds = new Set<string>();
  const cascadePostIds = new Set<string>();
  // 使用可变队列，处理过程中可追加连锁岗位
  const queue = [...posts];
  const allPosts = [...posts];

  for (let i = 0; i < queue.length && i < 100; i++) { // 上限防无限循环
    const post = queue[i];
    if (processedPostIds.has(post.id)) continue;
    processedPostIds.add(post.id);

    const executorId = resolveAppointAuthority(post);
    if (!executorId) { map.set(post.id, null); continue; }
    const legalId = resolveLegalAppointer(executorId, post);
    const candidates = generateCandidates(post, legalId);

    let pick: CandidateEntry | undefined;
    if (cascadePostIds.has(post.id)) {
      // 连锁空缺：优先新授，避免继续产生连锁
      pick = candidates.find(c => !usedIds.has(c.character.id) && c.tier === 'fresh');
    }
    if (!pick) {
      pick = candidates.find(c => !usedIds.has(c.character.id));
    }

    const pickId = pick?.character.id ?? null;
    map.set(post.id, pickId);
    if (pickId) {
      usedIds.add(pickId);
      // 升调/平调 → 其旧岗追加到队列
      if (pick && (pick.tier === 'promote' || pick.tier === 'transfer') && pick.currentPost) {
        const oldPostId = pick.currentPost.id;
        if (!processedPostIds.has(oldPostId)) {
          cascadePostIds.add(oldPostId);
          const terrStore = useTerritoryStore.getState();
          const oldPost = terrStore.findPost(oldPostId);
          if (oldPost) {
            queue.push(oldPost);
            allPosts.push(oldPost);
          }
        }
      }
    }
  }
  return { selections: map, allPosts };
}

export default function SelectionFlow({ vacantPosts, onClose, specialDecree, draft }: SelectionFlowProps) {
  const territories = useTerritoryStore(s => s.territories);
  const playerId = useCharacterStore(s => s.playerId);

  // 内部管理的岗位列表（初始来自 props + 连锁追加的空缺）
  const [initialResult] = useState(() => buildDefaultSelections(vacantPosts));
  const [currentPosts, setCurrentPosts] = useState<Post[]>(initialResult.allPosts);

  // postId -> 选中的 candidateId
  const [selections, setSelections] = useState<Map<string, string | null>>(initialResult.selections);

  // 已确认的 postId 集合
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  // 法理下级转移弹窗状态
  const [transferState, setTransferState] = useState<{
    newHolderId: string;
    appointerId: string;
    children: TransferableChild[];
    /** 转移弹窗关闭后的回调（用于继续连锁扫描等） */
    onDone: () => void;
  } | null>(null);

  function getCandidatesForPost(post: Post): CandidateEntry[] {
    const executorId = resolveAppointAuthority(post);
    if (!executorId) return [];
    const legalId = resolveLegalAppointer(executorId, post);
    return generateCandidates(post, legalId);
  }

  /**
   * 草稿模式专用：选中升调/平调候选人时，动态追加其原岗位到列表。
   * 直接模式依赖 executeAppoint 后的 rescanVacancies，无需此函数。
   */
  function handleDraftCascade(post: Post, newCandidateId: string) {
    const candidates = getCandidatesForPost(post);
    const entry = candidates.find(c => c.character.id === newCandidateId);
    if (!entry?.currentPost || (entry.tier !== 'promote' && entry.tier !== 'transfer')) return;

    const cascadePost = entry.currentPost;

    setCurrentPosts(prev => {
      if (prev.some(p => p.id === cascadePost.id)) return prev;
      return [...prev, cascadePost];
    });

    setSelections(prev => {
      if (prev.has(cascadePost.id)) return prev;
      const next = new Map(prev);
      const usedIds = new Set([...prev.values()].filter(Boolean) as string[]);
      const cascadeCandidates = getCandidatesForPost(cascadePost);
      // 连锁岗位优先选新授，避免再次产生连锁
      const pick = cascadeCandidates.find(c => c.tier === 'fresh' && !usedIds.has(c.character.id));
      next.set(cascadePost.id, pick?.character.id ?? null);
      return next;
    });
  }

  /** 扫描连锁空缺，有新坑则追加到列表 */
  function rescanVacancies(knownPosts: Post[]) {
    if (!playerId) return;
    // 特旨模式：扫描所有经办人的空缺（皇帝越权操作）
    let newVacancies: Post[];
    if (specialDecree) {
      const terrStore = useTerritoryStore.getState();
      const allVacant: Post[] = [];
      for (const t of terrStore.territories.values()) {
        for (const p of t.posts) {
          if (p.holderId === null && !HONORARY_TEMPLATES.has(p.templateId)) allVacant.push(p);
        }
      }
      for (const p of terrStore.centralPosts) {
        if (p.holderId === null && !HONORARY_TEMPLATES.has(p.templateId)) allVacant.push(p);
      }
      newVacancies = allVacant;
    } else {
      newVacancies = getPendingVacancies(playerId);
    }
    const knownIds = new Set(knownPosts.map(p => p.id));
    const cascaded = newVacancies.filter(p => !knownIds.has(p.id));

    if (cascaded.length > 0) {
      const allPosts = [...knownPosts, ...cascaded];
      setCurrentPosts(allPosts);
      setSelections(prev => {
        const next = new Map(prev);
        // 收集已选中的候选人 ID
        const usedIds = new Set<string>();
        for (const [, cid] of next) {
          if (cid) usedIds.add(cid);
        }
        for (const post of cascaded) {
          const executorId = resolveAppointAuthority(post);
          if (!executorId) { next.set(post.id, null); continue; }
          const legalId = resolveLegalAppointer(executorId, post);
          const candidates = generateCandidates(post, legalId);
          const pick = candidates.find(c => !usedIds.has(c.character.id));
          const pickId = pick?.character.id ?? null;
          next.set(post.id, pickId);
          if (pickId) usedIds.add(pickId);
        }
        return next;
      });
    }
  }

  /** 将选择结果写入 draftPlan（draft 模式） */
  function writeToDraft() {
    const date = useTurnManager.getState().currentDate;
    const draftEntries: TransferEntry[] = [];

    for (const post of currentPosts) {
      const candidateId = selections.get(post.id) ?? null;
      if (!candidateId) continue;

      const executorId = resolveAppointAuthority(post);
      if (!executorId) continue;
      const legalId = resolveLegalAppointer(executorId, post);

      const candidates = getCandidatesForPost(post);
      const entry = candidates.find(c => c.character.id === candidateId);
      const vacateOldPost = entry?.tier === 'promote' || entry?.tier === 'transfer';

      draftEntries.push({
        postId: post.id,
        appointeeId: candidateId,
        legalAppointerId: legalId,
        vacateOldPost,
        proposedBy: playerId!,
      });
    }

    if (draftEntries.length > 0) {
      const npcStore = useNpcStore.getState();
      const existing = npcStore.draftPlan;
      // 合并到已有的 NPC 草稿
      const mergedEntries = [...(existing?.entries ?? []), ...draftEntries];
      npcStore.setDraftPlan({ entries: mergedEntries, date: existing?.date ?? { ...date } });
    }
    onClose();
  }

  function handleConfirmOne(post: Post) {
    if (draft) { writeToDraft(); return; }

    const candidateId = selections.get(post.id) ?? null;
    if (!candidateId) return;

    const executorId = resolveAppointAuthority(post);
    if (!executorId) return;
    const legalId = resolveLegalAppointer(executorId, post);

    const candidates = getCandidatesForPost(post);
    const entry = candidates.find(c => c.character.id === candidateId);
    const vacateOldPost = entry?.tier === 'promote' || entry?.tier === 'transfer';

    // 铨选模式：在 executeAppoint 之前读取前任 holderId（seatPost 后会被覆盖上下文）
    const postTpl = positionMap.get(post.templateId);
    const prevHolderId = (postTpl?.grantsControl && post.territoryId)
      ? (useTerritoryStore.getState().findPost(post.id)?.vacatedHolderId ?? null)
      : null;

    executeAppoint(post.id, candidateId, legalId, vacateOldPost);

    const newConfirmed = new Set(confirmed).add(post.id);
    setConfirmed(newConfirmed);

    // 检查法理下级可选转移
    if (postTpl?.grantsControl && post.territoryId) {
      const children = getTransferableChildren(post.territoryId, candidateId, legalId, true, prevHolderId);
      if (children.length > 0) {
        setTransferState({
          newHolderId: candidateId,
          appointerId: legalId,
          children,
          onDone: () => {
            if (vacateOldPost) rescanVacancies(currentPosts);
          },
        });
        return; // 等待转移弹窗关闭后再继续
      }
    }

    // 升调/平调可能产生新空缺，立即扫描
    if (vacateOldPost) {
      rescanVacancies(currentPosts);
    }
  }

  function handleConfirmAll() {
    if (draft) { writeToDraft(); return; }

    for (const post of currentPosts) {
      if (confirmed.has(post.id)) continue;
      const candidateId = selections.get(post.id) ?? null;
      if (!candidateId) continue;

      const executorId = resolveAppointAuthority(post);
      if (!executorId) continue;
      const legalId = resolveLegalAppointer(executorId, post);

      const candidates = getCandidatesForPost(post);
      const entry = candidates.find(c => c.character.id === candidateId);
      const vacateOldPost = entry?.tier === 'promote' || entry?.tier === 'transfer';

      executeAppoint(post.id, candidateId, legalId, vacateOldPost);
      // 全部确认模式：自动转移法理下级
      autoTransferChildrenAfterAppoint(post.id, legalId, true);
      confirmed.add(post.id);
    }
    setConfirmed(new Set(confirmed));

    // 重新扫描连锁空缺
    if (!playerId) { onClose(); return; }
    const knownIds = new Set(currentPosts.map(p => p.id));

    let newVacancies: Post[];
    if (specialDecree) {
      const terrStore = useTerritoryStore.getState();
      const allVacant: Post[] = [];
      for (const t of terrStore.territories.values()) {
        for (const p of t.posts) {
          if (p.holderId === null && !HONORARY_TEMPLATES.has(p.templateId)) allVacant.push(p);
        }
      }
      for (const p of terrStore.centralPosts) {
        if (p.holderId === null && !HONORARY_TEMPLATES.has(p.templateId)) allVacant.push(p);
      }
      newVacancies = allVacant;
    } else {
      newVacancies = getPendingVacancies(playerId);
    }
    const cascaded = newVacancies.filter(p => !knownIds.has(p.id));

    if (cascaded.length > 0) {
      rescanVacancies(currentPosts);
    } else {
      onClose();
    }
  }

  const pendingPosts = currentPosts.filter(p => !confirmed.has(p.id));
  const confirmableCount = pendingPosts.filter(p => (selections.get(p.id) ?? null) !== null).length;

  // 法理下级转移弹窗
  if (transferState) {
    return (
      <TransferChildrenFlow
        newHolderId={transferState.newHolderId}
        appointerId={transferState.appointerId}
        children={transferState.children}
        onClose={() => {
          const { onDone } = transferState;
          setTransferState(null);
          onDone();
        }}
      />
    );
  }

  return (
    <Modal size="xl" onOverlayClick={onClose}>
      <ModalHeader title={draft ? '📋 拟定铨选草案' : '📋 铨选单'} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {pendingPosts.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-6">所有空缺岗位均已处理</p>
        ) : (
          pendingPosts.map(post => (
            <VacantPostRow
              key={post.id}
              post={post}
              territories={territories}
              selectedId={selections.get(post.id) ?? null}
              onSelect={candidateId => {
                setSelections(prev => {
                  const next = new Map(prev);
                  next.set(post.id, candidateId);
                  return next;
                });
                if (draft && candidateId) handleDraftCascade(post, candidateId);
              }}
              onConfirm={() => handleConfirmOne(post)}
              confirmed={confirmed.has(post.id)}
            />
          ))
        )}
      </div>
      {pendingPosts.length > 0 && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] shrink-0">
          <Button
            variant="primary"
            disabled={confirmableCount === 0}
            onClick={handleConfirmAll}
            className="w-full py-2 font-bold"
          >
            {draft ? '呈报' : '全部确认推荐'}{confirmableCount > 0 ? `（${confirmableCount} 位）` : ''}
          </Button>
        </div>
      )}
    </Modal>
  );
}
