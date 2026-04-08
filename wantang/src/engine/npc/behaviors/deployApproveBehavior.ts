// ===== NPC 调兵审批行为 =====
// Ruler（节度使/皇帝/王/刺史）审批 deployDrafts buffer 中的草案。
// NPC 概率审批：基础高通过率 + 好感修正 + 兵力规模修正；不通过则给每个 drafter 加 30 天 CD。
// 玩家：推送 PlayerTask，由玩家手动通过/驳回。
//
// 玩家草拟人通知：
//  - 草案被 NPC ruler 批准 → addEvent toast 通知（右下事件流）
//  - 草案被 NPC ruler 驳回 → pushStoryEvent 弹窗（中心 modal）

import type { NpcBehavior, NpcContext, BehaviorTaskResult, PlayerTask } from '../types';
import type { Character } from '@engine/character/types';
import type { DeploymentEntry, DeploySubmission } from '@engine/military/deployCalc';
import { useWarStore } from '@engine/military/WarStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useNpcStore } from '../NpcStore';
import { executeCreateCampaign } from '@engine/interaction/campaignAction';
import { findPath } from '@engine/military/marchCalc';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import { useStoryEventBus } from '@engine/storyEventBus';
import { EventPriority } from '@engine/types';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { addDays } from '@engine/dateUtils';
import { random } from '@engine/random';
import { registerBehavior } from './index';

// ── 数据 ────────────────────────────────────────────────

interface DeployApproveData {
  submissions: DeploySubmission[];
}

const REJECT_CD_DAYS = 30;

// ── 执行单条部署 ─────────────────────────────────────────

/**
 * 执行一条部署：创建调动行营（warId=''）→ 设定行军目标。
 * 军队已在目标位置时跳过。
 */
export function executeDeployEntry(entry: DeploymentEntry, rulerId: string): void {
  if (entry.fromLocationId === entry.targetLocationId) return;

  // 校验军队仍然存在且归属正确
  const army = useMilitaryStore.getState().getArmy(entry.armyId);
  if (!army || army.ownerId !== rulerId) return;

  const territories = useTerritoryStore.getState().territories;
  const characters = useCharacterStore.getState().characters;

  // 寻路
  const path = findPath(
    entry.fromLocationId,
    entry.targetLocationId,
    rulerId,
    territories,
    characters,
  );
  if (!path) {
    if (import.meta.env.DEV) {
      console.warn(`[Deploy] No path: army ${entry.armyId} from ${entry.fromLocationId} to ${entry.targetLocationId}`);
    }
    return;
  }

  // 创建调动行营
  executeCreateCampaign('', rulerId, [entry.armyId], entry.fromLocationId);

  // 找到刚创建的行营（owner + warId='' + 包含该军队）
  const campaigns = useWarStore.getState().campaigns;
  let newCampId: string | null = null;
  for (const c of campaigns.values()) {
    if (c.ownerId === rulerId && !c.warId && c.armyIds.includes(entry.armyId)) {
      newCampId = c.id;
      break;
    }
  }

  if (newCampId) {
    useWarStore.getState().setCampaignTarget(newCampId, entry.targetLocationId, path);
  }
}

// ── 通过率计算 ──────────────────────────────────────────

/**
 * 计算 NPC 通过率（0-100）。
 * 基础高，好感和兵力规模做小幅修正。
 */
