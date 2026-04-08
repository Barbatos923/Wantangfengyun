// ===== NPC 国库调拨审批行为 =====
// Ruler（皇帝/王/节度使/刺史）审批 treasuryDrafts buffer 中的草案。
// NPC 概率审批：基础高通过率 + 好感修正 + 金额修正；不通过则给每个 drafter 加 30 天 CD。
// 玩家：推送 PlayerTask，由玩家手动通过/驳回。
//
// 玩家草拟人通知：
//  - 草案被 NPC ruler 批准 → addEvent toast 通知（右下事件流）
//  - 草案被 NPC ruler 驳回 → pushStoryEvent 弹窗（中心 modal）

import type { NpcBehavior, NpcContext, BehaviorTaskResult, PlayerTask } from '../types';
import type { Character } from '@engine/character/types';
import type { TreasuryEntry, TreasurySubmission } from '@engine/official/treasuryDraftCalc';
import { useNpcStore } from '../NpcStore';
import { executeTransferTreasury } from '@engine/interaction/treasuryTransferAction';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority } from '@engine/types';
import { useStoryEventBus } from '@engine/storyEventBus';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { addDays } from '@engine/dateUtils';
import { random } from '@engine/random';
import { registerBehavior } from './index';

interface TreasuryApproveData {
  submissions: TreasurySubmission[];
}

const REJECT_CD_DAYS = 30;

/** 执行单条调拨：金额 clamp 到源州余额，避免余额不足导致整条静默丢弃 */
export function executeTreasuryEntry(entry: TreasuryEntry, rulerId: string): void {
  if (entry.fromZhouId === entry.toZhouId) return;
  if (entry.amount <= 0) return;

  const terrStore = useTerritoryStore.getState();
  const fromT = terrStore.territories.get(entry.fromZhouId);
  if (!fromT?.treasury) return;

  const available = entry.resource === 'money' ? fromT.treasury.money : fromT.treasury.grain;
  if (available <= 0) return;

  const amount = Math.min(entry.amount, Math.floor(available));
  if (amount <= 0) return;

  executeTransferTreasury(
    rulerId,
    entry.fromZhouId,
    entry.toZhouId,
    entry.resource === 'money' ? { money: amount } : { grain: amount },
  );
}

/**
 * 计算 NPC 通过率（0-100）。
 * 基础高，好感和金额做小幅修正。
 */
export function calcApprovalRate(
  rulerId: string,
  submissions: TreasurySubmission[],
  ctx: NpcContext,
): number {
  let rate = 90;

  // ── 好感修正：所有 drafter 平均好感 ──
  let opinionSum = 0;
  for (const s of submissions) {
    opinionSum += ctx.getOpinion(rulerId, s.drafterId);
  }
  const avgOpinion = submissions.length > 0 ? opinionSum / submissions.length : 0;
  rate += Math.max(-5, Math.min(5, avgOpinion / 10));

  // ── 金额修正：调拨总额 vs ruler 国库总规模 ──
  let totalAmount = 0;
  for (const s of submissions) {
    for (const e of s.entries) totalAmount += e.amount;
  }
  const treasury = ctx.totalTreasury.get(rulerId) ?? { money: 0, grain: 0 };
  const totalSize = Math.max(1, treasury.money + treasury.grain);
  const ratio = totalAmount / totalSize;
  if (ratio > 1.0) rate -= 10;
  else if (ratio > 0.5) rate -= 5;

  return Math.max(30, Math.min(99, rate));
}

// ── 通知 helpers ──────────────────────────────────────

function notifyPlayerApproved(rulerId: string, drafterId: string): void {
  const playerId = useCharacterStore.getState().playerId;
  if (drafterId !== playerId) return;
  const characters = useCharacterStore.getState().characters;
  const ruler = characters.get(rulerId);
  const date = useTurnManager.getState().currentDate;
  useTurnManager.getState().addEvent({
    id: crypto.randomUUID(),
    date: { ...date },
    type: '草案批准',
    actors: [rulerId, drafterId],
    territories: [],
    description: `${ruler?.name ?? '?'} 批准了你呈递的国库调拨草案。`,
    priority: EventPriority.Normal,
  });
}

function notifyPlayerRejected(rulerId: string, drafterId: string): void {
  const playerId = useCharacterStore.getState().playerId;
  if (drafterId !== playerId) return;
  const ruler = useCharacterStore.getState().characters.get(rulerId);
  useStoryEventBus.getState().pushStoryEvent({
    id: crypto.randomUUID(),
    title: '草案被驳回',
    description: `${ruler?.name ?? '?'}审阅了你呈递的国库调拨草案，未予批准。30 日内，你不得再次草拟此事。`,
    actors: [
      { characterId: rulerId, role: '审批人' },
      { characterId: drafterId, role: '草拟人（你）' },
    ],
    options: [
      {
        label: '知道了',
        description: '接受驳回，等待 30 日冷却',
        effects: [],
        onSelect: () => { /* no-op */ },
      },
    ],
  });
}

export const treasuryApproveBehavior: NpcBehavior<TreasuryApproveData> = {
  id: 'treasury-approve',
  schedule: 'daily',
  playerMode: 'push-task',

  generateTask(actor: Character, _ctx: NpcContext): BehaviorTaskResult<TreasuryApproveData> | null {
    if (!actor.isRuler || !actor.alive) return null;

    const draft = useNpcStore.getState().treasuryDrafts.get(actor.id);
    if (!draft || draft.length === 0) return null;

    const hasExisting = useNpcStore.getState().playerTasks.some(
      (t) => t.type === 'treasury-approve' && t.actorId === actor.id,
    );
    if (hasExisting) return null;

    return {
      data: { submissions: draft },
      weight: 100,
      forced: true,
    };
  },

  executeAsNpc(actor: Character, data: TreasuryApproveData, ctx: NpcContext): void {
    // 过滤掉草拟人已死的 submission（草拟到审批之间可能跨多日）
    const submissions = data.submissions.filter((s) => ctx.characters.get(s.drafterId)?.alive);
    if (submissions.length === 0) {
      useNpcStore.getState().clearTreasuryDraft(actor.id);
      return;
    }
    data = { submissions };
    const rate = calcApprovalRate(actor.id, data.submissions, ctx);
    const roll = random() * 100;
    const passed = roll <= rate;

    if (passed) {
      // 通过：执行所有 entries，通知玩家草拟人
      for (const sub of data.submissions) {
        for (const entry of sub.entries) {
          executeTreasuryEntry(entry, actor.id);
        }
        notifyPlayerApproved(actor.id, sub.drafterId);
      }
    } else {
      // 不通过：每个 drafter 加 30 天 CD，弹窗通知玩家
      const cdUntil = addDays(ctx.date, REJECT_CD_DAYS);
      for (const sub of data.submissions) {
        useNpcStore.getState().setTreasuryDrafterCooldown(sub.drafterId, cdUntil);
        notifyPlayerRejected(actor.id, sub.drafterId);
      }
    }
    useNpcStore.getState().clearTreasuryDraft(actor.id);
  },

  generatePlayerTask(actor: Character, data: TreasuryApproveData, ctx: NpcContext): PlayerTask | null {
    useNpcStore.getState().clearTreasuryDraft(actor.id);
    return {
      id: crypto.randomUUID(),
      type: 'treasury-approve',
      actorId: actor.id,
      data: { submissions: data.submissions },
      deadline: addDays(ctx.date, 30),
    };
  },
};

registerBehavior(treasuryApproveBehavior);
