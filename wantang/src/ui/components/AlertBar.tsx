import React, { useState, useMemo } from 'react';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority, type GameEvent } from '@engine/types';
import BattleDetailModal from './BattleDetailModal';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getPendingVacancies, resolveAppointAuthority } from '@engine/official/selectionUtils';
import { findEmperorId } from '@engine/official/postQueries';
import { useNpcStore } from '@engine/npc/NpcStore';
import type { Post } from '@engine/territory/types';
import SelectionFlow from './SelectionFlow';
import TransferPlanFlow from './TransferPlanFlow';
import ReviewPlanFlow from './ReviewPlanFlow';

const AlertBar: React.FC = () => {
  const events = useTurnManager((s) => s.events);
  const currentDate = useTurnManager((s) => s.currentDate);
  const [battleEvent, setBattleEvent] = useState<GameEvent | null>(null);
  const playerId = useCharacterStore((s) => s.playerId);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [transferPlanOpen, setTransferPlanOpen] = useState(false);
  const [reviewPlanOpen, setReviewPlanOpen] = useState(false);
  const pendingPlan = useNpcStore((s) => s.pendingPlan);
  const pendingReviewPlan = useNpcStore((s) => s.pendingReviewPlan);
  const territories = useTerritoryStore((s) => s.territories);
  const centralPosts = useTerritoryStore((s) => s.centralPosts);

  // 玩家是否是皇帝
  const isEmperor = useMemo(() => {
    if (!playerId) return false;
    return findEmperorId(territories, centralPosts) === playerId;
  }, [playerId, territories, centralPosts]);

  // 计算所有玩家有权的空缺
  const allVacancies = playerId ? getPendingVacancies(playerId) : [];

  // 分流：玩家是皇帝 → 全部走直辖铨选（直接执行）；非皇帝 → 作为经办人拟草稿
  // 作为经办人的岗位 = resolveAppointAuthority 指向自己的岗位
  const { draftPosts, directPosts } = useMemo(() => {
    if (isEmperor || !playerId) {
      return { draftPosts: [] as Post[], directPosts: allVacancies };
    }
    const draft: Post[] = [];
    const direct: Post[] = [];
    for (const post of allVacancies) {
      const authority = resolveAppointAuthority(post);
      if (authority === playerId) {
        // 玩家是这个岗位的经办人（吏部/宰相/辟署权）→ 走草稿流程
        draft.push(post);
      } else {
        // 其他空缺（如辟署权域内但经办人不是玩家）→ 直接执行
        direct.push(post);
      }
    }
    return { draftPosts: draft, directPosts: direct };
  }, [allVacancies, isEmperor, playerId]);

  // 显示最近3个月的重要事件
  const recentEvents = events.filter((e) => {
    if (e.priority < EventPriority.Major) return false;
    const monthsDiff = (currentDate.year - e.date.year) * 12 + (currentDate.month - e.date.month);
    return monthsDiff >= 0 && monthsDiff <= 3;
  }).slice(-5);

  if (recentEvents.length === 0 && directPosts.length === 0 && !pendingPlan && !pendingReviewPlan && draftPosts.length === 0) return null;

  const handleClick = (event: GameEvent) => {
    if (event.type === '野战' && event.payload) {
      setBattleEvent(event);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 p-3">
        {/* 审批链：皇帝审批调动名单 */}
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
        {/* 审批链：玩家拟定铨选草案 */}
        {draftPosts.length > 0 && (
          <div
            className="flex items-center gap-1 bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-blue-500/30 transition-colors border border-blue-500/40"
            onClick={() => setDraftOpen(true)}
            title="点击拟定铨选草案"
          >
            <span>📋</span>
            <span>{draftPosts.length}个空缺待拟定</span>
          </div>
        )}
        {/* 考课审批 */}
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
        {/* 直辖空缺（非审批链，如辟署权域内空缺） */}
        {directPosts.length > 0 && (
          <div
            className="flex items-center gap-1 bg-[var(--color-accent-red)]/20 text-[var(--color-accent-red)] px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-[var(--color-accent-red)]/30 transition-colors border border-[var(--color-accent-red)]/40"
            onClick={() => setSelectionOpen(true)}
            title="点击打开铨选单"
          >
            <span>📋</span>
            <span>{directPosts.length}个待铨选岗位</span>
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
      {/* 直辖铨选（立即执行） */}
      {selectionOpen && directPosts.length > 0 && (
        <SelectionFlow
          vacantPosts={directPosts}
          onClose={() => setSelectionOpen(false)}
        />
      )}
      {/* 拟定铨选草案（写入 draftPlan） */}
      {draftOpen && draftPosts.length > 0 && (
        <SelectionFlow
          vacantPosts={draftPosts}
          onClose={() => setDraftOpen(false)}
          draft
        />
      )}
      {/* 皇帝审批调动名单 */}
      {transferPlanOpen && pendingPlan && (
        <TransferPlanFlow onClose={() => setTransferPlanOpen(false)} />
      )}
      {reviewPlanOpen && pendingReviewPlan && (
        <ReviewPlanFlow onClose={() => setReviewPlanOpen(false)} />
      )}
    </>
  );
};

export default AlertBar;
