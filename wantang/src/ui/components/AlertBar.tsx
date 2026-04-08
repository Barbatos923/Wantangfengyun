import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { getPendingVacancies, resolveAppointAuthority } from '@engine/official/selectionUtils';
import { findEmperorId } from '@engine/official/postQueries';
import { useNpcStore } from '@engine/npc/NpcStore';
import { useWarStore } from '@engine/military/WarStore';
import { CASUS_BELLI_NAMES } from '@engine/military/types';
import { executeJoinWar } from '@engine/interaction/joinWarAction';
import type { Post } from '@engine/territory/types';
import SelectionFlow from './SelectionFlow';
import TransferPlanFlow from './TransferPlanFlow';
import ReviewPlanFlow from './ReviewPlanFlow';
import DeployApproveFlow from './DeployApproveFlow';
import TreasuryApproveFlow from './TreasuryApproveFlow';

const AlertBar: React.FC = () => {
  const playerId = useCharacterStore((s) => s.playerId);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [transferPlanOpen, setTransferPlanOpen] = useState(false);
  const [reviewPlanOpen, setReviewPlanOpen] = useState(false);
  const [deployApproveOpen, setDeployApproveOpen] = useState(false);
  const [treasuryApproveOpen, setTreasuryApproveOpen] = useState(false);
  const playerTasks = useNpcStore((s) => s.playerTasks);
  const draftPlan = useNpcStore((s) => s.draftPlan);
  const appointApproveTask = useMemo(() => playerTasks.find(t => t.type === 'appoint-approve') ?? null, [playerTasks]);
  const reviewTask = useMemo(() => playerTasks.find(t => t.type === 'review') ?? null, [playerTasks]);
  const deployApproveTask = useMemo(() => playerTasks.find(t => t.type === 'deploy-approve') ?? null, [playerTasks]);
  const treasuryApproveTask = useMemo(() => playerTasks.find(t => t.type === 'treasury-approve') ?? null, [playerTasks]);
  const callToArmsTasks = useMemo(() => playerTasks.filter(t => t.type === 'callToArms'), [playerTasks]);
  const characters = useCharacterStore((s) => s.characters);
  const wars = useWarStore((s) => s.wars);
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
  const { draftPosts, directPosts } = useMemo(() => {
    if (isEmperor || !playerId) {
      return { draftPosts: [] as Post[], directPosts: allVacancies };
    }
    const draftedPostIds = new Set(draftPlan?.entries.map(e => e.postId) ?? []);
    const draft: Post[] = [];
    const direct: Post[] = [];
    for (const post of allVacancies) {
      if (draftedPostIds.has(post.id)) continue;
      const authority = resolveAppointAuthority(post);
      if (authority === playerId) {
        draft.push(post);
      } else {
        direct.push(post);
      }
    }
    return { draftPosts: draft, directPosts: direct };
  }, [allVacancies, isEmperor, playerId, draftPlan]);

  // 常驻任务（standing）
  // ── 审批弹窗打开时自动暂停时间，全部关闭后恢复 ──
  const anyModalOpen = selectionOpen || draftOpen || transferPlanOpen || reviewPlanOpen || deployApproveOpen || treasuryApproveOpen;
  const wasPausedRef = useRef(false);

  useEffect(() => {
    if (anyModalOpen) {
      const { isPaused } = useTurnManager.getState();
      wasPausedRef.current = isPaused;
      if (!isPaused) useTurnManager.getState().togglePause();
    } else {
      // 全部关闭 → 仅当之前不是暂停状态才恢复
      if (!wasPausedRef.current) {
        const { isPaused } = useTurnManager.getState();
        if (isPaused) useTurnManager.getState().togglePause();
      }
    }
  }, [anyModalOpen]);

  if (directPosts.length === 0 && !appointApproveTask && !reviewTask && !deployApproveTask && !treasuryApproveTask && draftPosts.length === 0 && callToArmsTasks.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 p-3">
        {/* 审批链：皇帝审批调动名单 */}
        {appointApproveTask && (appointApproveTask.data as { entries: unknown[] }).entries.length > 0 && (
          <div
            className="flex items-center gap-1 bg-[var(--color-accent-gold)]/20 text-[var(--color-accent-gold)] px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-[var(--color-accent-gold)]/30 transition-colors border border-[var(--color-accent-gold)]/40"
            onClick={() => setTransferPlanOpen(true)}
            title="点击审批调动名单"
          >
            <span>📜</span>
            <span>{(appointApproveTask!.data as { entries: unknown[] }).entries.length}项调动待审批</span>
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
        {reviewTask && (reviewTask.data as { entries: unknown[] }).entries.length > 0 && (
          <div
            className="flex items-center gap-1 bg-orange-500/20 text-orange-400 px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-orange-500/30 transition-colors border border-orange-500/40"
            onClick={() => setReviewPlanOpen(true)}
            title="点击审批考课结果"
          >
            <span>📝</span>
            <span>{(reviewTask!.data as { entries: unknown[] }).entries.length}项考课待审</span>
          </div>
        )}
        {/* 调兵审批 */}
        {deployApproveTask && (() => {
          const data = deployApproveTask.data as { submissions?: { entries: unknown[] }[] };
          const total = (data.submissions ?? []).reduce((acc, s) => acc + s.entries.length, 0);
          if (total === 0) return null;
          return (
            <div
              className="flex items-center gap-1 bg-[var(--color-accent-green)]/20 text-[var(--color-accent-green)] px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-[var(--color-accent-green)]/30 transition-colors border border-[var(--color-accent-green)]/40"
              onClick={() => setDeployApproveOpen(true)}
              title="点击审批调兵方案"
            >
              <span>&#9876;</span>
              <span>{total}项调兵待审批</span>
            </div>
          );
        })()}
        {/* 国库调拨审批 */}
        {treasuryApproveTask && (() => {
          const data = treasuryApproveTask.data as { submissions?: { entries: unknown[] }[] };
          const total = (data.submissions ?? []).reduce((acc, s) => acc + s.entries.length, 0);
          if (total === 0) return null;
          return (
            <div
              className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 px-2.5 py-1 rounded text-xs cursor-pointer hover:bg-yellow-500/30 transition-colors border border-yellow-500/40"
              onClick={() => setTreasuryApproveOpen(true)}
              title="点击审批国库调拨方案"
            >
              <span>💰</span>
              <span>{total}项调拨待审批</span>
            </div>
          );
        })()}
        {/* 召集参战 */}
        {callToArmsTasks.map(task => {
          const data = task.data as { warId: string; side: 'attacker' | 'defender'; summonerId: string };
          const summoner = characters.get(data.summonerId);
          const war = wars.get(data.warId);
          const enemyName = war ? characters.get(war.attackerId === data.summonerId ? war.defenderId : war.attackerId)?.name ?? '?' : '?';
          const cbName = war ? CASUS_BELLI_NAMES[war.casusBelli] : '';
          return (
            <div key={task.id} className="flex items-center gap-1 bg-red-500/20 text-red-400 px-2.5 py-1 rounded text-xs border border-red-500/40">
              <span>{summoner?.name ?? '?'}召集你参加对{enemyName}的{cbName}</span>
              <button
                className="ml-1 px-1.5 py-0.5 rounded bg-[var(--color-accent-green)]/30 text-[var(--color-accent-green)] hover:bg-[var(--color-accent-green)]/50"
                onClick={() => { executeJoinWar(task.actorId, data.warId, data.side); useNpcStore.getState().removePlayerTask(task.id); }}
              >接受</button>
              <button
                className="px-1.5 py-0.5 rounded bg-[var(--color-accent-red)]/30 text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/50"
                onClick={() => {
                  useCharacterStore.getState().addOpinion(task.actorId, data.summonerId, { reason: '拒绝参战', value: -30, decayable: true });
                  useNpcStore.getState().removePlayerTask(task.id);
                }}
              >拒绝(-30)</button>
            </div>
          );
        })}
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
      </div>
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
      {transferPlanOpen && appointApproveTask && (
        <TransferPlanFlow onClose={() => setTransferPlanOpen(false)} />
      )}
      {reviewPlanOpen && reviewTask && (
        <ReviewPlanFlow onClose={() => setReviewPlanOpen(false)} />
      )}
      {deployApproveTask && (
        <DeployApproveFlow
          visible={deployApproveOpen}
          onOpen={() => setDeployApproveOpen(true)}
          onClose={() => setDeployApproveOpen(false)}
        />
      )}
      {treasuryApproveTask && (
        <TreasuryApproveFlow
          visible={treasuryApproveOpen}
          onClose={() => setTreasuryApproveOpen(false)}
        />
      )}
    </>
  );
};

export default AlertBar;
