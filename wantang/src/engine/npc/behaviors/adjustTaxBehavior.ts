// ===== NPC 调整赋税等级行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { evaluateAppeasementTargets, APPEASE_THRESHOLD, CENTRALIZE_THRESHOLD } from '../policyCalc';
import { executeTaxChange } from '@engine/interaction';
import { useStoryEventBus } from '@engine/storyEventBus';
import type { StoryEvent } from '@engine/storyEventBus';
import { registerBehavior } from './index';
import { debugLog } from '@engine/debugLog';

interface AdjustTaxData {
  vassalId: string;
  delta: number; // +1 集权 / -1 放权
  currentLevel: number;
}

export const adjustTaxBehavior: NpcBehavior<AdjustTaxData> = {
  id: 'adjustTax',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<AdjustTaxData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const targets = evaluateAppeasementTargets(actor.id, ctx);
    if (targets.length === 0) return null;

    // 排序：urgency 从高到低
    targets.sort((a, b) => b.urgency - a.urgency);

    const maxUrgency = targets[0].urgency;
    const minUrgency = targets[targets.length - 1].urgency;

    // 优先放权（讨好不满臣属），但 capital 国库紧张时不降税
    const capitalMoney = ctx.capitalTreasury.get(actor.id)?.money ?? actor.resources.money;
    if (maxUrgency > APPEASE_THRESHOLD && capitalMoney >= 20000) {
      for (const t of targets) {
        if (t.urgency <= APPEASE_THRESHOLD) break;
        const vassal = ctx.characters.get(t.vassalId);
        if (!vassal || !vassal.isRuler) continue; // 无地臣属无需调税
        const level = vassal.centralization ?? 2;
        if (level <= 1) continue; // 已经最低

        const modifiers: WeightModifier[] = [
          { label: '基础', add: 20 },
          { label: '紧迫度', add: t.urgency * 0.5 },
          { label: '荣誉', add: personality.honor * 4 },
        ];
        return {
          data: { vassalId: t.vassalId, delta: -1, currentLevel: level },
          weight: calcWeight(modifiers),
        };
      }
    }

    // 集权（安全臣属提税）
    if (minUrgency < CENTRALIZE_THRESHOLD) {
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        if (t.urgency >= CENTRALIZE_THRESHOLD) break;
        const vassal = ctx.characters.get(t.vassalId);
        if (!vassal || !vassal.isRuler) continue;
        const level = vassal.centralization ?? 2;
        if (level >= 4) continue;

        const modifiers: WeightModifier[] = [
          { label: '基础', add: 20 },
          { label: '安全度', add: Math.abs(t.urgency) * 0.5 },
          { label: '贪婪', add: personality.greed * 4 },
        ];
        return {
          data: { vassalId: t.vassalId, delta: 1, currentLevel: level },
          weight: calcWeight(modifiers),
        };
      }
    }

    return null;
  },

  executeAsNpc(actor: Character, data: AdjustTaxData, ctx: NpcContext) {
    const TAX_LABELS: Record<number, string> = { 1: '放任', 2: '一般', 3: '严控', 4: '压榨' };
    const newLevel = data.currentLevel + data.delta;
    const vassalName = ctx.characters.get(data.vassalId)?.name ?? data.vassalId;
    debugLog('policy', `[政策] ${actor.name} → ${vassalName}：赋税 ${TAX_LABELS[data.currentLevel]}(${data.currentLevel}) → ${TAX_LABELS[newLevel]}(${newLevel})`);

    // 玩家是目标臣属 → 信息型通知
    if (data.vassalId === ctx.playerId) {
      const isBenefit = data.delta < 0;
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '赋税调整',
        description: isBenefit
          ? `${actor.name}加恩，将你的赋税等级从「${TAX_LABELS[data.currentLevel] ?? ''}」降为「${TAX_LABELS[newLevel] ?? ''}」。`
          : `${actor.name}将你的赋税等级从「${TAX_LABELS[data.currentLevel] ?? ''}」提高为「${TAX_LABELS[newLevel] ?? ''}」。`,
        actors: [
          { characterId: actor.id, role: '领主' },
          { characterId: data.vassalId, role: '你' },
        ],
        options: [
          {
            label: isBenefit ? '谢恩' : '知悉',
            description: isBenefit ? '领主加恩，欣然受命。' : '接受赋税调整。',
            effects: [
              { label: '赋税等级', value: data.delta, type: data.delta > 0 ? 'negative' : 'positive' },
            ],
            effectKey: 'adjustTax:acknowledge',
            effectData: { vassalId: data.vassalId, actorId: actor.id, delta: data.delta },
            onSelect: () => {
              executeTaxChange(data.vassalId, actor.id, data.delta);
            },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    executeTaxChange(data.vassalId, actor.id, data.delta);
  },
};

registerBehavior(adjustTaxBehavior);
