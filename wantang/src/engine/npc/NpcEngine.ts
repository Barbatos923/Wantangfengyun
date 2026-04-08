// ===== NPC Engine 框架入口（日结化决策循环） =====

import type { GameDate } from '@engine/types';
import type { TransferPlan, NpcBehavior, NpcContext } from './types';
import type { ReviewEntry } from '@engine/systems/reviewSystem';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { findEmperorId } from '@engine/official/postQueries';
import { positionMap } from '@data/positions';
import { useNpcStore } from './NpcStore';
import { executeAppoint, executeDismiss, executeJoinWar } from '@engine/interaction';
import { executeTreasuryEntry } from './behaviors/treasuryApproveBehavior';
import { executeDeployEntry } from './behaviors/deployApproveBehavior';
import type { TreasurySubmission } from '@engine/official/treasuryDraftCalc';
import type { DeploySubmission } from '@engine/military/deployCalc';
import { autoTransferChildrenAfterAppoint } from '@engine/official/postTransfer';
import { buildNpcContext } from './NpcContext';
import { getAllBehaviors } from './behaviors/index';
import { calcMaxActions } from '@engine/character/personalityUtils';
import { random } from '@engine/random';
import { addDays } from '@engine/dateUtils';

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
import './behaviors/grantTerritoryBehavior';
import './behaviors/revokeBehavior';
import './behaviors/transferVassalBehavior';
import './behaviors/deployDraftBehavior';
import './behaviors/deployApproveBehavior';
import './behaviors/treasuryDraftBehavior';
import './behaviors/treasuryApproveBehavior';
import './behaviors/conscriptBehavior';
import './behaviors/callToArmsBehavior';
import './behaviors/joinWarBehavior';
import './behaviors/withdrawWarBehavior';
import './behaviors/createKingdomBehavior';
import './behaviors/createEmperorBehavior';
import './behaviors/usurpBehavior';
import './behaviors/dismissBehavior';
import './behaviors/adjustTaxBehavior';
import './behaviors/adjustTypeBehavior';
import './behaviors/adjustAppointRightBehavior';
import './behaviors/adjustSuccessionBehavior';
import './behaviors/adjustOwnPolicyBehavior';
import './behaviors/adjustRedistributionBehavior';
import './behaviors/reassignBehavior';
import './behaviors/demandRightsBehavior';
import './behaviors/negotiateTaxBehavior';

// ── 公共工具（UI 使用） ────────────────────────────────────

/** 批量执行调动方案（TransferPlanFlow UI 调用） */
export function executeTransferPlan(plan: TransferPlan): void {
  for (const entry of plan.entries) {
    executeAppoint(entry.postId, entry.appointeeId, entry.legalAppointerId, entry.vacateOldPost);
    autoTransferChildrenAfterAppoint(entry.postId, entry.legalAppointerId, true);
  }
}

// ── 哈希槽位调度 ─────────────────────────────────────────

/** 计算角色+行为的月内基础槽位日（1-28） */
export function getBehaviorSlot(actorId: string, behaviorId: string): number {
  let hash = 0;
  const key = actorId + ':' + behaviorId;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 28) + 1;
}

/**
 * 根据品级分档展开月内槽位日。
 * - 王公级 (25+): 2次/月 — base, base+14
 * - 节度使级 (17-24): 1次/月 — base
 * - 刺史级 (12-16): 1次/月 — base（跨月门控另行处理）
 * - 县令级 (0-11): 1次/月 — base（跨月门控另行处理）
 */
export function getSlotDays(baseSlot: number, rankLevel: number): number[] {
  const slots = [baseSlot];
  if (rankLevel >= 25) {
    slots.push(((baseSlot - 1 + 14) % 28) + 1);
  }
  return slots;
}

/**
 * 判断当月是否为某角色某行为的活跃月。
 * - 王公/节度使: 每月活跃
 * - 刺史: 每2月活跃一次（按哈希决定奇偶月）
 * - 县令: 每3月活跃一次（按哈希决定月份）
 */
export function isActiveMonth(month: number, actorId: string, behaviorId: string, rankLevel: number): boolean {
  if (rankLevel >= 17) return true; // 节度使+：每月
  const base = getBehaviorSlot(actorId, behaviorId);
  if (rankLevel >= 12) return month % 2 === base % 2; // 刺史：每2月
  return month % 3 === base % 3; // 县令：每3月
}

