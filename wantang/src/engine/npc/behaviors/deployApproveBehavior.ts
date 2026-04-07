// ===== NPC 调兵批准行为 =====
// Ruler（节度使/皇帝/刺史/诸侯王）审批 deploymentDrafts 中的调兵草案。
// NPC 无条件批准并执行；玩家推送 PlayerTask。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, PlayerTask } from '../types';
import type { Character } from '@engine/character/types';
import type { DeploymentEntry } from '@engine/military/deployCalc';
import { useWarStore } from '@engine/military/WarStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useNpcStore } from '../NpcStore';
import { executeCreateCampaign } from '@engine/interaction/campaignAction';
import { findPath } from '@engine/military/marchCalc';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { addDays } from '@engine/dateUtils';
import { registerBehavior } from './index';

// ── 数据 ────────────────────────────────────────────────

interface DeployApproveData {
  entries: DeploymentEntry[];
}

// ── 辅助函数 ────────────────────────────────────────────

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

// ── 行为定义 ────────────────────────────────────────────

export const deployApproveBehavior: NpcBehavior<DeployApproveData> = {
  id: 'deploy-approve',
  playerMode: 'push-task',     // 玩家时推送任务
  schedule: 'daily',           // 有草案就尽快处理

  generateTask(actor: Character, _ctx: NpcContext): BehaviorTaskResult<DeployApproveData> | null {
    if (!actor.isRuler || !actor.alive) return null;

    const draft = useNpcStore.getState().deploymentDrafts.get(actor.id);
    if (!draft || draft.length === 0) return null;

    // 去重：玩家已有 deploy-approve 任务时，不重复推送
    // （第二个 drafter 的草案留在 buffer 里，等待玩家处理完当前任务后下一轮再合并）
    const hasExisting = useNpcStore.getState().playerTasks.some(
      t => t.type === 'deploy-approve' && t.actorId === actor.id,
    );
    if (hasExisting) return null;

    return {
      data: { entries: draft },
      weight: 100,
      forced: true, // 行政职责，不受 maxActions 限制
    };
  },

  executeAsNpc(actor: Character, data: DeployApproveData, _ctx: NpcContext): void {
    // NPC 无条件批准
    for (const entry of data.entries) {
      executeDeployEntry(entry, actor.id);
    }
    useNpcStore.getState().clearDeploymentDraft(actor.id);
  },

  generatePlayerTask(actor: Character, data: DeployApproveData, ctx: NpcContext): PlayerTask | null {
    // 清除草案缓冲（已转为 PlayerTask）
    useNpcStore.getState().clearDeploymentDraft(actor.id);

    return {
      id: crypto.randomUUID(),
      type: 'deploy-approve',
      actorId: actor.id,
      data: { entries: data.entries },
      deadline: addDays(ctx.date, 30),
    };
  },
};

registerBehavior(deployApproveBehavior);
