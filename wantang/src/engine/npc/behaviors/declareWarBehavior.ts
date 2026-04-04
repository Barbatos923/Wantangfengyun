// ===== NPC 宣战行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import type { CasusBelli, WarContext } from '@engine/military/types';
import { evaluateAllCasusBelli } from '@engine/military/warCalc';
import { executeDeclareWar } from '@engine/interaction';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { registerBehavior } from './index';

// ── 辅助：获取 defender 直接控制的州级领地 ID ────────────

function getControlledZhouIds(
  defenderId: string,
  territories: NpcContext['territories'],
): string[] {
  const result: string[] = [];
  for (const t of territories.values()) {
    if (t.tier !== 'zhou') continue;
    const mainPost = t.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (mainPost?.holderId === defenderId) {
      result.push(t.id);
    }
  }
  return result;
}

// ── 辅助：检查角色是否已在战争中 ────────────────────────

function isAtWar(charId: string, activeWars: NpcContext['activeWars']): boolean {
  return activeWars.some(w => w.attackerId === charId || w.defenderId === charId);
}

// ── 行为定义 ────────────────────────────────────────────

interface DeclareWarData {
  targetId: string;
  casusBelli: CasusBelli;
  targetTerritoryIds: string[];
  cost: { prestige: number; legitimacy: number };
}

export const declareWarBehavior: NpcBehavior<DeclareWarData> = {
  id: 'declareWar',
  playerMode: 'skip', // 玩家自己从交互菜单发起

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<DeclareWarData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    // 品级低的角色不太主动宣战
    if (rankLevel < 13) return null; // 六品以下不宣战
    // 无兵力不宣战
    if (ctx.getMilitaryStrength(actor.id) === 0) return null;

    let bestWeight = 0;
    let bestData: DeclareWarData | null = null;

    // 扫描所有其他统治者作为潜在目标
    for (const target of ctx.characters.values()) {
      if (!target.alive || !target.isRuler) continue;
      if (target.id === actor.id) continue;
      // 不对自己的附庸以外且效忠自己的人宣战（附庸可打独立战争）
      if (target.overlordId === actor.id) continue;
      // 已经在和该目标交战，跳过
      if (ctx.activeWars.some(w =>
        (w.attackerId === actor.id && w.defenderId === target.id) ||
        (w.attackerId === target.id && w.defenderId === actor.id)
      )) continue;

      // 评估宣战理由
      const warCtx: WarContext = {
        attackerId: actor.id,
        defenderId: target.id,
        era: ctx.era,
        territories: ctx.territories,
        characters: ctx.characters,
      };
      const evals = evaluateAllCasusBelli(warCtx);
      const usable = evals.filter(e => e.failureReason === null);
      if (usable.length === 0) continue;

      // 资源检查：能否负担得起
      const affordableEvals = usable.filter(e => {
        return actor.resources.prestige + e.cost.prestige >= 0 &&
               actor.resources.legitimacy + e.cost.legitimacy >= 0;
      });
      if (affordableEvals.length === 0) continue;

      // 目标领地：选最近的一个州
      const allTargetZhou = getControlledZhouIds(target.id, ctx.territories);
      if (allTargetZhou.length === 0) continue;
      // 简单取第一个（后续可按距离优化）
      const targetTerritoryIds = [allTargetZhou[0]];

      // ── 通用权重因子（与理由无关） ──
      const opinion = ctx.getOpinion(actor.id, target.id);
      const myStr = ctx.getMilitaryStrength(actor.id);
      const theirStr = ctx.getMilitaryStrength(target.id);
      const ratio = theirStr > 0 ? myStr / theirStr : 2;

      // 对每个可用理由单独计算 weight，取最高的 (目标, 理由) 组合
      for (const cb of affordableEvals) {
        const cbCost = Math.abs(cb.cost.prestige) + Math.abs(cb.cost.legitimacy);

        // ── 理由专属人格偏好 ──
        const cbModifiers: WeightModifier[] = [];
        switch (cb.id) {
          case 'independence':
            // 忠诚的人不愿背叛领主；大胆的人敢于独立
            cbModifiers.push({ label: '忠诚抑制', add: -personality.honor * 15 });
            cbModifiers.push({ label: '独立渴望', add: personality.boldness * 5 });
            break;
          case 'annexation':
            // 贪婪/野心驱动领土扩张；好战者更积极
            cbModifiers.push({ label: '领土野心', add: personality.greed * 10 });
            cbModifiers.push({ label: '好战', add: personality.boldness * 5 });
            break;
          case 'deJureClaim':
            // 法理宣称：理性的人更倾向用合法手段
            cbModifiers.push({ label: '法理执念', add: personality.rationality * 5 });
            break;
        }

        const modifiers: WeightModifier[] = [
          // 基础倾向（默认不好战，需要强动机才会宣战）
          { label: '基础', add: -3 },
          // 通用人格驱动
          { label: '胆识', add: personality.boldness * 8 },
          { label: '理性', add: -personality.rationality * 8 },
          { label: '复仇心', add: personality.vengefulness * 5 },

          // 理由专属偏好
          ...cbModifiers,

          // 好感驱动
          ...(opinion < -10
            ? [{ label: '仇恨', add: (Math.abs(opinion) - 10) * 0.3 }]
            : opinion > 10 && opinion <= 20
              ? [{ label: '好感抑制', add: -(opinion - 10) * 0.5 }]
              : []),

          // 兵力对比
          ...(ratio >= 2 ? [{ label: '兵力碾压', add: 5 }]
            : ratio >= 1.5 ? [{ label: '兵力优势', add: 3 }]
            : ratio < 0.5 ? [{ label: '实力悬殊', add: -10 }]
            : ratio < 0.8 ? [{ label: '兵力劣势', add: -3 }]
            : []),

          // 成本惩罚：每 10 点成本扣 1 weight
          ...(cbCost > 0 ? [{ label: '成本', add: -cbCost * 0.1 }] : []),

          // 硬切（factor=0）
          ...(opinion > 20 ? [{ label: '朋友', factor: 0 }] : []),
          ...(actor.resources.money < 0 && actor.resources.grain < 0
            ? [{ label: '破产', factor: 0 }] : []),
          ...(isAtWar(actor.id, ctx.activeWars)
            ? [{ label: '已在战争中', factor: 0.3 }] : []),
        ];

        const weight = calcWeight(modifiers);

        if (weight > bestWeight) {
          bestWeight = weight;
          bestData = {
            targetId: target.id,
            casusBelli: cb.id,
            targetTerritoryIds,
            cost: cb.cost,
          };
        }
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: DeclareWarData, _ctx: NpcContext) {
    const date = useTurnManager.getState().currentDate;
    executeDeclareWar(
      actor.id,
      data.targetId,
      data.casusBelli,
      data.targetTerritoryIds,
      date,
      data.cost,
    );
  },
};

registerBehavior(declareWarBehavior);
