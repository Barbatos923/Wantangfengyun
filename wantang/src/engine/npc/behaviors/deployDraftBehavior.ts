// ===== NPC 调兵草拟行为 =====
// 草拟人（都知兵马使/兵部尚书/国司马/录事参军）评估边境威胁，
// 生成部署方案存入 NpcStore.deployDrafts，等待批准人处理。
//
// playerMode: 'skip' —— 玩家草拟入口走 UI 面板（DrafterTokenOverlay + submitDeployDraftAction），
// 不挂常驻 PlayerTask，避免 standing 模式分桶吞 NPC weight 的 bug。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import type { Character } from '@engine/character/types';
import { calcWeight } from '../types';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useNpcStore } from '../NpcStore';
import {
  resolveDeployDrafter,
  assessBorderThreats,
  planDeployments,
  type DeploymentEntry,
} from '@engine/military/deployCalc';
import { registerBehavior } from './index';

// ── 数据 ────────────────────────────────────────────────

interface DeployDraftData {
  entries: DeploymentEntry[];
  rulerId: string;
}

// ── 辅助函数 ────────────────────────────────────────────

/** 收集已编入行营的军队 ID */
export function getCampaignArmyIds(): Set<string> {
  const ids = new Set<string>();
  for (const c of useWarStore.getState().campaigns.values()) {
    for (const aid of c.armyIds) ids.add(aid);
    for (const ia of c.incomingArmies) ids.add(ia.armyId);
  }
  return ids;
}

// ── 行为定义 ────────────────────────────────────────────

export const deployDraftBehavior: NpcBehavior<DeployDraftData> = {
  id: 'deploy-draft',
  schedule: 'monthly-slot',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<DeployDraftData> | null {
    if (!actor.alive) return null;

    // 确定 actor 是谁的草拟人
    const result = resolveDeployDrafter(actor.id, ctx.territories, ctx.centralPosts);
    if (!result) return null;
    const { rulerId } = result;

    // ── 三层 in-flight 锁 ──
    // 1. 该草拟人在 CD 中
    if (useNpcStore.getState().isDeployDrafterCooldown(actor.id, ctx.date)) return null;
    // 2. 该草拟人已有待批 submission（buffer 中）
    const existing = useNpcStore.getState().deployDrafts.get(rulerId);
    if (existing?.some((s) => s.drafterId === actor.id)) return null;
    // 3. ruler 已有 pending 玩家审批任务
    const hasPlayerTask = useNpcStore.getState().playerTasks.some(
      (t) => t.type === 'deploy-approve' && t.actorId === rulerId,
    );
    if (hasPlayerTask) return null;

    // 战时由战争引擎/行营系统调度，deploy draft 不参与
    const inWar = ctx.activeWars.some(
      (w) =>
        w.attackerId === rulerId
        || w.defenderId === rulerId
        || w.attackerParticipants.includes(rulerId)
        || w.defenderParticipants.includes(rulerId),
    );
    if (inWar) return null;

    // 获取 ruler 名下的军队
    const milStore = useMilitaryStore.getState();
    const armies = milStore.getArmiesByOwner(rulerId);
    if (armies.length === 0) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const campaignArmyIds = getCampaignArmyIds();
    const entries = planDeployments(
      rulerId, armies, milStore.battalions,
      ctx.territories, ctx.characters, ctx.getOpinion,
      campaignArmyIds, personality,
      milStore.armies, // 全部军队，用于敌方驻军兵力计算
    );
    if (entries.length === 0) return null;

    // ── 紧迫度档位（按最大边境威胁分档） ──
    const threats = assessBorderThreats(
      rulerId, ctx.territories, ctx.characters, ctx.getOpinion,
      milStore.armies, milStore.battalions,
    );
    const maxThreat = threats.length > 0 ? threats[0].threatLevel : 0;

    let urgencyWeight: number;
    if (maxThreat >= 50) urgencyWeight = 100;       // 高威胁，必触发
    else if (maxThreat >= 25) urgencyWeight = 60;   // 中威胁，行政职责
    else urgencyWeight = 20;                        // 低威胁/常规调动，自愿

    const modifiers: WeightModifier[] = [
      { label: '威胁紧迫度', add: urgencyWeight },
      { label: '理性', add: personality.rationality * 15 },
    ];
    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    // 中威胁以上视为行政职责，forced 触发不与自愿行为竞争 maxActions
    const forced = urgencyWeight >= 60;

    return { data: { rulerId, entries }, weight, forced };
  },

  executeAsNpc(actor: Character, data: DeployDraftData, _ctx: NpcContext): void {
    useNpcStore.getState().addDeployDraft(data.rulerId, actor.id, data.entries);
  },
};

registerBehavior(deployDraftBehavior);
