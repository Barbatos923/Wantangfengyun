// ===== NPC 调整职类行为（优先级最高） =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import { debugLog } from '@engine/debugLog';
import type { Character } from '@engine/character/types';
import {
  evaluateAppeasementTargets,
  getVassalPolicyPosts,
  canSwitchType,
  hasAuthorityOverPost,
  APPEASE_THRESHOLD,
  CENTRALIZE_THRESHOLD,
} from '../policyCalc';
import { executeToggleType } from '@engine/interaction';
import { executeDeclareWar } from '@engine/interaction';
import { useTurnManager } from '@engine/TurnManager';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useStoryEventBus } from '@engine/storyEventBus';
import type { StoryEvent } from '@engine/storyEventBus';
import { positionMap } from '@data/positions';
import { registerBehavior } from './index';

interface AdjustTypeData {
  vassalId: string;
  postId: string;
  territoryId: string;
  toMilitary: boolean; // true=改军事(讨好), false=改民政(集权)
}

export const adjustTypeBehavior: NpcBehavior<AdjustTypeData> = {
  id: 'adjustType',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<AdjustTypeData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const targets = evaluateAppeasementTargets(actor.id, ctx);
    if (targets.length === 0) return null;

    targets.sort((a, b) => b.urgency - a.urgency);
    const maxUrgency = targets[0].urgency;
    const minUrgency = targets[targets.length - 1].urgency;

    // 讨好：民政→军事
    if (maxUrgency > APPEASE_THRESHOLD) {
      for (const t of targets) {
        if (t.urgency <= APPEASE_THRESHOLD) break;
        const posts = getVassalPolicyPosts(t.vassalId, ctx);
        for (const pp of posts) {
          if (pp.territoryType === 'military') continue; // 已是军事
          const post = ctx.postIndex.get(pp.postId);
          if (!post || !canSwitchType(post)) continue;
          if (!hasAuthorityOverPost(actor.id, pp.territoryId, ctx.territories)) continue;

          const modifiers: WeightModifier[] = [
            { label: '基础', add: 20 },
            { label: '紧迫度', add: t.urgency * 0.3 },
          ];
          return {
            data: { vassalId: t.vassalId, postId: pp.postId, territoryId: pp.territoryId, toMilitary: true },
            weight: calcWeight(modifiers),
          };
        }
      }
    }

    // 集权：军事→民政
    if (minUrgency < CENTRALIZE_THRESHOLD) {
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        if (t.urgency >= CENTRALIZE_THRESHOLD) break;
        const posts = getVassalPolicyPosts(t.vassalId, ctx);
        for (const pp of posts) {
          if (pp.territoryType === 'civil') continue; // 已是民政
          const post = ctx.postIndex.get(pp.postId);
          if (!post || !canSwitchType(post)) continue;
          if (!hasAuthorityOverPost(actor.id, pp.territoryId, ctx.territories)) continue;

          const modifiers: WeightModifier[] = [
            { label: '基础', add: 20 },
            { label: '安全度', add: Math.abs(t.urgency) * 0.3 },
            { label: '贪婪', add: personality.greed * 3 },
          ];
          return {
            data: { vassalId: t.vassalId, postId: pp.postId, territoryId: pp.territoryId, toMilitary: false },
            weight: calcWeight(modifiers),
          };
        }
      }
    }

    return null;
  },

  executeAsNpc(actor: Character, data: AdjustTypeData, ctx: NpcContext) {
    const terrName = ctx.territories.get(data.territoryId)?.name ?? '';
    const post = ctx.postIndex.get(data.postId);
    const postName = post ? (positionMap.get(post.templateId)?.name ?? '') : '';
    const newTypeLabel = data.toMilitary ? '军事' : '民政';
    const vassalName = ctx.characters.get(data.vassalId)?.name ?? data.vassalId;
    debugLog('policy', `[政策] ${actor.name} → ${vassalName}：${terrName}${postName} 改为${newTypeLabel}制`);

    if (data.vassalId === ctx.playerId) {
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '职类调整',
        description: `${actor.name}意图将${terrName}${postName}改为${newTypeLabel}制。`,
        actors: [
          { characterId: actor.id, role: '领主' },
          { characterId: data.vassalId, role: '你' },
        ],
        options: [
          {
            label: '忍辱接受',
            description: `服从上级决定，接受${newTypeLabel}制改革。`,
            effects: [
              { label: '职类', value: data.toMilitary ? 5 : 0, type: data.toMilitary ? 'positive' : 'neutral' },
            ],
            onSelect: () => {
              executeToggleType(data.postId, data.territoryId);
            },
          },
          {
            label: '起兵反抗',
            description: '拒绝改制，发动独立战争。',
            effects: [
              { label: '独立战争', value: 0, type: 'negative' },
            ],
            onSelect: () => {
              const date = useTurnManager.getState().currentDate;
              useCharacterStore.getState().addOpinion(data.vassalId, actor.id, {
                reason: '强制改制',
                value: -30,
                decayable: true,
              });
              executeDeclareWar(
                data.vassalId, actor.id, 'independence', [],
                date, { prestige: 0, legitimacy: 0 },
              );
            },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    executeToggleType(data.postId, data.territoryId);
  },
};

registerBehavior(adjustTypeBehavior);
