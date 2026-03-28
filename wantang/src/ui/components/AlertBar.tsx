import React, { useState } from 'react';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority, type GameEvent } from '@engine/types';
import BattleDetailModal from './BattleDetailModal';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getPendingVacancies } from '@engine/official/selectionUtils';
import { useNpcStore } from '@engine/npc/NpcStore';
import SelectionFlow from './SelectionFlow';
import TransferPlanFlow from './TransferPlanFlow';
import ReviewPlanFlow from './ReviewPlanFlow';

const AlertBar: React.FC = () => {
  const events = useTurnManager((s) => s.events);
  const currentDate = useTurnManager((s) => s.currentDate);
  const [battleEvent, setBattleEvent] = useState<GameEvent | null>(null);
  const playerId = useCharacterStore((s) => s.playerId);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [specialDecreePosts, setSpecialDecreePosts] = useState<import('@engine/territory/types').Post[]>([]);
  const [transferPlanOpen, setTransferPlanOpen] = useState(false);
  const [reviewPlanOpen, setReviewPlanOpen] = useState(false);
  const pendingPlan = useNpcStore((s) => s.pendingPlan);
  const pendingReviewPlan = useNpcStore((s) => s.pendingReviewPlan);

  // 计算待铨选岗位
  const pendingVacancies = playerId ? getPendingVacancies(playerId) : [];

  // 显示最近3个月的重要事件
  const recentEvents = events.filter((e) => {
    if (e.priority < EventPriority.Major) return false;
    const monthsDiff = (currentDate.year - e.date.year) * 12 + (currentDate.month - e.date.month);
    return monthsDiff >= 0 && monthsDiff <= 3;
  }).slice(-5); // 最多5条

  if (recentEvents.length === 0 && pendingVacancies.length === 0 && !pendingPlan && !pendingReviewPlan && !selectionOpen) return null;

  const handleClick = (event: GameEvent) => {
    if (event.type === '野战' && event.payload) {
      setBattleEvent(event);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 p-3">
        {pendingPlan && pendingPlan.entries.length > 0 && (
          <div
            className="flex items-center gap-1 bg-[var(--color-accent-gold)]/20 text-[var(--color-accent-gold)] px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-[var(--color-accent-gold)]/30 transition-colors border border-[var(--color-accent-gold)]/40"
            onClick={() => setTransferPlanOpen(true)}
            title="点击审批调动名单"
          >
            <span>📜</span>
            <span>{pendingPlan.entries.length}项调动待审批</span>
          </div>
        )}
        {pendingReviewPlan && pendingReviewPlan.entries.length > 0 && (
          <div
            className="flex items-center gap-1 bg-orange-500/20 text-orange-400 px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-orange-500/30 transition-colors border border-orange-500/40"
            onClick={() => setReviewPlanOpen(true)}
            title="点击审批考课结果"
          >
            <span>📝</span>
            <span>{pendingReviewPlan.entries.length}项考课待审</span>
          </div>
        )}
        {pendingVacancies.length > 0 && (
          <div
            className="flex items-center gap-1 bg-[var(--color-accent-red)]/20 text-[var(--color-accent-red)] px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-[var(--color-accent-red)]/30 transition-colors border border-[var(--color-accent-red)]/40"
            onClick={() => setSelectionOpen(true)}
            title="点击打开铨选单"
          >
            <span>📋</span>
            <span>{pendingVacancies.length}个待铨选岗位</span>
          </div>
        )}
        {recentEvents.map((event) => {
          const icon = event.type === '野战' ? '⚔'
            : event.type === '城破' ? '🏰'
            : event.type === '兵变' ? '🔥'
            : event.type === '继位' ? '👑'
            : event.type === '绝嗣' ? '💀'
            : event.type === '岗位空缺' ? '🏛'
            : event.type === '王朝覆灭' ? '⚡'
            : '📋';
          const isClickable = event.type === '野战' && !!event.payload;
          return (
            <div
              key={event.id}
              className="flex items-center gap-1 bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] px-2.5 py-1 rounded text-xs hover:text-[var(--color-text)] cursor-pointer transition-colors max-w-xs"
              title={isClickable ? `点击查看战斗详情` : `${event.date.year}年${event.date.month}月 ${event.description}`}
              onClick={() => handleClick(event)}
            >
              <span>{icon}</span>
              <span className="truncate">{event.description}</span>
            </div>
          );
        })}
      </div>
      {battleEvent && (
        <BattleDetailModal event={battleEvent} onClose={() => setBattleEvent(null)} />
      )}
      {selectionOpen && (specialDecreePosts.length > 0 || pendingVacancies.length > 0) && (
        <SelectionFlow
          vacantPosts={specialDecreePosts.length > 0 ? specialDecreePosts : pendingVacancies}
          onClose={() => { setSelectionOpen(false); setSpecialDecreePosts([]); }}
          specialDecree={specialDecreePosts.length > 0}
        />
      )}
      {transferPlanOpen && pendingPlan && (
        <TransferPlanFlow
          onClose={() => setTransferPlanOpen(false)}
          onSpecialDecree={() => {
            // 特旨：从NPC方案中提取实际空缺岗位，丢弃方案，皇帝亲自铨选
            const terrStore = useTerritoryStore.getState();
            const posts = pendingPlan!.entries
              .map(e => terrStore.findPost(e.postId))
              .filter((p): p is import('@engine/territory/types').Post => p != null && p.holderId === null);
            useNpcStore.getState().setPendingPlan(null);
            setTransferPlanOpen(false);
            setSpecialDecreePosts(posts);
            setSelectionOpen(true);
          }}
        />
      )}
      {reviewPlanOpen && pendingReviewPlan && (
        <ReviewPlanFlow onClose={() => setReviewPlanOpen(false)} />
      )}
    </>
  );
};

export default AlertBar;
