// ===== NPC 调整继承法行为（优先级最低） =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import {
  evaluateAppeasementTargets,
  getVassalPolicyPosts,
  hasAuthorityOverPost,
  APPEASE_THRESHOLD,
  CENTRALIZE_THRESHOLD,
} from '../policyCalc';
import { executeToggleSuccession, executeDeclareWar } from '@engine/interaction';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useStoryEventBus } from '@engine/storyEventBus';
import type { StoryEvent } from '@engine/storyEventBus';
import { CLAN_SUCCESSION_OPINION } from '@engine/interaction/centralizationAction';
import { positionMap } from '@data/positions';
import { registerBehavior } from './index';

interface AdjustSuccessionData {
  vassalId: string;
  postId: string;
  territoryId: string;
  capitalZhouId?: string;
  toClan: boolean; // true=改宗法(讨好), false=改流官(集权)
  tier: string;
}

export const adjustSuccessionBehavior: NpcBehavior<AdjustSuccessionData> = {
  id: 'adjustSuccession',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<AdjustSuccessionData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const targets = evaluateAppeasementTargets(actor.id, ctx);
    if (targets.length === 0) return null;

    targets.sort((a, b) => b.urgency - a.urgency);
    const maxUrgency = targets[0].urgency;
    const minUrgency = targets[targets.length - 1].urgency;

    // 讨好：流官→宗法
    if (maxUrgency > APPEASE_THRESHOLD) {
      for (const t of targets) {
        if (t.urgency <= APPEASE_THRESHOLD) break;
        const posts = getVassalPolicyPosts(t.vassalId, ctx);
        for (const pp of posts) {
          if (pp.successionLaw === 'clan') continue; // 已是宗法
          if (!hasAuthorityOverPost(actor.id, pp.territoryId, ctx.territories)) continue;

          const modifiers: WeightModifier[] = [
            { label: '基础', add: 10 },
            { label: '紧迫度', add: t.urgency * 0.3 },
            { label: '荣誉', add: personality.honor * 3 },
          ];
          return {
            data: {
              vassalId: t.vassalId,
              postId: pp.postId,
              territoryId: pp.territoryId,
              capitalZhouId: pp.capitalZhouId,
              toClan: true,
              tier: pp.tier,
            },
            weight: calcWeight(modifiers),
          };
        }
      }
    }

    // 集权：宗法→流官
    if (minUrgency < CENTRALIZE_THRESHOLD) {
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        if (t.urgency >= CENTRALIZE_THRESHOLD) break;
        const posts = getVassalPolicyPosts(t.vassalId, ctx);
        for (const pp of posts) {
          if (pp.successionLaw === 'bureaucratic') continue;
          if (!hasAuthorityOverPost(actor.id, pp.territoryId, ctx.territories)) continue;

          const modifiers: WeightModifier[] = [
            { label: '基础', add: 10 },
            { label: '安全度', add: Math.abs(t.urgency) * 0.3 },
            { label: '贪婪', add: personality.greed * 3 },
          ];
          return {
            data: {
              vassalId: t.vassalId,
              postId: pp.postId,
              territoryId: pp.territoryId,
              capitalZhouId: pp.capitalZhouId,
              toClan: false,
              tier: pp.tier,
            },
            weight: calcWeight(modifiers),
          };
        }
      }
    }

    return null;
  },

  executeAsNpc(actor: Character, data: AdjustSuccessionData, ctx: NpcContext) {
    const terrName = ctx.territories.get(data.territoryId)?.name ?? '';
    const post = ctx.postIndex.get(data.postId);
    const postName = post ? (positionMap.get(post.templateId)?.name ?? '') : '';
    const actionLabel = data.toClan ? '改为世袭' : '改为流官';
    const vassalName = ctx.characters.get(data.vassalId)?.name ?? data.vassalId;
    console.log(`[政策] ${actor.name} → ${vassalName}：${terrName}${postName} ${actionLabel}`);
    const opinionValue = data.toClan ? (CLAN_SUCCESSION_OPINION[data.tier] ?? 0) : 0;

    if (data.vassalId === ctx.playerId) {
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '继承法变更',
        description: `${actor.name}意图将${terrName}${postName}的继承法${actionLabel}制。`,
        actors: [
          { characterId: actor.id, role: '领主' },
          { characterId: data.vassalId, role: '你' },
        ],
        options: [
          {
            label: '忍辱接受',
            description: `服从上级决定。`,
            effects: [
              { label: '继承法', value: opinionValue, type: data.toClan ? 'positive' : 'negative' },
            ],
            onSelect: () => {
              const territories = useTerritoryStore.getState().territories;
              executeToggleSuccession(data.postId, data.capitalZhouId, territories);
            },
          },
          {
            label: '起兵反抗',
            description: '拒绝变更，发动独立战争。',
            effects: [
              { label: '独立战争', value: 0, type: 'negative' },
            ],
            onSelect: () => {
              const date = useTurnManager.getState().currentDate;
              useCharacterStore.getState().addOpinion(data.vassalId, actor.id, {
                reason: '强改继承法',
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

    const territories = useTerritoryStore.getState().territories;
    executeToggleSuccession(data.postId, data.capitalZhouId, territories);
  },
};

registerBehavior(adjustSuccessionBehavior);