/** 判断当天是否为某角色某行为的槽位日（含跨月门控） */
export function isSlotDay(day: number, month: number, actorId: string, behaviorId: string, rankLevel: number): boolean {
  if (!isActiveMonth(month, actorId, behaviorId, rankLevel)) return false;
  const base = getBehaviorSlot(actorId, behaviorId);
  return getSlotDays(base, rankLevel).includes(day);
}

/** 获取行为的有效调度频率（显式设置 > 从 playerMode 推断） */
function getEffectiveSchedule(behavior: NpcBehavior, isPlayer: boolean): 'daily' | 'monthly-slot' {
  // standing 行为：玩家每天检测（维护常驻任务），NPC 用 schedule 字段
  if (behavior.playerMode === 'standing' && isPlayer) return 'daily';
  if (behavior.schedule) return behavior.schedule;
  if (behavior.playerMode === 'push-task') return 'daily';
  return 'monthly-slot';
}

// ── 前置步骤 ───────────────────────────────────────────────

/** 步骤 1：处理铨选草稿提交（每天检测） */
function handleDraftSubmission(date: GameDate): void {
  const npcStore = useNpcStore.getState();
  const draft = npcStore.draftPlan;
  if (!draft || draft.entries.length === 0) return;

  const playerId = useCharacterStore.getState().playerId;
  const { territories, centralPosts } = useTerritoryStore.getState();
  const emperorId = findEmperorId(territories, centralPosts);

  // 分流：辟署权域（法理主体是经办人自己）直接执行，朝廷体系走审批
  const directEntries: typeof draft.entries = [];
  const imperialEntries: typeof draft.entries = [];
  for (const entry of draft.entries) {
    if (entry.legalAppointerId === entry.proposedBy) {
      // 辟署权持有人自己铨选，直接执行
      directEntries.push(entry);
    } else {
      // 朝廷体系（吏部/宰相经办），需皇帝审批
      imperialEntries.push(entry);
    }
  }

  // 辟署权域：立即执行
  for (const entry of directEntries) {
    executeAppoint(entry.postId, entry.appointeeId, entry.legalAppointerId, entry.vacateOldPost);
    autoTransferChildrenAfterAppoint(entry.postId, entry.legalAppointerId, true);
  }

  // 朝廷体系：走皇帝审批流程
  if (imperialEntries.length > 0) {
    if (emperorId && emperorId === playerId) {
      // 玩家是皇帝 → 创建 appoint-approve PlayerTask 等待审批
      npcStore.addPlayerTask({
        id: crypto.randomUUID(),
        type: 'appoint-approve',
        actorId: emperorId,
        data: { entries: imperialEntries, date: draft.date },
        deadline: addDays(date, 30),
      });
    } else {
      // NPC 皇帝自动批准 → 立即执行（去重：同一人只执行最后一条）
      const deduped = new Map<string, typeof imperialEntries[number]>();
      for (const entry of imperialEntries) {
        deduped.set(entry.appointeeId, entry);
      }
      for (const entry of deduped.values()) {
        executeAppoint(entry.postId, entry.appointeeId, entry.legalAppointerId, entry.vacateOldPost);
        autoTransferChildrenAfterAppoint(entry.postId, entry.legalAppointerId, true);
      }
    }
  }

  npcStore.setDraftPlan(null);
}

