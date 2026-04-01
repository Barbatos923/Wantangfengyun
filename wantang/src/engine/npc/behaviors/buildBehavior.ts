// ===== NPC 建设行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { ALL_BUILDINGS, type BuildingDef } from '@data/buildings';
import { executeBuild } from '@engine/interaction/buildAction';
import { positionMap } from '@data/positions';
import { registerBehavior } from './index';

// ── 辅助 ────────────────────────────────────────────────

interface BuildOption {
  territoryId: string;
  slotIndex: number;
  building: BuildingDef;
  targetLevel: number;
  moneyCost: number;
  grainCost: number;
  duration: number;
}

/** 找到角色领地内最佳的建筑选项 */
function findBestBuildOption(actorId: string, ctx: NpcContext): BuildOption | null {
  let best: BuildOption | null = null;
  let bestValue = -1;

  for (const t of ctx.territories.values()) {
    if (t.tier !== 'zhou') continue;
    // 检查角色是否控制此领地
    const mainPost = t.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (mainPost?.holderId !== actorId) continue;

    // 检查是否有在建工程（一次只建一个）
    if (t.constructions.length > 0) continue;

    // 遍历建筑槽位
    for (let i = 0; i < t.buildings.length; i++) {
      const slot = t.buildings[i];
      const currentLevel = slot.level;

      // 找可建/可升级的建筑
      for (const bDef of ALL_BUILDINGS) {
        if (bDef.allowedType !== 'any' && bDef.allowedType !== t.territoryType) continue;

        let targetLevel: number;
        if (slot.buildingId === null) {
          targetLevel = 1; // 新建
        } else if (slot.buildingId === bDef.id && currentLevel < bDef.maxLevel) {
          targetLevel = currentLevel + 1; // 升级
        } else {
          continue;
        }

        const moneyCost = bDef.costMoney * targetLevel;
        const grainCost = bDef.costGrain * targetLevel;

        // 评估建筑价值（简单启发：经济收益优先）
        const value = bDef.moneyPerLevel + bDef.grainPerLevel * 0.5 + bDef.troopsPerLevel * 0.3;

        if (value > bestValue) {
          bestValue = value;
          best = {
            territoryId: t.id,
            slotIndex: i,
            building: bDef,
            targetLevel,
            moneyCost,
            grainCost,
            duration: bDef.constructionMonths,
          };
        }
      }
    }
  }

  return best;
}

// ── 行为定义 ────────────────────────────────────────────

export const buildBehavior: NpcBehavior<BuildOption> = {
  id: 'build',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<BuildOption> | null {
    if (!actor.isRuler) return null;

    const option = findBestBuildOption(actor.id, ctx);
    if (!option) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const isAtWar = ctx.activeWars.some(
      w => w.attackerId === actor.id || w.defenderId === actor.id,
    );

    const modifiers: WeightModifier[] = [
      // 基础：和平种田
      { label: '基础', add: 15 },

      // 人格驱动
      { label: '勤政', add: personality.energy * 15 },
      { label: '理性', add: personality.rationality * 15 },
      { label: '贪财', add: -personality.greed * 20 },

      // 状态驱动
      ...(isAtWar ? [{ label: '战时无心种田', add: -20 }] : []),

      // 硬切：资金不足（需留余钱）
      ...(actor.resources.money < option.moneyCost * 1.5
        ? [{ label: '资金不够', factor: 0 }] : []),
      ...(actor.resources.grain < option.grainCost * 1.5
        ? [{ label: '粮食不够', factor: 0 }] : []),
    ];

    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    return { data: option, weight };
  },

  executeAsNpc(actor: Character, data: BuildOption, _ctx: NpcContext) {
    executeBuild(
      actor.id,
      data.territoryId,
      data.slotIndex,
      data.building.id,
      data.targetLevel,
      data.moneyCost,
      data.grainCost,
      data.duration,
    );
  },
};

registerBehavior(buildBehavior);
