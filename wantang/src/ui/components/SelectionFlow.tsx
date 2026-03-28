import { useState, useMemo } from 'react';
import type { Post } from '@engine/territory/types';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
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

interface SelectionFlowProps {
  vacantPosts: Post[];
  onClose: () => void;
  /** 特旨模式：连锁扫描时不限于 playerId 有权的岗位 */
  specialDecree?: boolean;
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
    <div className="border border-[var(--color-border)] rounded overflow-hidden">
      {/* 主行 */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--color-bg-panel)]">
        {/* 左侧：岗位信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--color-text)] truncate">{postLabel}</span>
            <span className="text-xs text-[var(--color-text-muted)] shrink-0">{rankLabel}</span>
          </div>
        </div>

        {/* 右侧：推荐人 + 操作按钮 */}
        <div className="flex items-center gap-2 shrink-0">
          {noCandidates ? (
            <span className="text-xs text-[var(--color-text-muted)] italic">暂无人选</span>
          ) : selectedEntry ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-[var(--color-text)]">{selectedEntry.character.name}</span>
              <span className={`text-xs px-1 py-0.5 rounded ${TIER_CLASS[selectedEntry.tier]}`}>
                {TIER_LABEL[selectedEntry.tier]}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">{selectedEntry.score}</span>
            </div>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">未选择</span>
          )}

          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-accent-gold)]/60 transition-colors"
          >
            {expanded ? '收起' : '展开'}
          </button>

          <button
            disabled={!canConfirm}
            onClick={onConfirm}
            className={`text-xs px-2 py-1 rounded border font-bold transition-colors ${
              canConfirm
                ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold)]/10'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
            }`}
          >
            确认
          </button>
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

function buildDefaultSelections(posts: Post[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const usedIds = new Set<string>();
  for (const post of posts) {
    const executorId = resolveAppointAuthority(post);
    if (!executorId) { map.set(post.id, null); continue; }
    const legalId = resolveLegalAppointer(executorId, post);
    const candidates = generateCandidates(post, legalId);
    const pick = candidates.find(c => !usedIds.has(c.character.id));
    const pickId = pick?.character.id ?? null;
    map.set(post.id, pickId);
    if (pickId) usedIds.add(pickId);
  }
  return map;
}

export default function SelectionFlow({ vacantPosts, onClose, specialDecree }: SelectionFlowProps) {
  const territories = useTerritoryStore(s => s.territories);
  const playerId = useCharacterStore(s => s.playerId);

  // 内部管理的岗位列表（初始来自 props，确认后可能追加连锁空缺）
  const [currentPosts, setCurrentPosts] = useState<Post[]>(vacantPosts);

  // postId -> 选中的 candidateId
  const [selections, setSelections] = useState<Map<string, string | null>>(() => {
    return buildDefaultSelections(vacantPosts);
  });

  // 已确认的 postId 集合
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  function getCandidatesForPost(post: Post): CandidateEntry[] {
    const executorId = resolveAppointAuthority(post);
    if (!executorId) return [];
    const legalId = resolveLegalAppointer(executorId, post);
    return generateCandidates(post, legalId);
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

  function handleConfirmOne(post: Post) {
    const candidateId = selections.get(post.id) ?? null;
    if (!candidateId) return;

    const executorId = resolveAppointAuthority(post);
    if (!executorId) return;
    const legalId = resolveLegalAppointer(executorId, post);

    const candidates = getCandidatesForPost(post);
    const entry = candidates.find(c => c.character.id === candidateId);
    const vacateOldPost = entry?.tier === 'promote' || entry?.tier === 'transfer';

    executeAppoint(post.id, candidateId, legalId, vacateOldPost);

    const newConfirmed = new Set(confirmed).add(post.id);
    setConfirmed(newConfirmed);

    // 升调/平调可能产生新空缺，立即扫描
    if (vacateOldPost) {
      rescanVacancies(currentPosts);
    }
  }

  function handleConfirmAll() {
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
      confirmed.add(post.id);
    }
    setConfirmed(new Set(confirmed));

    // 重新扫描连锁空缺
    if (!playerId) { onClose(); return; }
    const newVacancies = getPendingVacancies(playerId);
    const knownIds = new Set(currentPosts.map(p => p.id));
    const cascaded = newVacancies.filter(p => !knownIds.has(p.id));

    if (cascaded.length > 0) {
      rescanVacancies(currentPosts);
    } else {
      onClose();
    }
  }

  const pendingPosts = currentPosts.filter(p => !confirmed.has(p.id));
  const confirmableCount = pendingPosts.filter(p => (selections.get(p.id) ?? null) !== null).length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col overflow-hidden max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-[var(--color-border)] shrink-0">
          <span className="font-bold text-base text-[var(--color-accent-gold)]">📋 铨选单</span>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 岗位列表 */}
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
                }}
                onConfirm={() => handleConfirmOne(post)}
                confirmed={confirmed.has(post.id)}
              />
            ))
          )}
        </div>

        {/* 底部操作区 */}
        {pendingPosts.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--color-border)] shrink-0">
            <button
              disabled={confirmableCount === 0}
              onClick={handleConfirmAll}
              className={`w-full py-2 rounded font-bold text-sm border transition-colors ${
                confirmableCount > 0
                  ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold)]/10'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] opacity-50 cursor-not-allowed'
              }`}
            >
              全部确认推荐{confirmableCount > 0 ? `（${confirmableCount} 位）` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
