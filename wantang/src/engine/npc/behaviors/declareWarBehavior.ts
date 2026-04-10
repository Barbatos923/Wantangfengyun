// ===== NPC 宣战行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import type { CasusBelli, WarContext } from '@engine/military/types';
import { evaluateAllCasusBelli } from '@engine/military/warCalc';
import { executeDeclareWar } from '@engine/interaction';
import { useTurnManager } from '@engine/TurnManager';
import { useStoryEventBus, type StoryEvent } from '@engine/storyEventBus';
import { positionMap } from '@data/positions';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
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
  return activeWars.some(w => isWarParticipant(charId, w));
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

      // 停战检查
      const truce = ctx.hasTruce(actor.id, target.id);

      // 评估宣战理由
      const warCtx: WarContext = {
        attackerId: actor.id,
        defenderId: target.id,
        era: ctx.era,
        territories: ctx.territories,
        characters: ctx.characters,
        hasTruce: truce,
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
        const cbCost = Math.abs(cb.cost.prestige) * 0.5 + Math.abs(cb.cost.legitimacy) * 4;

        // ── 理由专属人格偏好 ──
        const cbModifiers: WeightModifier[] = [];
        switch (cb.id) {
          case 'independence':
            // 独立战争需要极强动机才会发起
            cbModifiers.push({ label: '独立基础', add: -15 });
            cbModifiers.push({ label: '忠诚抑制', add: -personality.honor * 15 });
            cbModifiers.push({ label: '独立渴望', add: personality.boldness * 5 });
            // 好感影响大：对领主的仇恨是独立核心动机（opinion × -0.5）
            cbModifiers.push({ label: '好感', add: -opinion * 0.5 });
            break;
          case 'annexation':
            // 贪婪/野心驱动领土扩张；好战者更积极
            cbModifiers.push({ label: '领土野心', add: personality.greed * 10 });
            cbModifiers.push({ label: '好战', add: personality.boldness * 5 });
            // 好感影响小：兼并主要看利益不看感情（opinion × -0.15）
            cbModifiers.push({ label: '好感', add: -opinion * 0.15 });
            break;
          case 'deJureClaim':
            // 法理宣称：有法理依据，更容易发起
            cbModifiers.push({ label: '法理基础', add: 5 });
            cbModifiers.push({ label: '法理执念', add: personality.rationality * 5 });
            // 好感影响中等：有法理依据，感情影响适中（opinion × -0.2）
            cbModifiers.push({ label: '好感', add: -opinion * 0.2 });
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

          // 兵力对比
          ...(ratio >= 2 ? [{ label: '兵力碾压', add: 5 }]
            : ratio >= 1.5 ? [{ label: '兵力优势', add: 3 }]
            : ratio < 0.5 ? [{ label: '实力悬殊', add: -10 }]
            : ratio < 0.8 ? [{ label: '兵力劣势', add: -3 }]
            : []),

          // 成本惩罚：每 10 点成本扣 1 weight
          ...(cbCost > 0 ? [{ label: '成本', add: -cbCost * 0.1 }] : []),

          // 停战期惩罚：NPC 基本不会违反停战
          ...(truce ? [{ label: '停战期', add: -20 }] : []),

          // 硬切（factor=0）
          ...(opinion > 20 ? [{ label: '朋友', factor: 0 }] : []),
          ...(() => {
            const tt = ctx.totalTreasury.get(actor.id);
            const broke = tt ? (tt.money < 0 && tt.grain < 0) : (actor.resources.money < 0 && actor.resources.grain < 0);
            return broke ? [{ label: '破产', factor: 0 }] : [];
          })(),
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

  executeAsNpc(actor: Character, data: DeclareWarData, ctx: NpcContext) {
    const date = useTurnManager.getState().currentDate;
    const ok = executeDeclareWar(
      actor.id,
      data.targetId,
      data.casusBelli,
      data.targetTerritoryIds,
      date,
      data.cost,
    );
    if (!ok) return;

    // 玩家是被宣战方 → 纯通知
    if (data.targetId === ctx.playerId) {
      const CB_LABELS: Record<string, string> = { annexation: '武力兼并', claim: '法理宣称', independence: '独立' };
      const cbLabel = CB_LABELS[data.casusBelli] ?? data.casusBelli;
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '遭到宣战',
        description: `${actor.name}以「${cbLabel}」为由向你宣战！`,
        actors: [
          { characterId: actor.id, role: '宣战者' },
          { characterId: data.targetId, role: '你' },
        ],
        options: [
          {
            label: '知道了',
            description: '准备迎战。',
            effects: [],
            effectKey: 'noop:notification',
            onSelect: () => { /* 已执行 */ },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
    }
  },
};

registerBehavior(declareWarBehavior);
