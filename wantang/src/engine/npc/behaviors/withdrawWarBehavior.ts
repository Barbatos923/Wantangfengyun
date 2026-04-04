// ===== NPC 退出战争行为 =====
// 参战者（非领袖）在不利条件下评估退出战争。
// 保守权重，罕见触发。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { executeWithdrawWar } from '@engine/interaction/withdrawWarAction';
import { isWarParticipant, isWarLeader, getWarSide, getOwnLeaderId } from '@engine/military/warParticipantUtils';
import { diffMonths } from '@engine/dateUtils';
import { registerBehavior } from './index';

// ── 数据 ────────────────────────────────────────────────

interface WithdrawData {
  warId: string;
}

// ── 行为定义 ────────────────────────────────────────────

export const withdrawWarBehavior: NpcBehavior<WithdrawData> = {
  id: 'withdrawWar',
  playerMode: 'skip', // 玩家从军事面板操作
  schedule: 'monthly-slot',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<WithdrawData> | null {
    if (!actor.alive || !actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    let bestWeight = 0;
    let bestData: WithdrawData | null = null;

    for (const war of ctx.activeWars) {
      if (!isWarParticipant(actor.id, war)) continue;
      if (isWarLeader(actor.id, war)) continue; // 领袖不能退出

      const side = getWarSide(actor.id, war)!;
      const myScore = side === 'attacker' ? war.warScore : -war.warScore;
      const warMonths = diffMonths(war.startDate, ctx.date);

      const leaderId = getOwnLeaderId(actor.id, war);
      const opinionToLeader = leaderId ? ctx.getOpinion(actor.id, leaderId) : 0;

      const modifiers: WeightModifier[] = [
        { label: '基础', add: -15 }, // 默认不想退出（忠诚倾向）

        // 战局不利
        ...(myScore < -30 ? [{ label: '战局不利', add: Math.abs(myScore) * 0.3 }] : []),

        // 战争过久
        ...(warMonths > 6 ? [{ label: '战争持久', add: warMonths * 0.5 }] : []),

        // 对领袖好感低
        ...(opinionToLeader < -10 ? [{ label: '不满领袖', add: Math.abs(opinionToLeader) * 0.2 }] : []),

        { label: '性格', add: 0 },
        { label: '理性', add: personality.rationality * 8 },
        { label: '荣誉(忠诚)', add: -personality.honor * 10 },
        { label: '胆识(勇气)', add: -personality.boldness * 8 },
      ];

      const weight = calcWeight(modifiers);
      if (weight > bestWeight) {
        bestWeight = weight;
        bestData = { warId: war.id };
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: WithdrawData, _ctx: NpcContext) {
    executeWithdrawWar(actor.id, data.warId);
  },
};

registerBehavior(withdrawWarBehavior);
