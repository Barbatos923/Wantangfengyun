// ===== "解除同盟"交互 =====
//
// 合法解约（区别于"背盟宣战"）：主动方付小代价（威望 -40），双向好感惩罚。
// 不受停战保护（不设停战协议），但也不会触发战争。
// 战时解盟被 canShow 拒绝——参考 breakAllianceBehavior 同款规则。

import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { useStoryEventBus } from '@engine/storyEventBus';
import { toAbsoluteDay } from '@engine/dateUtils';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { EventPriority } from '@engine/types';
import { debugLog } from '@engine/debugLog';
import { ALLIANCE_BREAK_PRESTIGE_COST } from '@engine/military/types';
import { isWarParticipant } from '@engine/military/warParticipantUtils';

registerInteraction({
  id: 'breakAlliance',
  name: '解除同盟',
  icon: '💔',
  canShow: (player, target) => {
    if (player.id === target.id) return false;
    if (!target.alive || !player.alive) return false;
    const warStore = useWarStore.getState();
    const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
    return warStore.hasAlliance(player.id, target.id, currentDay);
  },
  canExecuteCheck: (player, target) => {
    // 共同参战的战争期间禁止解盟（道义代价过高，预留未来"前线弃盟"事件）
    const warStore = useWarStore.getState();
    for (const w of warStore.getActiveWars()) {
      if (w.status !== 'active') continue;
      if (isWarParticipant(player.id, w) && isWarParticipant(target.id, w)) {
        return '共同参战期间不可解盟';
      }
    }
    return null;
  },
  paramType: 'none',
});

/**
 * 执行解除同盟。
 *
 * 双方共享同一函数：玩家主动解除 or NPC breakAllianceBehavior 调用。
 * stale 校验不过 → 返回 false；成功 → 返回 true。
 *
 * 副作用：
 * - 主动方 prestige -40
 * - 对方对主动方好感 -50（decayable）
 * - 主动方对对方好感 -20（decayable，主动方也会有些歉疚/摩擦）
 * - emit 史书 '解除同盟' Normal
 * - 若 target 是玩家（被动方），push StoryEvent 通知
 */
export function executeBreakAlliance(
  actorId: string,
  targetId: string,
): boolean {
  const cs = useCharacterStore.getState();
  const ws = useWarStore.getState();
  const actor = cs.getCharacter(actorId);
  const target = cs.getCharacter(targetId);
  if (!actor?.alive || !target?.alive) return false;
  if (actorId === targetId) return false;

  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  if (!ws.hasAlliance(actorId, targetId, currentDay)) return false;

  // 战时禁止（与 canExecuteCheck 一致）
  for (const w of ws.getActiveWars()) {
    if (w.status !== 'active') continue;
    if (isWarParticipant(actorId, w) && isWarParticipant(targetId, w)) return false;
  }

  ws.breakAllianceBetween(actorId, targetId);

  // 主动方付威望代价
  cs.addResources(actorId, { prestige: ALLIANCE_BREAK_PRESTIGE_COST });
  // 双向好感
  cs.addOpinion(targetId, actorId, { reason: '单方面解盟', value: -50, decayable: true });
  cs.addOpinion(actorId, targetId, { reason: '解除同盟', value: -20, decayable: true });

  emitChronicleEvent({
    type: '解除同盟',
    actors: [actorId, targetId],
    territories: [],
    description: `${actor.name}单方面解除了与${target.name}的盟约`,
    priority: EventPriority.Normal,
  });
  debugLog('interaction', `[解盟] ${actor.name} → ${target.name}`);

  // 若被动方是玩家 → StoryEvent 通知
  const playerId = cs.playerId;
  if (playerId && targetId === playerId) {
    useStoryEventBus.getState().pushStoryEvent({
      id: crypto.randomUUID(),
      title: '盟友弃约',
      description: `${actor.name}单方面解除了与你的盟约。此后双方各行其道。`,
      actors: [
        { characterId: actorId, role: '原盟友' },
        { characterId: targetId, role: '你' },
      ],
      options: [
        {
          label: '知悉',
          description: '同盟已终止。',
          effects: [],
          effectKey: 'noop:notification',
          effectData: {},
          onSelect: () => {},
        },
      ],
    });
  }

  return true;
}
