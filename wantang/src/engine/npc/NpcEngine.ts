// ===== NPC Engine 框架入口（统一决策循环） =====

import type { GameDate } from '@engine/types';
import type { TransferPlan, NpcBehavior, NpcContext } from './types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { findEmperorId } from '@engine/official/postQueries';
import { useNpcStore } from './NpcStore';
import { executeAppoint } from '@engine/interaction';
import { buildNpcContext } from './NpcContext';
import { getAllBehaviors } from './behaviors/index';
import { calcMaxActions } from '@engine/character/personalityUtils';
import { random } from '@engine/random';

// 导入行为模块以触发注册
import './behaviors/appointBehavior';
import './behaviors/reviewBehavior';
import './behaviors/declareWarBehavior';
import './behaviors/demandFealtyBehavior';
import './behaviors/mobilizeBehavior';
import './behaviors/recruitBehavior';
import './behaviors/rewardBehavior';
import './behaviors/buildBehavior';
import './behaviors/negotiateWarBehavior';

// ── 公共工具（UI 使用） ────────────────────────────────────

/** 批量执行调动方案（TransferPlanFlow UI 调用） */
export function executeTransferPlan(plan: TransferPlan): void {
  for (const entry of plan.entries) {
    executeAppoint(entry.postId, entry.appointeeId, entry.legalAppointerId, entry.vacateOldPost);
  }
  useNpcStore.getState().setPendingPlan(null);
}

// ── 前置步骤 ───────────────────────────────────────────────

/** 步骤 1：处理上月铨选草稿提交 */
function handleDraftSubmission(): void {
  const npcStore = useNpcStore.getState();
  const draft = npcStore.draftPlan;
  if (!draft || draft.entries.length === 0) return;

  const playerId = useCharacterStore.getState().playerId;
  const { territories, centralPosts } = useTerritoryStore.getState();
  const emperorId = findEmperorId(territories, centralPosts);

  if (emperorId === playerId) {
    // 玩家是皇帝 → 转为 pendingPlan 等待审批
    npcStore.setPendingPlan(draft);
  } else {
    // NPC 皇帝自动批准 → 立即执行
    for (const entry of draft.entries) {
      executeAppoint(entry.postId, entry.appointeeId, entry.legalAppointerId, entry.vacateOldPost);
    }
  }
  npcStore.setDraftPlan(null);
}

/** 步骤 2：超时 PlayerTask 兜底执行 */
function handleExpiredPlayerTasks(date: GameDate): void {
  const npcStore = useNpcStore.getState();
  const expired = npcStore.getExpiredTasks(date);

  for (const task of expired) {
    // 查找对应行为的 executeAsNpc 兜底
    const behavior = getAllBehaviors().find(b => b.id === task.type);
    if (behavior) {
      const actor = useCharacterStore.getState().getCharacter(task.actorId);
      if (actor) {
        const ctx = buildNpcContext();
        behavior.executeAsNpc(actor, task.data, ctx);
      }
    }
    npcStore.removePlayerTask(task.id);
  }
}

// ── 收集决策者 ─────────────────────────────────────────────

/** 收集所有应进入决策循环的角色，按品级降序排列 */
function collectActors(characters: Map<string, import('@engine/character/types').Character>, rankLevelCache: Map<string, number>): import('@engine/character/types').Character[] {
  const actors: import('@engine/character/types').Character[] = [];

  for (const char of characters.values()) {
    if (!char.alive) continue;
    if (!char.official) continue; // 无官职不参与决策
    actors.push(char);
  }

  // 按品级降序（高品级优先决策）
  actors.sort((a, b) => {
    const ra = rankLevelCache.get(a.id) ?? 0;
    const rb = rankLevelCache.get(b.id) ?? 0;
    return rb - ra;
  });

  return actors;
}

// ── 月结入口 ───────────────────────────────────────────────

