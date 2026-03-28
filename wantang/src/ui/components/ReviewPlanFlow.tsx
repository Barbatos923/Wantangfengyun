// ===== 考课罢免审批弹窗 =====

import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useNpcStore } from '@engine/npc/NpcStore';
import { executeDismiss } from '@engine/interaction';
import { positionMap } from '@data/positions';
import { getReviewGradeLabel } from '@engine/systems/reviewSystem';
import { getHeldPosts } from '@engine/official/officialUtils';

interface ReviewPlanFlowProps {
  onClose: () => void;
}

export default function ReviewPlanFlow({ onClose }: ReviewPlanFlowProps) {
  const plan = useNpcStore((s) => s.pendingReviewPlan);
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);

  if (!plan || plan.entries.length === 0) return null;

  function getPostLabel(postId: string): string {
    const terrStore = useTerritoryStore.getState();
    const post = terrStore.findPost(postId);
    if (!post) return postId;
    const tpl = positionMap.get(post.templateId);
    if (!tpl) return postId;
    const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
    return terrName ? `${terrName}${tpl.name}` : tpl.name;
  }

  function getCharLabel(charId: string): string {
    const c = characters.get(charId);
    if (!c) return charId;
    const posts = getHeldPosts(charId);
    if (posts.length === 0) return c.name;
    const postNames = posts.map(p => {
      const tpl = positionMap.get(p.templateId);
      if (!tpl) return '';
      const terrName = p.territoryId ? territories.get(p.territoryId)?.name : undefined;
      return terrName ? `${terrName}${tpl.name}` : tpl.name;
    }).filter(Boolean).join('、');
    return `${c.name}（${postNames}）`;
  }

  function handleApprove() {
    for (const entry of plan!.entries) {
      executeDismiss(entry.postId, entry.legalAppointerId);
    }
    useNpcStore.getState().setPendingReviewPlan(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[var(--color-bg-panel)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col overflow-hidden max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 flex items-center justify-between border-b border-[var(--color-border)] shrink-0">
          <span className="font-bold text-base text-[var(--color-accent-gold)]">
            考课结果 — {plan.date.year}年
          </span>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
          <div className="text-xs text-[var(--color-text-muted)] mb-1">
            以下官员考课下等，建议罢免：
          </div>
          {plan.entries.map((entry, i) => (
            <div
              key={`${entry.postId}-${i}`}
              className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm text-[var(--color-text)]">
                  {getCharLabel(entry.holderId)}
                </span>
              </div>
              <span className="text-xs px-1.5 py-0.5 rounded border text-[var(--color-accent-red)] border-[var(--color-accent-red)]/40 shrink-0">
                {entry.score}分 {getReviewGradeLabel(entry.grade)}
              </span>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[var(--color-border)] shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded text-sm border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            留中不发
          </button>
          <button
            onClick={handleApprove}
            className="flex-1 py-2 rounded text-sm font-bold border border-[var(--color-accent-red)] text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-colors"
          >
            批准罢免（{plan.entries.length}人）
          </button>
        </div>
      </div>
    </div>
  );
}
