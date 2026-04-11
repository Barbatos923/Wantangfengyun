// ===== "宣战"交互 =====

import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority } from '@engine/types';
import type { CasusBelli } from '@engine/military/types';
import { ALLIANCE_BETRAYAL_OPINION } from '@engine/military/types';
import { debugLog } from '@engine/debugLog';
import { toAbsoluteDay } from '@engine/dateUtils';
import { evaluateAllCasusBelli, getAnnexTargets, getDeJureTargets } from '@engine/military/warCalc';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { autoJoinAlliesOnWarStart } from '@engine/military/allianceAutoJoin';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { useStoryEventBus } from '@engine/storyEventBus';


registerInteraction({
  id: 'declareWar',
  name: '宣战',
  icon: '⚔',
  canShow: (_player, target) => {
    // 对所有统治者都显示宣战按钮（禁用原因在面板中说明）
    return target.isRuler;
  },
  paramType: 'declareWar',
});

/**
 * 执行宣战：扣除资源 + 创建战争。
 *
 * 瞬时重校验（CLAUDE.md `### 决议系统：canExecute 是快照、execute 必须二次校验` 同款纪律）：
 * - 双方仍存活
 * - 不是同一人
 * - 双方之间没有现存活跃战争
 * - 选定的 CB 经 `evaluateAllCasusBelli` 重新评估仍可用（含所有制度/邻接/法理/时代/停战条件）
 * - 具体目标州列表仍与当前局面一致
 * - 资源仍足够
 *
 * 任一不过 → 返回 false 不写状态。
 */
