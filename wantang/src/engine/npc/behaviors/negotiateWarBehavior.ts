// ===== NPC 和谈行为（战争中主动提议白和） =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult } from '../types';
import type { Character } from '@engine/character/types';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { calcPeaceProposalWeight, calcPeaceAcceptance } from '@engine/military/warCalc';
import { settleWar } from '@engine/military/warSettlement';
import { diffMonths } from '@engine/dateUtils';
import { isWarLeader } from '@engine/military/warParticipantUtils';
import { useStoryEventBus } from '@engine/storyEventBus';
import type { StoryEvent } from '@engine/storyEventBus';
import { registerBehavior } from './index';

// ── 行为定义 ────────────────────────────────────────────

interface NegotiateData {
  warId: string;
  enemyId: string;
  proposerIsAttacker: boolean;
}

export const negotiateWarBehavior: NpcBehavior<NegotiateData> = {
  id: 'negotiateWar',
  playerMode: 'skip', // 玩家从军事面板操作

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<NegotiateData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    let bestWeight = 0;
    let bestData: NegotiateData | null = null;

    for (const war of ctx.activeWars) {
      if (!isWarLeader(actor.id, war)) continue; // 仅战争领袖可议和

      const isAttacker = war.attackerId === actor.id;
      const myScore = isAttacker ? war.warScore : -war.warScore;
      const currentDate = ctx.date;
      const warMonths = diffMonths(war.startDate, currentDate);

      const weight = calcPeaceProposalWeight({
        myScore,
        warDurationMonths: warMonths,
        personality: {
          compassion: personality.compassion,
          boldness: personality.boldness,
          rationality: personality.rationality,
        },
        money: ctx.totalTreasury.get(actor.id)?.money ?? actor.resources.money,
        monthlyIncome: 0, // 简化：暂不计算月收入
      });

      if (weight > bestWeight) {
        bestWeight = weight;
        bestData = {
          warId: war.id,
          enemyId: isAttacker ? war.defenderId : war.attackerId,
          proposerIsAttacker: isAttacker,
        };
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: NegotiateData, ctx: NpcContext) {
    const war = useWarStore.getState().wars.get(data.warId);
    if (!war || war.status !== 'active') return;

    // 对方是玩家时弹出 StoryEvent 让玩家选择
    if (data.enemyId === ctx.playerId) {
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '和谈提议',
        description: `${actor.name}向你提议白和，结束这场战争。双方各退一步，不割地、不赔款。你是否接受？`,
        actors: [
          { characterId: actor.id, role: '提议者' },
          { characterId: data.enemyId, role: '你' },
        ],
        options: [
          {
            label: '接受和谈',
            description: '双方握手言和，战争结束。',
            effects: [],
            onSelect: () => {
              settleWar(data.warId, 'whitePeace');
            },
          },
          {
            label: '拒绝和谈',
            description: '继续战争，直到分出胜负。',
            effects: [],
            onSelect: () => {
              // 拒绝和谈，无额外效果
            },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    const currentDate = useTurnManager.getState().currentDate;
    const warMonths = (currentDate.year - war.startDate.year) * 12
      + (currentDate.month - war.startDate.month);

    // 提议方视角的分数
    const proposerScore = data.proposerIsAttacker ? war.warScore : -war.warScore;

    const enemyPersonality = ctx.personalityCache.get(data.enemyId);
    if (!enemyPersonality) return;

    const result = calcPeaceAcceptance({
      proposerScore,
      warDurationMonths: warMonths,
      targetPersonality: {
        compassion: enemyPersonality.compassion,
        boldness: enemyPersonality.boldness,
        honor: enemyPersonality.honor,
        greed: enemyPersonality.greed,
      },
    });

    if (result.accept) {
      settleWar(data.warId, 'whitePeace');
    }
  },
};

registerBehavior(negotiateWarBehavior);
