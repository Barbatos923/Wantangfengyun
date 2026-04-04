// ===== NPC 调兵草拟行为 =====
// 草拟人（都知兵马使/兵部尚书/ruler自身）评估局势，
// 生成部署方案存入 NpcStore.deploymentDrafts，等待批准人处理。

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
function getCampaignArmyIds(): Set<string> {
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
  playerMode: 'skip',           // 草拟是自主行为，不推任务给玩家
  schedule: 'monthly-slot',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<DeployDraftData> | null {
    if (!actor.alive) return null;

    // 确定 actor 是谁的草拟人
    const result = resolveDeployDrafter(actor.id, ctx.territories, ctx.centralPosts);
    if (!result) return null;

    const { rulerId } = result;

    // 如果已有待批草案，不重复生成
    const existing = useNpcStore.getState().deploymentDrafts.get(rulerId);
    if (existing && existing.length > 0) return null;

    // 获取 ruler 名下的军队
    const milStore = useMilitaryStore.getState();
    const armies = milStore.getArmiesByOwner(rulerId);
    if (armies.length === 0) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const campaignArmyIds = getCampaignArmyIds();

    const entries = planDeployments(
      rulerId,
      armies,
      milStore.battalions,
      ctx.territories,
      ctx.characters,
      ctx.getOpinion,
      campaignArmyIds,
      personality,
    );

    if (entries.length === 0) return null;

    // 权重：基础 + 边境威胁加成
    const threats = assessBorderThreats(
      rulerId,
      ctx.territories,
      ctx.characters,
      ctx.getOpinion,
    );
    const maxThreat = threats.length > 0 ? threats[0].threatLevel : 0;

    const modifiers: WeightModifier[] = [
      { label: '基础', add: 20 },
      { label: '边境威胁', add: maxThreat },
      { label: '理性', add: personality.rationality * 15 },
    ];

    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    return {
      data: { entries, rulerId },
      weight,
    };
  },

  executeAsNpc(_actor: Character, data: DeployDraftData, _ctx: NpcContext): void {
    // 存入 NpcStore 缓冲区，等待 deploy-approve 处理
    useNpcStore.getState().addDeploymentDraft(data.rulerId, data.entries);
  },
};

registerBehavior(deployDraftBehavior);