export function calcDeployApprovalRate(
  rulerId: string,
  submissions: DeploySubmission[],
  ctx: NpcContext,
): number {
  // 基础高通过率（行政事务，默认放行）
  let rate = 100;

  // ── 好感修正：所有 drafter 平均好感 ──
  let opinionSum = 0;
  for (const s of submissions) {
    opinionSum += ctx.getOpinion(rulerId, s.drafterId);
  }
  const avgOpinion = submissions.length > 0 ? opinionSum / submissions.length : 0;
  rate += Math.max(-5, Math.min(5, avgOpinion / 10));

  // ── 兵力规模修正：调动军队总兵力 vs ruler 总兵力 ──
  // 注意：planDeployments 在无威胁时会"召回所有外驻军队"，ratio 容易偏高，
  // 这是良性操作而非倾巢出动，因此阈值放宽到 0.7/0.9，惩罚减半。
  const movedArmyIds = new Set<string>();
  for (const s of submissions) {
    for (const e of s.entries) movedArmyIds.add(e.armyId);
  }
  const milStore = useMilitaryStore.getState();
  let movedStrength = 0;
  for (const aid of movedArmyIds) {
    const army = milStore.getArmy(aid);
    if (army) movedStrength += getArmyStrength(army, milStore.battalions);
  }
  const totalStrength = Math.max(1, ctx.getMilitaryStrength(rulerId));
  const ratio = movedStrength / totalStrength;
  if (ratio >= 0.9) rate -= 10;       // 几乎倾巢
  else if (ratio >= 0.7) rate -= 5;   // 动用大部主力

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
    description: `${ruler?.name ?? '?'} 批准了你呈递的调兵方案。`,
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
    description: `${ruler?.name ?? '?'}审阅了你呈递的调兵草案，未予批准。30 日内，你不得再次草拟此事。`,
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

// ── 行为定义 ────────────────────────────────────────────

export const deployApproveBehavior: NpcBehavior<DeployApproveData> = {
  id: 'deploy-approve',
  schedule: 'daily',
  playerMode: 'push-task',

  generateTask(actor: Character, _ctx: NpcContext): BehaviorTaskResult<DeployApproveData> | null {
    if (!actor.isRuler || !actor.alive) return null;

    const draft = useNpcStore.getState().deployDrafts.get(actor.id);
    if (!draft || draft.length === 0) return null;

    // 玩家任务去重
    const hasExisting = useNpcStore.getState().playerTasks.some(
      (t) => t.type === 'deploy-approve' && t.actorId === actor.id,
    );
    if (hasExisting) return null;

    return {
      data: { submissions: draft },
      weight: 100,
      forced: true, // 行政职责，不受 maxActions 限制
    };
  },

  executeAsNpc(actor: Character, data: DeployApproveData, ctx: NpcContext): void {
    // 过滤掉草拟人已死的 submission（草拟到审批之间可能跨多日）
    const submissions = data.submissions.filter((s) => ctx.characters.get(s.drafterId)?.alive);
    if (submissions.length === 0) {
      useNpcStore.getState().clearDeployDraft(actor.id);
      return;
    }
    data = { submissions };
    const rate = calcDeployApprovalRate(actor.id, data.submissions, ctx);
    const roll = random() * 100;
    const passed = roll <= rate;

    if (passed) {
      // 通过：执行所有 entries，通知玩家草拟人
      for (const sub of data.submissions) {
        for (const entry of sub.entries) {
          executeDeployEntry(entry, actor.id);
        }
        notifyPlayerApproved(actor.id, sub.drafterId);
      }
    } else {
      // 不通过：每个 drafter 加 30 天 CD，弹窗通知玩家
      const cdUntil = addDays(ctx.date, REJECT_CD_DAYS);
      for (const sub of data.submissions) {
        useNpcStore.getState().setDeployDrafterCooldown(sub.drafterId, cdUntil);
        notifyPlayerRejected(actor.id, sub.drafterId);
      }
    }
    useNpcStore.getState().clearDeployDraft(actor.id);
  },

  generatePlayerTask(actor: Character, data: DeployApproveData, ctx: NpcContext): PlayerTask | null {
    // 转为 task 时清空 buffer，避免 drafter 继续往 buffer 写
    useNpcStore.getState().clearDeployDraft(actor.id);
    return {
      id: crypto.randomUUID(),
      type: 'deploy-approve',
      actorId: actor.id,
      data: { submissions: data.submissions },
      deadline: addDays(ctx.date, 30),
    };
  },
};

registerBehavior(deployApproveBehavior);