/** 执行单个任务（根据 playerMode 路由） */
function executeTask(
  actor: import('@engine/character/types').Character,
  task: { behavior: NpcBehavior; data: unknown },
  ctx: NpcContext,
): void {
  const isPlayer = actor.id === ctx.playerId;

  if (isPlayer && task.behavior.playerMode === 'skip') return;

  if (isPlayer && task.behavior.playerMode === 'push-task') {
    const playerTask = task.behavior.generatePlayerTask?.(actor, task.data, ctx);
    if (playerTask) {
      useNpcStore.getState().addPlayerTask(playerTask);
    }
    return;
  }

  // NPC 执行 / auto-execute
  task.behavior.executeAsNpc(actor, task.data, ctx);
}

/**
 * NPC Engine 每月入口（统一决策循环）。
 *
 * 流程：
 * 1. 前置：处理上月铨选草稿提交 + 超时兜底
 * 2. 第一遍：forced 任务（考课等，会改变世界状态）
 * 3. 重建快照（forced 任务可能产生空缺等变化）
 * 4. 第二遍：normal 任务（铨选、宣战、要求效忠等）
 */
export function runNpcEngine(date: GameDate): void {
  // ── 前置步骤 ──
  handleDraftSubmission();
  handleExpiredPlayerTasks(date);

  // ── 第一遍：forced 任务（考课等，会改变世界状态） ──
  {
    const ctx1 = buildNpcContext();
    const actors1 = collectActors(ctx1.characters, ctx1.rankLevelCache);
    const behaviors1 = getAllBehaviors();

    for (const actor of actors1) {
      for (const behavior of behaviors1) {
        const result = behavior.generateTask(actor, ctx1);
        if (!result || !result.forced) continue;
        executeTask(actor, { behavior, data: result.data }, ctx1);
      }
    }
  }

  // ── 重建快照（forced 任务可能改变了世界状态） ──
  const ctx = buildNpcContext();
  const actors = collectActors(ctx.characters, ctx.rankLevelCache);
  const behaviors = getAllBehaviors();

  // ── 第二遍：normal 任务（铨选、宣战、要求效忠等） ──
  for (const actor of actors) {
    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) continue;

    let maxActions = calcMaxActions(personality);
    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    if (rankLevel < 9) maxActions = Math.min(maxActions, 1);

    // 收集 normal 任务，分为行政职责和自愿行为
    const adminTasks: Array<{ behavior: NpcBehavior; data: unknown }> = [];
    const voluntaryTasks: Array<{ behavior: NpcBehavior; data: unknown; weight: number }> = [];

    for (const behavior of behaviors) {
      // 有 pendingPlan 等待审批时跳过铨选（避免重复拟草）
      if (behavior.id === 'appoint' && useNpcStore.getState().pendingPlan) continue;

      const result = behavior.generateTask(actor, ctx);
      if (!result || result.forced) continue;

      if (behavior.playerMode === 'push-task') {
        // 行政职责（铨选/考课等）：不受 maxActions 限制
        adminTasks.push({ behavior, data: result.data });
      } else {
        // 自愿行为（宣战/效忠等）：受 maxActions 限制
        voluntaryTasks.push({ behavior, data: result.data, weight: result.weight });
      }
    }

    // 行政职责：无条件执行
    for (const task of adminTasks) {
      executeTask(actor, task, ctx);
    }

    // 自愿行为：按权重排序，每个 action slot 独立按概率判定
    // weight 直接作为百分比概率（weight=10 → 10%，weight>=100 → 必定执行）
    if (maxActions > 0 && voluntaryTasks.length > 0) {
      voluntaryTasks.sort((a, b) => b.weight - a.weight);
      let slotsUsed = 0;
      for (const task of voluntaryTasks) {
        if (slotsUsed >= maxActions) break;
        const chance = Math.min(task.weight, 100) / 100;
        if (random() < chance) {
          executeTask(actor, task, ctx);
          slotsUsed++;
        }
      }
    }
  }
}
