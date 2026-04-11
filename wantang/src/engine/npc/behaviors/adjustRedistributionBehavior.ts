// ===== NPC 调整回拨率行为（最后手段） =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { evaluateAppeasementTargets } from '../policyCalc';
import { executeRedistributionChange } from '@engine/interaction';
import { useStoryEventBus } from '@engine/storyEventBus';
import type { StoryEvent } from '@engine/storyEventBus';
import { registerBehavior } from './index';
import { debugLog } from '@engine/debugLog';

interface AdjustRedistributionData {
  delta: number; // +10 放权 / -10 集权
  currentRate: number;
}

export const adjustRedistributionBehavior: NpcBehavior<AdjustRedistributionData> = {
  id: 'adjustRedistribution',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<AdjustRedistributionData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const targets = evaluateAppeasementTargets(actor.id, ctx);
    if (targets.length === 0) return null;

    // 平均 urgency
    const avgUrgency = targets.reduce((sum, t) => sum + t.urgency, 0) / targets.length;
    const currentRate = actor.redistributionRate;

    // 放权：多臣属同时不满 → 提高回拨率
    if (avgUrgency > 20 && currentRate < 80) {
      const modifiers: WeightModifier[] = [
        { label: '基础', add: 5 },
        { label: '平均紧迫度', add: avgUrgency * 0.2 },
        { label: '荣誉', add: personality.honor * 2 },
      ];
      return {
        data: { delta: 10, currentRate },
        weight: calcWeight(modifiers),
      };
    }

    // 集权：臣属普遍安全 → 降低回拨率
    if (avgUrgency < -10 && currentRate > 20) {
      const modifiers: WeightModifier[] = [
        { label: '基础', add: 5 },
        { label: '平均安全度', add: Math.abs(avgUrgency) * 0.2 },
        { label: '贪婪', add: personality.greed * 2 },
      ];
      return {
        data: { delta: -10, currentRate },
        weight: calcWeight(modifiers),
      };
    }

    return null;
  },

  executeAsNpc(actor: Character, data: AdjustRedistributionData, ctx: NpcContext) {
    const newRate = data.currentRate + data.delta;
    debugLog('policy', `[政策] ${actor.name}：回拨率 ${data.currentRate}% → ${newRate}%`);
    const isPlayerVassal = ctx.playerId
      ? ctx.characters.get(ctx.playerId)?.overlordId === actor.id
      : false;

    // 有臣属是玩家 → 信息型通知 + 执行
    if (isPlayerVassal && ctx.playerId) {
      const isBenefit = data.delta > 0;
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '回拨率调整',
        description: isBenefit
          ? `${actor.name}加恩，将回拨率从 ${data.currentRate}% 提至 ${newRate}%。`
          : `${actor.name}将回拨率从 ${data.currentRate}% 降为 ${newRate}%。`,
        actors: [
          { characterId: actor.id, role: '领主' },
          { characterId: ctx.playerId, role: '你' },
        ],
        options: [
          {
            label: isBenefit ? '谢恩' : '知悉',
            description: isBenefit ? '领主加恩，欣然受命。' : '接受回拨率调整。',
            effects: [
              { label: '回拨率', value: data.delta, type: data.delta > 0 ? 'positive' : 'negative' },
            ],
            effectKey: 'adjustRedistribution:acknowledge',
            effectData: { actorId: actor.id, delta: data.delta },
            onSelect: () => {
              executeRedistributionChange(actor.id, data.delta);
            },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    executeRedistributionChange(actor.id, data.delta);
  },
};

registerBehavior(adjustRedistributionBehavior);