/** 步骤 2：超时 PlayerTask 兜底执行（每天检测） */
function handleExpiredPlayerTasks(date: GameDate): void {
  const npcStore = useNpcStore.getState();
  const expired = npcStore.getExpiredTasks(date);

  for (const task of expired) {
    if (task.standing) continue; // 常驻任务不过期
    if (task.type === 'appoint-approve') {
      // 皇帝超时未审批 → 自动批准执行
      const data = task.data as { entries: TransferPlan['entries'] };
      for (const entry of data.entries) {
        executeAppoint(entry.postId, entry.appointeeId, entry.legalAppointerId, entry.vacateOldPost);
        autoTransferChildrenAfterAppoint(entry.postId, entry.legalAppointerId, true);
      }
    } else if (task.type === 'review') {
      // 玩家超时未处理考课 → 自动执行所有罢免
      const data = task.data as { entries: ReviewEntry[] };
      for (const entry of data.entries) {
        const post = useTerritoryStore.getState().findPost(entry.postId);
        const tpl = post ? positionMap.get(post.templateId) : null;
        executeDismiss(entry.postId, entry.legalAppointerId, tpl?.grantsControl ? { vacateOnly: true } : undefined);
      }
    } else if (task.type === 'callToArms') {
      // 召集参战超时 → 自动接受
      const data = task.data as { warId: string; side: 'attacker' | 'defender' };
      executeJoinWar(task.actorId, data.warId, data.side);
    } else if (task.type === 'treasury-approve') {
      // 玩家超时未审批国库草案 → 必定通过（不走概率裁决，避免 NPC 替玩家做决定）
      const data = task.data as { submissions: TreasurySubmission[] };
      for (const sub of data.submissions) {
        for (const entry of sub.entries) {
          executeTreasuryEntry(entry, task.actorId);
        }
      }
    } else if (task.type === 'deploy-approve') {
      // 玩家超时未审批调兵草案 → 必定通过（不走概率裁决，避免 NPC 替玩家做决定）
      const data = task.data as { submissions: DeploySubmission[] };
      for (const sub of data.submissions) {
        for (const entry of sub.entries) {
          executeDeployEntry(entry, task.actorId);
        }
      }
    } else {
      // 通用 behavior dispatch（用于未来 push-task 行为）
      const behavior = getAllBehaviors().find(b => b.id === task.type);
      if (behavior) {
        const actor = useCharacterStore.getState().getCharacter(task.actorId);
        if (actor) {
          behavior.executeAsNpc(actor, task.data, buildNpcContext());
        }
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

// ── 岗位门控检查 ──────────────────────────────────────────

/** 检查 actor 是否通过行为的岗位门控 */
function passesPostGate(actor: import('@engine/character/types').Character, behavior: NpcBehavior, centralPosts: import('@engine/territory/types').Post[]): boolean {
  if (!behavior.requiredTemplateIds?.length) return true;

  const { holderIndex, postIndex } = useTerritoryStore.getState();
  const postIds = holderIndex.get(actor.id) ?? [];
  return (
    postIds.some(pid => {
      const p = postIndex.get(pid);
      return p && behavior.requiredTemplateIds!.includes(p.templateId);
    }) ||
    centralPosts.some(
      p => p.holderId === actor.id && behavior.requiredTemplateIds!.includes(p.templateId)
    )
  );
}

// ── 皇帝行为监测 ──────────────────────────────────────────

const EMPEROR_DEBUG_ID = 'char-yizong';

function logEmperor(tag: string, msg: string): void {
  console.log(`[皇帝AI] [${tag}] ${msg}`);
}

// ── 日结入口 ───────────────────────────────────────────────

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

  if (isPlayer && task.behavior.playerMode === 'standing') {
    // 常驻任务：若同 type 的 standing task 不存在则创建，已存在则更新 data
    const npcStore = useNpcStore.getState();
    const existing = npcStore.playerTasks.find(
      t => t.type === task.behavior.id && t.standing,
    );
    if (!existing) {
      const playerTask = task.behavior.generatePlayerTask?.(actor, task.data, ctx);
      if (playerTask) {
        useNpcStore.getState().addPlayerTask(playerTask);
      }
    }
    return;
  }

  // NPC 执行 / auto-execute
  task.behavior.executeAsNpc(actor, task.data, ctx);
}

/**
 * NPC Engine 日结入口（每天调用）。
 *
 * 流程：
 * 1. 前置：处理铨选草稿提交 + 超时兜底（每天检测）
 * 2. 第一遍：forced 任务（考课等，每天检测，会改变世界状态）
 * 3. 重建快照（forced 任务可能产生空缺等变化）
 * 4. 第二遍：normal 任务
 *    - daily 行为（push-task）：每天对所有 actors 执行 generateTask
 *    - monthly-slot 行为（skip）：仅在哈希槽位日执行，品级越高频率越高
 */
export function runDailyNpcEngine(date: GameDate): void {
  // ── 前置步骤（每天） ──
  handleDraftSubmission(date);
  handleExpiredPlayerTasks(date);

  // ── 第一遍：forced 任务（每天检测） ──
  {
    const ctx1 = buildNpcContext();
    const actors1 = collectActors(ctx1.characters, ctx1.rankLevelCache);
    const behaviors1 = getAllBehaviors();

    for (const actor of actors1) {
      for (const behavior of behaviors1) {
        if (!passesPostGate(actor, behavior, ctx1.centralPosts)) continue;

        const result = behavior.generateTask(actor, ctx1);
        if (actor.id === EMPEROR_DEBUG_ID && result?.forced) {
          logEmperor('forced触发', `${behavior.id} data=${JSON.stringify(result.data).slice(0, 120)}`);
        }
        if (!result || !result.forced) continue;
        executeTask(actor, { behavior, data: result.data }, ctx1);
      }
    }
  }

  // ── 重建快照（forced 任务可能改变了世界状态） ──
  const ctx = buildNpcContext();
  const actors = collectActors(ctx.characters, ctx.rankLevelCache);
  const behaviors = getAllBehaviors();

  // ── 第二遍：normal 任务（按 schedule 分流） ──
  for (const actor of actors) {
    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) continue;

    let maxActions = calcMaxActions(personality);
    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    if (rankLevel < 9) maxActions = Math.min(maxActions, 1);

    // 清理失效的 standing 任务（玩家失去角色资格时）
    if (actor.id === ctx.playerId) {
      const npcStore = useNpcStore.getState();
      for (const st of npcStore.playerTasks.filter(t => t.standing && t.actorId === actor.id)) {
        const beh = behaviors.find(b => b.id === st.type);
        if (!beh || !passesPostGate(actor, beh, ctx.centralPosts)) {
          npcStore.removePlayerTask(st.id);
          continue;
        }
        const result = beh.generateTask(actor, ctx);
        if (!result) npcStore.removePlayerTask(st.id);
      }
    }

    // 收集 normal 任务，分为行政职责和自愿行为
    const adminTasks: Array<{ behavior: NpcBehavior; data: unknown }> = [];
    const voluntaryTasks: Array<{ behavior: NpcBehavior; data: unknown; weight: number }> = [];

    for (const behavior of behaviors) {
      // 有 appoint-approve 任务等待审批时跳过铨选（避免重复拟草）
      if (behavior.id === 'appoint' && useNpcStore.getState().playerTasks.some(t => t.type === 'appoint-approve')) continue;

      if (!passesPostGate(actor, behavior, ctx.centralPosts)) continue;

      // ── 调度频率过滤 ──
      const isPlayer = actor.id === ctx.playerId;
      const schedule = getEffectiveSchedule(behavior, isPlayer);
      if (schedule === 'monthly-slot') {
        // 仅在哈希槽位日执行
        if (!isSlotDay(date.day, date.month, actor.id, behavior.id, rankLevel)) continue;
      }
      // daily 行为：每天都执行 generateTask

      const result = behavior.generateTask(actor, ctx);
      if (!result || result.forced) continue;

      if (actor.id === EMPEROR_DEBUG_ID) {
        const cat = (behavior.playerMode === 'push-task' || behavior.playerMode === 'standing') ? '行政' : `自愿(w=${result.weight})`;
        logEmperor('任务生成', `${behavior.id} [${cat}] data=${JSON.stringify(result.data).slice(0, 120)}`);
      }

      if (behavior.playerMode === 'push-task' || behavior.playerMode === 'standing') {
        // 行政职责 + 常驻任务：不受 maxActions 限制
        adminTasks.push({ behavior, data: result.data });
      } else {
        // 自愿行为（宣战/效忠等）：受 maxActions 限制
        voluntaryTasks.push({ behavior, data: result.data, weight: result.weight });
      }
    }

    // 行政职责：无条件执行
    for (const task of adminTasks) {
      if (actor.id === EMPEROR_DEBUG_ID) logEmperor('执行-行政', task.behavior.id);
      executeTask(actor, task, ctx);
    }

    // 自愿行为：按权重排序，每个 action slot 独立按概率判定
    // weight 直接作为百分比概率（weight=10 → 10%，weight>=100 → 必定执行）
    if (maxActions > 0 && voluntaryTasks.length > 0) {
      voluntaryTasks.sort((a, b) => b.weight - a.weight);
      if (actor.id === EMPEROR_DEBUG_ID) {
        logEmperor('自愿候选', `maxActions=${maxActions}, 候选=[${voluntaryTasks.map(t => `${t.behavior.id}(${t.weight})`).join(', ')}]`);
      }
      let slotsUsed = 0;
      for (const task of voluntaryTasks) {
        if (slotsUsed >= maxActions) break;
        const chance = Math.min(task.weight, 100) / 100;
        if (random() < chance) {
          if (actor.id === EMPEROR_DEBUG_ID) logEmperor('执行-自愿', `${task.behavior.id} (weight=${task.weight}, chance=${(chance * 100).toFixed(0)}%)`);
          executeTask(actor, task, ctx);
          slotsUsed++;
        } else {
          if (actor.id === EMPEROR_DEBUG_ID) logEmperor('跳过-自愿', `${task.behavior.id} (weight=${task.weight}, 骰子未通过)`);
        }
      }
    }
  }
}
