// ===== NPC 召集参战行为 =====
// 战争领袖召集直属臣属加入战争。
// NPC 臣属根据好感/性格决定是否接受，拒绝则好感 -30。
// 玩家收到 push-task 通知，选择接受或拒绝。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, PlayerTask } from '../types';
import type { Character } from '@engine/character/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { executeJoinWar } from '@engine/interaction/joinWarAction';
import { isWarLeader, isWarParticipant, getWarSide } from '@engine/military/warParticipantUtils';
import { addDays } from '@engine/dateUtils';
import { random } from '@engine/random';
import { registerBehavior } from './index';

// ── 数据 ────────────────────────────────────────────────

interface CallToArmsData {
  warId: string;
  side: 'attacker' | 'defender';
  vassalIds: string[];
}

// ── 行为定义 ────────────────────────────────────────────

export const callToArmsBehavior: NpcBehavior<CallToArmsData> = {
  id: 'callToArms',
  playerMode: 'push-task',
  schedule: 'daily',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<CallToArmsData> | null {
    if (!actor.alive || !actor.isRuler) return null;

    // 找到 actor 作为领袖的活跃战争
    for (const war of ctx.activeWars) {
      if (!isWarLeader(actor.id, war)) continue;

      const side = getWarSide(actor.id, war)!;

      // 找到未参战的直属臣属（排除对方领袖，防止快照中 overlordId 尚未清除的竞态）
      const vassalIds: string[] = [];
      for (const char of ctx.characters.values()) {
        if (!char.alive || !char.isRuler) continue;
        if (char.overlordId !== actor.id) continue;
        if (char.id === war.attackerId || char.id === war.defenderId) continue;
        if (isWarParticipant(char.id, war)) continue;
        vassalIds.push(char.id);
      }
      if (vassalIds.length === 0) continue;

      return {
        data: { warId: war.id, side, vassalIds },
        weight: 100,
        forced: true,
      };
    }

    return null;
  },

  executeAsNpc(actor: Character, data: CallToArmsData, ctx: NpcContext) {
    for (const vassalId of data.vassalIds) {
      const vassal = ctx.characters.get(vassalId);
      if (!vassal?.alive) continue;

      const personality = ctx.personalityCache.get(vassalId);
      if (!personality) continue;

      // 接受概率：基础 60 + opinion×1 + honor×15 - boldness×10
      const opinion = ctx.getOpinion(vassalId, actor.id);
      const acceptChance = Math.min(95, Math.max(5,
        60 + opinion + personality.honor * 15 - personality.boldness * 10,
      ));

      if (random() * 100 < acceptChance) {
        executeJoinWar(vassalId, data.warId, data.side);
      } else {
        // 拒绝：好感 -30
        useCharacterStore.getState().setOpinion(vassalId, actor.id, {
          reason: '拒绝参战',
          value: -30,
          decayable: true,
        });
      }
    }
  },

  generatePlayerTask(actor: Character, data: CallToArmsData, ctx: NpcContext): PlayerTask | null {
    // 玩家是被召集的臣属之一时才推送
    if (!ctx.playerId || !data.vassalIds.includes(ctx.playerId)) return null;

    return {
      id: crypto.randomUUID(),
      type: 'callToArms',
      actorId: ctx.playerId,
      data: { warId: data.warId, side: data.side, summonerId: actor.id },
      deadline: addDays(ctx.date, 30),
    };
  },
};

registerBehavior(callToArmsBehavior);
