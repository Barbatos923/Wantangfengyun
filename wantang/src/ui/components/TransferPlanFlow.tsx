// ===== 调动名单审批弹窗 =====

import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useNpcStore } from '@engine/npc/NpcStore';
import { executeTransferPlan } from '@engine/npc/NpcEngine';
import { positionMap } from '@data/positions';
import { getHeldPosts } from '@engine/official/officialUtils';

interface TransferPlanFlowProps {
  onClose: () => void;
  onSpecialDecree?: () => void;
}

export default function TransferPlanFlow({ onClose, onSpecialDecree }: TransferPlanFlowProps) {
  const plan = useNpcStore((s) => s.pendingPlan);
  const characters = useCharacterStore((s) => s.characters);
  const territories = useTerritoryStore((s) => s.territories);
  const centralPosts = useTerritoryStore((s) => s.centralPosts);

  if (!plan || plan.entries.length === 0) return null;

  // 查找经办人名字
  function getProposerLabel(proposedBy: string): string {
    // 找到经办人持有的中央岗位名
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

  function handleApprove() {
    executeTransferPlan(plan!);
    onClose();
  }

  // 按经办人分组
  const byProposer = new Map<string, typeof plan.entries>();
  for (const entry of plan.entries) {
    let group = byProposer.get(entry.proposedBy);
    if (!group) {
      group = [];
      byProposer.set(entry.proposedBy, group);
    }
    group.push(entry);
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
        {/* 标题 */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-[var(--color-border)] shrink-0">
          <span className="font-bold text-base text-[var(--color-accent-gold)]">
            官员调动名单 — {plan.date.year}年{plan.date.month}月
          </span>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* 调动列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-3">
          {[...byProposer.entries()].map(([proposerId, entries]) => (
            <div key={proposerId}>
              <div className="text-xs text-[var(--color-text-muted)] mb-1.5">
                {getProposerLabel(proposerId)} 呈报：
              </div>
              <div className="flex flex-col gap-1">
                {entries.map((entry, i) => (
                  <div
                    key={`${entry.postId}-${i}`}
                    className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)]"
                  >
                    <span className="text-sm font-bold text-[var(--color-text)]">
                      {getCharName(entry.appointeeId)}
                      {(() => {
                        const cur = getCurrentPostLabel(entry.appointeeId);
                        return cur ? <span className="text-xs text-[var(--color-text-muted)] font-normal ml-1">（{cur}）</span> : null;
                      })()}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">&rarr;</span>
                    <span className="text-sm text-[var(--color-text)]">
                      {getPostLabel(entry.postId)}
                    </span>
                    {entry.vacateOldPost && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-700/60 ml-auto shrink-0">
                        调任
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-[var(--color-border)] shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded text-sm border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            留中不发
          </button>
          {onSpecialDecree && (
            <button
              onClick={onSpecialDecree}
              className="flex-1 py-2 rounded text-sm font-bold border border-[var(--color-accent-red)] text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-colors"
            >
              特旨
            </button>
          )}
          <button
            onClick={handleApprove}
            className="flex-1 py-2 rounded text-sm font-bold border border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] hover:bg-[var(--color-accent-gold)]/10 transition-colors"
          >
            批准（{plan.entries.length}项）
          </button>
        </div>
      </div>
    </div>
  );
}
