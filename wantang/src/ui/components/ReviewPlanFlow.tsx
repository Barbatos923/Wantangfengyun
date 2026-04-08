// ===== 考课罢免审批弹窗 =====

import { Modal, ModalHeader, Button } from './base';
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
  const task = useNpcStore((s) => s.playerTasks.find(t => t.type === 'review') ?? null);
  const plan = task ? (task.data as import('@engine/systems/reviewSystem').ReviewPlan) : null;
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);

  if (!plan || plan.entries.length === 0) return null;

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
      const post = useTerritoryStore.getState().findPost(entry.postId);
      if (!post || post.holderId !== entry.holderId) continue; // 岗位已换人，跳过
      const tpl = positionMap.get(post.templateId) ?? null;
      executeDismiss(entry.postId, entry.legalAppointerId, tpl?.grantsControl ? { vacateOnly: true } : undefined);
    }
    if (task) useNpcStore.getState().removePlayerTask(task.id);
    onClose();
  }

  return (
    <Modal size="lg" onOverlayClick={onClose}>
      <ModalHeader title={`考课结果 — ${plan.date.year}年`} onClose={onClose} />
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
      <div className="px-5 py-3 section-divider border-t shrink-0 flex gap-2">
        <Button variant="default" className="flex-1 py-2" onClick={onClose}>留中不发</Button>
        <Button variant="danger" className="flex-1 py-2 font-bold" onClick={handleApprove}>
          批准罢免（{plan.entries.length}人）
        </Button>
      </div>
    </Modal>
  );
}