export function executeDeclareWar(
  playerId: string,
  targetId: string,
  casusBelli: CasusBelli,
  targetTerritoryIds: string[],
  date: { year: number; month: number; day: number },
  _cost: { prestige: number; legitimacy: number },
): boolean {
  const charStore = useCharacterStore.getState();
  const attacker = charStore.getCharacter(playerId);
  const defender = charStore.getCharacter(targetId);
  if (!attacker?.alive || !defender?.alive) return false;
  if (playerId === targetId) return false;

  const warStore = useWarStore.getState();
  // 双方之间已有现成活跃战争 → 拒绝
  for (const w of warStore.getActiveWars()) {
    if ((isWarParticipant(playerId, w) && isWarParticipant(targetId, w))) return false;
  }

  // 停战期允许强开，但执行时要按当前局面重算真实代价
  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  const hasTruce = warStore.hasTruce(playerId, targetId, currentDay);
  // 背盟宣战也允许（需要显式承担后果），execute 时重算 cost 含背盟惩罚
  const hasAlliance = warStore.hasAlliance(playerId, targetId, currentDay);

  // CB 仍可用（用面板同款评估器，不重写一套）
  const territories = useTerritoryStore.getState().territories;
  const era = useTurnManager.getState().era;
  const cbEvals = evaluateAllCasusBelli({
    attackerId: playerId,
    defenderId: targetId,
    era,
    territories,
    characters: charStore.characters,
    hasTruce,
    hasAlliance,
  });
  const selectedEval = cbEvals.find((e) => e.id === casusBelli);
  if (!selectedEval || selectedEval.failureReason !== null) return false;

  // 目标快照也要二次校验，防止旧弹窗把战争落到已变化的州上
  if (casusBelli === 'annexation') {
    const annexTargets = getAnnexTargets(playerId, targetId, territories);
    if (targetTerritoryIds.length !== 1 || !annexTargets.includes(targetTerritoryIds[0])) return false;
  } else if (casusBelli === 'deJureClaim') {
    const currentTargets = getDeJureTargets(playerId, targetId, territories);
    if (
      targetTerritoryIds.length !== currentTargets.length ||
      targetTerritoryIds.some((id) => !currentTargets.includes(id))
    ) {
      return false;
    }
  } else if (casusBelli === 'independence' && targetTerritoryIds.length > 0) {
    return false;
  }

  const cost = selectedEval.cost;
  if (attacker.resources.prestige + cost.prestige < 0) return false;
  if (attacker.resources.legitimacy + cost.legitimacy < 0) return false;

  useCharacterStore.getState().addResources(playerId, {
    prestige: cost.prestige,
    legitimacy: cost.legitimacy,
  });
  const war = useWarStore.getState().declareWar(playerId, targetId, casusBelli, targetTerritoryIds, date);

  // ── 宣战事件（无条件记录，UI 层筛选显示） ──
  {
    const charStore = useCharacterStore.getState();
    const terrStore = useTerritoryStore.getState();
    const attackerName = charStore.getCharacter(playerId)?.name ?? '???';
    const defenderName = charStore.getCharacter(targetId)?.name ?? '???';
    const CB_LABELS: Record<string, string> = { annexation: '武力兼并', deJureClaim: '法理宣称', independence: '独立' };
    const cbLabel = CB_LABELS[casusBelli] ?? casusBelli;
    debugLog('war', `[战争] 宣战：${attackerName} → ${defenderName}（${cbLabel}）`);

    // 拼目标领地名称
    const targetNames = targetTerritoryIds
      .map((id) => terrStore.territories.get(id)?.name)
      .filter(Boolean);
    // 按 CB 类型生成不同描述
    let desc: string;
    if (casusBelli === 'independence') {
      desc = `${attackerName}举兵叛离${defenderName}，自立门户`;
    } else if (casusBelli === 'annexation') {
      const targetStr = targetNames.length > 0 ? targetNames.join('、') : '?';
      desc = `${attackerName}以武力兼并之名向${defenderName}宣战，兵锋直指${targetStr}`;
    } else {
      // deJureClaim
      const targetStr = targetNames.length > 0
        ? (targetNames.length <= 3 ? targetNames.join('、') : `${targetNames.slice(0, 3).join('、')}等${targetNames.length}州`)
        : '?';
      desc = `${attackerName}以法理宣称向${defenderName}宣战，欲收${targetStr}`;
    }

    useTurnManager.getState().addEvent({
      id: crypto.randomUUID(),
      date: { ...date },
      type: '宣战',
      actors: [playerId, targetId],
      territories: targetTerritoryIds,
      description: desc,
      priority: EventPriority.Normal,
      payload: { casusBelli, cbLabel },
    });
  }

  // 独立战争：宣战即脱离效忠关系（辟署权在独立成功后才授予）
  if (casusBelli === 'independence') {
    const attackerNow = useCharacterStore.getState().getCharacter(playerId);
    if (attackerNow?.overlordId === targetId) {
      useWarStore.getState().updateWar(war.id, { previousOverlordId: targetId });
      useCharacterStore.getState().updateCharacter(playerId, { overlordId: undefined });
    }
  }

  // 背盟：宣战成功后立即断盟 + 双向好感暴跌 + 史书 emit
  if (hasAlliance) {
    useWarStore.getState().breakAllianceBetween(playerId, targetId);
    const cs = useCharacterStore.getState();
    const attackerName = cs.getCharacter(playerId)?.name ?? '?';
    const defenderName = cs.getCharacter(targetId)?.name ?? '?';
    cs.addOpinion(targetId, playerId, { reason: '背盟宣战', value: ALLIANCE_BETRAYAL_OPINION, decayable: true });
    cs.addOpinion(playerId, targetId, { reason: '背盟宣战', value: -50, decayable: true });
    emitChronicleEvent({
      type: '背盟宣战',
      actors: [playerId, targetId],
      territories: targetTerritoryIds,
      description: `${attackerName}背弃与${defenderName}的盟约，悍然兴兵`,
      priority: EventPriority.Major,
    });
    // 玩家是被背盟的受害方 → 额外 StoryEvent 通知（宣战事件右下角已有，StoryEvent 更醒目）
    const playerCharId = cs.playerId;
    if (playerCharId && playerCharId === targetId) {
      useStoryEventBus.getState().pushStoryEvent({
        id: crypto.randomUUID(),
        title: '盟友背弃',
        description: `${attackerName}不顾盟约，悍然对你兴兵。昔日盟友，今为死敌。`,
        actors: [
          { characterId: playerId, role: '背盟者' },
          { characterId: targetId, role: '你' },
        ],
        options: [
          {
            label: '知悉',
            description: '同盟已终止，全力应战。',
            effects: [],
            effectKey: 'noop:notification',
            effectData: {},
            onSelect: () => {},
          },
        ],
      });
    }
  }

  // 同盟自动参战：双方盟友按资格拉入同侧
  autoJoinAlliesOnWarStart(war, currentDay);

  return true;
}
