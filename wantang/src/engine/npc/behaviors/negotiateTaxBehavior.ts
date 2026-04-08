// ===== NPC 议定进奉行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import { debugLog } from '@engine/debugLog';
import type { Character } from '@engine/character/types';
import {
  canNegotiateTaxPure,
  calcNegotiateTaxChance,
  executeNegotiateTax,
  NEGOTIATE_TAX_COOLDOWN_DAYS,
  TAX_LABELS,
} from '@engine/interaction';
import { executeTaxChange } from '@engine/interaction/centralizationAction';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useStoryEventBus } from '@engine/storyEventBus';
import type { StoryEvent } from '@engine/storyEventBus';
import { toAbsoluteDay } from '@engine/dateUtils';
import { registerBehavior } from './index';

// ── 行为数据 ──────────────────────────────────────────────

interface NegotiateTaxData {
  targetId: string; // overlord
  delta: number;    // -1 降税
  chance: number;
}

// ── 行为定义 ──────────────────────────────────────────────

export const negotiateTaxBehavior: NpcBehavior<NegotiateTaxData> = {
  id: 'negotiateTax',
  playerMode: 'skip', // 玩家自己从交互菜单发起

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<NegotiateTaxData> | null {
    if (!actor.isRuler) return null;
    if (!actor.overlordId) return null;

    // 冷却检查
    const today = toAbsoluteDay(ctx.date);
    if (actor.lastNegotiateTaxDay != null && today - actor.lastNegotiateTaxDay < NEGOTIATE_TAX_COOLDOWN_DAYS) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    // NPC 只在赋税 >= 3（严控或压榨）时请求降低
    const level = actor.centralization ?? 2;
    if (level < 3) return null;

    const overlord = ctx.characters.get(actor.overlordId);
    if (!overlord || !overlord.alive) return null;

    // 纯函数检查
    if (!canNegotiateTaxPure(actor, overlord)) return null;

    // 计算成功率
    const opinion = ctx.getOpinion(actor.overlordId, actor.id);
    const myStr = ctx.getMilitaryStrength(actor.id);
    const theirStr = ctx.getMilitaryStrength(actor.overlordId);
    const overlordPersonality = ctx.personalityCache.get(actor.overlordId);
    if (!overlordPersonality) return null;

    const { chance } = calcNegotiateTaxChance(opinion, myStr, theirStr, overlordPersonality, -1);

    const modifiers: WeightModifier[] = [
      { label: '基础', add: 20 },
      { label: '胆量', add: personality.boldness * 6 },
      { label: '贪婪', add: personality.greed * 8 },
      { label: '荣誉感', add: -personality.honor * 4 },
      // 压榨级别更急迫
      ...(level >= 4 ? [{ label: '压榨', add: 15 }] : []),
      // 成功率修正
      { label: '成功率', add: chance >= 40 ? 5 : chance < 20 ? -10 : 0 },
    ];

    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    return { data: { targetId: actor.overlordId, delta: -1, chance }, weight };
  },

  executeAsNpc(actor: Character, data: NegotiateTaxData, ctx: NpcContext) {
    const currentLevel = actor.centralization ?? 2;
    const newLevel = currentLevel + data.delta;
    debugLog('policy', `[议定进奉] NPC ${actor.name} → ${ctx.characters.get(data.targetId)?.name ?? data.targetId}：${TAX_LABELS[currentLevel]}(${currentLevel}) → ${TAX_LABELS[newLevel]}(${newLevel})`);

    // 记录冷却
    const cd = toAbsoluteDay(ctx.date);
    useCharacterStore.getState().updateCharacter(actor.id, { lastNegotiateTaxDay: cd });

    // 目标是玩家时弹出 StoryEvent 让玩家选择
    if (data.targetId === ctx.playerId) {
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '议定进奉',
        description: `${actor.name}请求将进奉等级从「${TAX_LABELS[currentLevel] ?? ''}」调整为「${TAX_LABELS[newLevel] ?? ''}」。你作何决断？`,
        actors: [
          { characterId: actor.id, role: '请求者' },
          { characterId: data.targetId, role: '你' },
        ],
        options: [
          {
            label: '同意',
            description: `同意调整进奉等级。`,
            effects: [
              { label: '好感', value: 5, type: 'positive' },
            ],
            effectKey: 'negotiateTax:accept',
            effectData: { actorId: actor.id, targetId: data.targetId, delta: data.delta },
            onSelect: () => {
              executeTaxChange(actor.id, data.targetId, data.delta);
              useCharacterStore.getState().addOpinion(actor.id, data.targetId, {
                reason: '议定进奉',
                value: 5,
                decayable: true,
              });
            },
          },
          {
            label: '拒绝',
            description: '拒绝其请求。',
            effects: [
              { label: '好感', value: -15, type: 'negative' },
            ],
            effectKey: 'negotiateTax:reject',
            effectData: { actorId: actor.id, targetId: data.targetId, delta: data.delta },
            onSelect: () => {
              useCharacterStore.getState().addOpinion(actor.id, data.targetId, {
                reason: '议定进奉失败',
                value: -15,
                decayable: true,
              });
            },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    // NPC 目标：直接执行（含骰子判定）
    executeNegotiateTax(actor.id, data.targetId, data.delta);
  },
};

registerBehavior(negotiateTaxBehavior);
