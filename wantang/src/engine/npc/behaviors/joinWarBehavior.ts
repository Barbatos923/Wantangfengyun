// ===== NPC 主动干涉臣属战争行为 =====
// 领主（皇帝/节度使）主动加入直属臣属参与的战争。
// 基于好感、荣誉感、兵力对比决定是否干涉。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { executeJoinWar } from '@engine/interaction/joinWarAction';
import { isWarParticipant, getWarSide } from '@engine/military/warParticipantUtils';
import { registerBehavior } from './index';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority } from '@engine/types';
import { useWarStore } from '@engine/military/WarStore';

// ── 数据 ────────────────────────────────────────────────

interface JoinWarData {
  warId: string;
  side: 'attacker' | 'defender';
  vassalId: string; // 哪个臣属的战争
}

// ── 行为定义 ────────────────────────────────────────────

export const joinWarBehavior: NpcBehavior<JoinWarData> = {
  id: 'joinWar',
  playerMode: 'skip', // 玩家从角色交互面板操作

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<JoinWarData> | null {
    if (!actor.alive || !actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    let bestWeight = 0;
    let bestData: JoinWarData | null = null;

    for (const war of ctx.activeWars) {
      // 不参与自己已经参加的战争
      if (isWarParticipant(actor.id, war)) continue;

      // 寻找自己的直属臣属在这场战争中
      let vassalId: string | null = null;
      let vassalSide: 'attacker' | 'defender' | null = null;

      for (const charId of [war.attackerId, war.defenderId, ...war.attackerParticipants, ...war.defenderParticipants]) {
        const char = ctx.characters.get(charId);
        if (!char?.alive) continue;
        if (char.overlordId !== actor.id) continue;
        vassalId = charId;
        vassalSide = getWarSide(charId, war);
        break;
      }
      if (!vassalId || !vassalSide) continue;

      // 不干涉自己另一个臣属在对面的战争（避免自打自）
      const oppSide = vassalSide === 'attacker' ? 'defender' : 'attacker';
      const oppIds = oppSide === 'attacker'
        ? [war.attackerId, ...war.attackerParticipants]
        : [war.defenderId, ...war.defenderParticipants];
      const ownVassalOnOppSide = oppIds.some(id => {
        const c = ctx.characters.get(id);
        return c?.alive && c.overlordId === actor.id;
      });
      if (ownVassalOnOppSide) continue;

      const opinion = ctx.getOpinion(actor.id, vassalId);
      const myStrength = ctx.getMilitaryStrength(actor.id);
      const enemyLeaderId = vassalSide === 'attacker' ? war.defenderId : war.attackerId;
      const enemyStrength = ctx.getMilitaryStrength(enemyLeaderId);
      const ratio = enemyStrength > 0 ? myStrength / enemyStrength : 2;

      const modifiers: WeightModifier[] = [
        { label: '基础', add: 5 },
        { label: '荣誉(保护臣属)', add: personality.honor * 15 },
        { label: '好感', add: opinion > 0 ? opinion * 0.2 : opinion * 0.1 },
        { label: '胆识', add: personality.boldness * 8 },
        // 有足够兵力才愿意出手
        ...(ratio >= 1.5 ? [{ label: '兵力优势', add: 10 }] : []),
        ...(ratio < 0.5 ? [{ label: '实力悬殊', factor: 0 as number }] : []),
        ...(ratio < 0.8 ? [{ label: '兵力劣势', add: -10 }] : []),
        // 对臣属好感太低不干涉
        ...(opinion < -20 ? [{ label: '不愿帮忙', factor: 0 as number }] : []),
      ];

      const weight = calcWeight(modifiers);
      if (weight > bestWeight) {
        bestWeight = weight;
        bestData = { warId: war.id, side: vassalSide, vassalId };
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: JoinWarData, ctx: NpcContext) {
    // 执行前查询玩家是否参与此战争
    const war = useWarStore.getState().wars.get(data.warId);
    const playerInvolved = ctx.playerId && war && isWarParticipant(ctx.playerId, war);
    const playerSide = playerInvolved ? getWarSide(ctx.playerId!, war) : null;

    executeJoinWar(actor.id, data.warId, data.side);

    // 玩家参与此战争 → 右下角通知
    if (playerInvolved && playerSide) {
      const isFriendly = playerSide === data.side;
      useTurnManager.getState().addEvent({
        id: crypto.randomUUID(),
        date: { ...ctx.date },
        type: '参战',
        actors: [actor.id, ctx.playerId!],
        territories: war?.targetTerritoryIds ?? [],
        description: isFriendly
          ? `${actor.name}加入了你方的战争`
          : `${actor.name}加入了敌方的战争`,
        priority: EventPriority.Normal,
      });
    }
  },
};

registerBehavior(joinWarBehavior);
