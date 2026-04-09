import { useState } from 'react';
import { Modal, ModalHeader, Button } from './base';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { getDemandablePosts, previewDemandRights, executeDemandRights } from '@engine/interaction';
import type { DemandablePost, DemandableRight, DemandRightsChanceResult, DemandRightsResult } from '@engine/interaction';

interface DemandRightsFlowProps {
  targetId: string; // overlord
  onClose: () => void;
}

const RIGHT_LABELS: Record<DemandableRight, string> = {
  appointRight: '辟署权',
  clanSuccession: '宗法继承权',
};

export default function DemandRightsFlow({ targetId, onClose }: DemandRightsFlowProps) {
  const playerId = useCharacterStore((s) => s.playerId);
  const player = useCharacterStore((s) => playerId ? s.characters.get(playerId) : undefined);
  const target = useCharacterStore((s) => s.characters.get(targetId));

  const [selected, setSelected] = useState<{ post: DemandablePost; right: DemandableRight } | null>(null);
  const [result, setResult] = useState<DemandRightsResult | null>(null);

  if (!player || !target || !playerId) return null;

  const demandable = getDemandablePosts(playerId, targetId);
  if (demandable.length === 0) return null;

  const preview: DemandRightsChanceResult = previewDemandRights(playerId, targetId);

  // 展平为 (post, right) 组合列表
  const items = demandable.flatMap(dp =>
    dp.availableRights.map(right => ({ post: dp, right })),
  );
  const isSingle = items.length === 1;
  const active = selected ?? (isSingle ? items[0] : null);

  function handleExecute(post: DemandablePost, right: DemandableRight) {
    const res = executeDemandRights(playerId!, targetId, post.postId, right);
    setResult(res);
  }

  // ── 结果界面 ──
  if (result) {
    const titleText = result.stale ? '操作未生效' : '逼迫授权结果';
    const headlineText = result.stale
      ? '局势已变化'
      : (result.success ? '成功' : '失败') + `（成功率 ${result.chance}%）`;
    const bodyText = result.stale
      ? '局势已发生变化，逼迫授权未生效。'
      : (result.success
        ? `${target.name}被迫授予了你${active ? RIGHT_LABELS[active.right] : ''}。`
        : `${target.name}对你的要求嗤之以鼻，关系大幅恶化。`);
    return (
      <Modal size="sm" onOverlayClick={onClose}>
        <ModalHeader title={titleText} onClose={onClose} />
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className={`text-sm font-bold ${result.stale ? 'text-[var(--color-accent-red)]' : (result.success ? 'text-[var(--color-success,#22c55e)]' : 'text-[var(--color-accent-red)]')}`}>
            {headlineText}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">{bodyText}</p>
          <Button variant="default" className="w-full py-2 font-bold" onClick={onClose}>
            关闭
          </Button>
        </div>
      </Modal>
    );
  }

  // ── 预览界面（已选定） ──
  function renderPreview() {
    if (!active) return null;
    return (
      <div className="space-y-2">
        <div className="text-sm text-[var(--color-text)]">
          {active.post.territoryName} {active.post.postName} — {RIGHT_LABELS[active.right]}
        </div>
        <div className="text-xs text-[var(--color-text-muted)] space-y-1">
          <div>成功率：<span className="text-[var(--color-text)] font-bold">{preview.chance}%</span></div>
          <div className="border-t border-[var(--color-border)] pt-1 mt-1">
            <div>基础：{preview.breakdown.base}</div>
            <div>好感：{preview.breakdown.opinion >= 0 ? '+' : ''}{preview.breakdown.opinion}</div>
            <div>兵力：{preview.breakdown.power >= 0 ? '+' : ''}{preview.breakdown.power}</div>
            <div>性格：{preview.breakdown.personality >= 0 ? '+' : ''}{preview.breakdown.personality}</div>
          </div>
        </div>
        <p className="text-xs text-[var(--color-accent-red)]">
          失败将导致好感 -35
        </p>
      </div>
    );
  }

  return (
    <Modal size="sm" onOverlayClick={onClose}>
      <ModalHeader title={`逼迫授权 — ${target.name}`} onClose={onClose} />
      <div className="px-5 py-4 flex flex-col gap-3">
        {isSingle ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">确认逼迫上级授予以下权利？</p>
            {renderPreview()}
            <Button variant="danger" className="mt-2 w-full py-2 font-bold" onClick={() => handleExecute(items[0].post, items[0].right)}>
              确认逼迫
            </Button>
          </>
        ) : selected === null ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">选择要逼迫授予的权利：</p>
            <div className="text-xs text-[var(--color-text-muted)] mb-1">
              成功率：<span className="text-[var(--color-text)] font-bold">{preview.chance}%</span>
            </div>
            {items.map((item) => (
              <div
                key={`${item.post.postId}-${item.right}`}
                className="flex items-center justify-between rounded px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)]"
              >
                <div>
                  <span className="text-sm text-[var(--color-text)]">{item.post.territoryName} {item.post.postName}</span>
                  <span className="text-xs text-[var(--color-accent-gold)] ml-2">{RIGHT_LABELS[item.right]}</span>
                </div>
                <Button variant="danger" size="sm" className="ml-3 shrink-0" onClick={() => setSelected(item)}>
                  选择
                </Button>
              </div>
            ))}
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">确认逼迫上级授予以下权利？</p>
            {renderPreview()}
            <div className="flex gap-2 mt-2">
              <Button variant="default" className="flex-1 py-2 font-bold" onClick={() => setSelected(null)}>返回</Button>
              <Button variant="danger" className="flex-1 py-2 font-bold" onClick={() => handleExecute(selected.post, selected.right)}>确认逼迫</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
