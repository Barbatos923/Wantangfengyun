// ===== NPC 逼迫授权行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import { debugLog } from '@engine/debugLog';
import type { Character } from '@engine/character/types';
import type { DemandableRight } from '@engine/interaction/demandRightsAction';
import {
  canDemandRightsPure,
  getDemandablePostsFromCtx,
  calcDemandRightsChance,
  executeDemandRights,
  DEMAND_RIGHTS_COOLDOWN_DAYS,
} from '@engine/interaction';
import { executeToggleAppointRight, executeToggleSuccession } from '@engine/interaction/centralizationAction';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useStoryEventBus } from '@engine/storyEventBus';
import type { StoryEvent } from '@engine/storyEventBus';
import { toAbsoluteDay } from '@engine/dateUtils';
import { registerBehavior } from './index';

// ── 行为数据 ──────────────────────────────────────────────

interface DemandRightsData {
  targetId: string;     // overlord
  postId: string;
  territoryId: string;
  territoryName: string;
  postName: string;
  capitalZhouId?: string;
  right: DemandableRight;
  chance: number;
}

// ── 行为定义 ──────────────────────────────────────────────

export const demandRightsBehavior: NpcBehavior<DemandRightsData> = {
  id: 'demandRights',
  playerMode: 'skip', // 玩家自己从交互菜单发起

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<DemandRightsData> | null {
    if (!actor.isRuler) return null;
    if (!actor.overlordId) return null;

    // 冷却检查
    const today = toAbsoluteDay(ctx.date);
    if (actor.lastDemandRightsDay != null && today - actor.lastDemandRightsDay < DEMAND_RIGHTS_COOLDOWN_DAYS) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    // 品级门控：五品以上
    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    if (rankLevel < 13) return null;

    const overlord = ctx.characters.get(actor.overlordId);
    if (!overlord || !overlord.alive) return null;

    // 纯函数检查
    if (!canDemandRightsPure(actor, overlord, ctx.territories)) return null;

    // 军力门控：必须2倍以上兵力优势
    const myStr = ctx.getMilitaryStrength(actor.id);
    const theirStr = ctx.getMilitaryStrength(actor.overlordId);
    const milRatio = theirStr > 0 ? myStr / theirStr : (myStr > 0 ? 10 : 0);
    if (milRatio < 2) return null;

    // 获取可逼迫的岗位
    const posts = getDemandablePostsFromCtx(actor.id, actor.overlordId, ctx);
    if (posts.length === 0) return null;

    const overlordPersonality = ctx.personalityCache.get(actor.overlordId);
    if (!overlordPersonality) return null;

    const opinion = ctx.getOpinion(actor.overlordId, actor.id);

    let bestWeight = 0;
    let bestData: DemandRightsData | null = null;

    for (const dp of posts) {
      for (const right of dp.availableRights) {
        const { chance } = calcDemandRightsChance(opinion, myStr, theirStr, overlordPersonality);

        const modifiers: WeightModifier[] = [
          { label: '基础', add: 30 },
          { label: '胆量', add: personality.boldness * 10 },
          { label: '贪婪', add: personality.greed * 8 },
          { label: '荣誉感', add: -personality.honor * 5 },
          { label: '成功率', add: chance >= 50 ? 10 : chance >= 30 ? 0 : -30 },
          // 兵力优势修正（2倍门控已通过，这里做梯度）
          ...(milRatio < 2.5 ? [{ label: '兵力优势偏低', factor: 0.7 }] : []),
        ];

        const weight = calcWeight(modifiers);

        if (weight > bestWeight) {
          bestWeight = weight;
          bestData = {
            targetId: actor.overlordId,
            postId: dp.postId,
            territoryId: dp.territoryId,
            territoryName: dp.territoryName,
            postName: dp.postName,
            capitalZhouId: dp.capitalZhouId,
            right,
            chance,
          };
        }
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: DemandRightsData, ctx: NpcContext) {
    const rightLabel = data.right === 'appointRight' ? '辟署权' : '宗法继承权';
    debugLog('policy', `[逼迫授权] NPC ${actor.name} → ${ctx.characters.get(data.targetId)?.name ?? data.targetId}：${data.territoryName}${data.postName} ${rightLabel}`);

    // 记录冷却
    const cd = toAbsoluteDay(ctx.date);
    useCharacterStore.getState().updateCharacter(actor.id, { lastDemandRightsDay: cd });

    // 目标是玩家时弹出 StoryEvent 让玩家选择
    if (data.targetId === ctx.playerId) {
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '逼迫授权',
        description: `${actor.name}凭借强大的军势，要求你授予其在${data.territoryName}${data.postName}的${rightLabel}。你作何决断？`,
        actors: [
          { characterId: actor.id, role: '要求者' },
          { characterId: data.targetId, role: '你' },
        ],
        options: [
          {
            label: '授予',
            description: `同意授予${rightLabel}，以安抚其心。`,
            effects: [
              { label: rightLabel, value: 0, type: 'neutral' },
            ],
            effectKey: 'demandRights:grant',
            effectData: { postId: data.postId, right: data.right, capitalZhouId: data.capitalZhouId, actorId: actor.id, targetId: data.targetId },
            onSelect: () => {
              const charStore = useCharacterStore.getState();
              if (data.right === 'appointRight') {
                executeToggleAppointRight(data.postId);
              } else {
                executeToggleSuccession(data.postId);
              }
              charStore.addOpinion(actor.id, data.targetId, {
                reason: '授权感激',
                value: 5,
                decayable: true,
              });
            },
          },
          {
            label: '拒绝',
            description: '拒绝其无理要求。',
            effects: [
              { label: '好感', value: -25, type: 'negative' },
            ],
            effectKey: 'demandRights:refuse',
            effectData: { actorId: actor.id, targetId: data.targetId },
            onSelect: () => {
              useCharacterStore.getState().addOpinion(actor.id, data.targetId, {
                reason: '拒绝授权',
                value: -25,
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
    executeDemandRights(actor.id, data.targetId, data.postId, data.right);
  },
};

registerBehavior(demandRightsBehavior);
