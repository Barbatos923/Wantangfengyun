// ===== 同盟自动参战 =====
//
// 战争刚创建时调用：把攻守双方领袖的盟友按资格拉入同侧。
// NPC 盟友直接 addParticipant；玩家盟友推 StoryEvent 走 accept / reject 两条路径。
// reject = 背盟，付 ALLIANCE_BETRAYAL_PENALTY 并终止同盟（由 storyEffectResolver 落地）。
//
// 触发点仅在 executeDeclareWar 成功创建 war 之后——不在 joinWar / callToArms 等二次加入时触发，
// 避免"盟友的盟友连锁拉入"雪球。

import type { War } from './types';
import { ALLIANCE_BETRAYAL_PENALTY, ALLIANCE_BETRAYAL_OPINION } from './types';
import { useWarStore } from './WarStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useStoryEventBus } from '@engine/storyEventBus';
import { isWarParticipant } from './warParticipantUtils';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { EventPriority } from '@engine/types';
import { calculateBaseOpinion } from '@engine/character/characterUtils';

/** 资格检查：盟友是否可被拉入 war 的 side 侧 */
function canAutoJoin(
  allyId: string,
  enemyLeaderId: string,
  war: War,
  currentDay: number,
): boolean {
  const charStore = useCharacterStore.getState();
  const warStore = useWarStore.getState();
  const ally = charStore.getCharacter(allyId);
  if (!ally?.alive) return false;
  // 盟友即为对方领袖：不可能（说明双方互为同盟且在打）——防御
  if (allyId === enemyLeaderId) return false;
  // 已在此战争中（任一方）→ 跳过
  if (isWarParticipant(allyId, war)) return false;
  // 与对方领袖有停战协议 → 不被强拉
  if (warStore.hasTruce(allyId, enemyLeaderId, currentDay)) return false;
  // 与对方领袖已有活跃战争（任何其他战争）→ 跳过防多战争冲突
  for (const w of warStore.getActiveWars()) {
    if (w.id === war.id) continue;
    if (isWarParticipant(allyId, w) && isWarParticipant(enemyLeaderId, w)) return false;
  }
  // 盟友当前已在其他活跃战争中（即便对方不在）→ 策略保守，跳过防悬挂
  for (const w of warStore.getActiveWars()) {
    if (w.id === war.id) continue;
    if (isWarParticipant(allyId, w)) return false;
  }
  return true;
}

/**
 * 对新创建的战争执行同盟自动参战。
 * - 攻方领袖的盟友 → 加入攻方
 * - 守方领袖的盟友 → 加入守方
 * - 与双方领袖都有同盟的"双绞"盟友 → 走冲突裁决（不会被静默塞进先处理的一侧）
 * - 玩家盟友 → 推送 StoryEvent，不立即 addParticipant
 */
export function autoJoinAlliesOnWarStart(war: War, currentDay: number): void {
  const warStore = useWarStore.getState();
  const charStore = useCharacterStore.getState();
  const playerId = charStore.playerId;

  // 先按资格分别求"能加入攻方的盟友"与"能加入守方的盟友"
  // canAutoJoin 的 enemyLeaderId 参数是"若加入此侧，对立面的领袖是谁"：
  // - 加入攻方 → 对立面 = 守方领袖
  // - 加入守方 → 对立面 = 攻方领袖
  // 这样各自过滤掉与对方领袖有停战 / 已在其他战争中等的不合格者。
  const rawAttackerAllies = warStore.getAllies(war.attackerId, currentDay);
  const rawDefenderAllies = warStore.getAllies(war.defenderId, currentDay);
  const eligibleAttacker = new Set<string>();
  const eligibleDefender = new Set<string>();
  for (const a of rawAttackerAllies) {
    if (canAutoJoin(a, war.defenderId, war, currentDay)) eligibleAttacker.add(a);
  }
  for (const a of rawDefenderAllies) {
    if (canAutoJoin(a, war.attackerId, war, currentDay)) eligibleDefender.add(a);
  }

  // 真正的冲突：**两侧都合法**的共享盟友才进入冲突裁决
  // 仅对其中一侧合法的共享盟友 → 回退为该合法侧的正常自动参战
  // （例如与攻方有停战但与守方关系正常时，自然只履行对守方的盟约）
  const trueConflict: string[] = [];
  for (const a of eligibleAttacker) {
    if (eligibleDefender.has(a)) trueConflict.push(a);
  }
  for (const c of trueConflict) {
    eligibleAttacker.delete(c);
    eligibleDefender.delete(c);
  }

  // 先处理真正的冲突盟友（必须两侧都合法）
  for (const allyId of trueConflict) {
    resolveConflictAlly(war, allyId, currentDay, playerId);
  }

  // 再处理单边盟友（已经过资格过滤，processSide 内部的 canAutoJoin 作为幂等防御层）
  processSide(war, 'attacker', war.attackerId, war.defenderId, currentDay, playerId, eligibleAttacker);
  processSide(war, 'defender', war.defenderId, war.attackerId, currentDay, playerId, eligibleDefender);

  function processSide(
    w: War,
    side: 'attacker' | 'defender',
    leaderId: string,
    enemyLeaderId: string,
    day: number,
    pid: string | null,
    allySet: Set<string>,
  ) {
    const leader = charStore.getCharacter(leaderId);
    if (!leader?.alive) return;
    if (allySet.size === 0) return;
    for (const allyId of allySet) {
      if (!canAutoJoin(allyId, enemyLeaderId, w, day)) continue;

      // 反戈判定：盟友的直接领主正是敌方领袖 → 必须切断臣属关系才能加入
      // 这是河北三镇共进退的核心：当唐廷削某藩镇时，其兄弟藩镇为履约必须起兵反廷
      const ally = charStore.getCharacter(allyId)!;
      const mustRebel = ally.overlordId != null && ally.overlordId === enemyLeaderId;

      // 玩家盟友 → 推 StoryEvent，不直接 addParticipant
      if (pid && allyId === pid) {
        pushPlayerAutoJoinEvent(w.id, side, leaderId, enemyLeaderId, mustRebel);
        continue;
      }

      // NPC 盟友 → 直接加入（必要时先反戈）
      if (mustRebel) {
        const overlordId = ally.overlordId!;
        const overlordName = charStore.getCharacter(overlordId)?.name ?? '?';
        const allyNameRebel = ally.name;
        useCharacterStore.getState().updateCharacter(allyId, { overlordId: undefined });
        emitChronicleEvent({
          type: '同盟反戈',
          actors: [allyId, overlordId, leaderId],
          territories: [],
          description: `${allyNameRebel}为履行盟约，叛离${overlordName}，起兵助${leader.name}`,
          priority: EventPriority.Major,
        });
      }

      warStore.addParticipant(w.id, allyId, side);
      const allyName = charStore.getCharacter(allyId)?.name ?? '?';
      const leaderName = leader.name;
      const enemyName = charStore.getCharacter(enemyLeaderId)?.name ?? '?';
      emitChronicleEvent({
        type: '同盟参战',
        actors: [allyId, leaderId, enemyLeaderId],
        territories: [],
        description: `${allyName}依盟约加入${leaderName}对${enemyName}的战争`,
        priority: EventPriority.Major,
      });
    }
  }
}

/**
 * 解决"双绞盟友"：一个角色同时与攻守两方领袖有同盟。
 * - 玩家：推送三选一 StoryEvent（援A / 援B / 两不相助）
 * - NPC：按好感决定，相等或都≤0 → 保持中立、两盟俱碎
 */
function resolveConflictAlly(
  war: War,
  allyId: string,
  _currentDay: number,
  playerId: string | null,
): void {
  const charStore = useCharacterStore.getState();
  const ally = charStore.getCharacter(allyId);
  if (!ally?.alive) return;

  // 玩家：走三选一 StoryEvent（effectKey = allianceDilemma:*）
  if (allyId === playerId) {
    pushPlayerAllianceDilemmaEvent(war.id, allyId, war.attackerId, war.defenderId);
    return;
  }

  // NPC：按好感决定站队
  const attacker = charStore.getCharacter(war.attackerId);
  const defender = charStore.getCharacter(war.defenderId);
  if (!attacker || !defender) {
    applyAllianceDilemmaOutcome(war, allyId, 'neutral');
    return;
  }
  const ts = useTerritoryStore.getState();
  const atkExpectedLeg = ts.expectedLegitimacy.get(war.attackerId) ?? null;
  const defExpectedLeg = ts.expectedLegitimacy.get(war.defenderId) ?? null;
  const allyPolicy = ts.policyOpinionCache.get(allyId) ?? null;
  const atkPolicy = ts.policyOpinionCache.get(war.attackerId) ?? null;
  const defPolicy = ts.policyOpinionCache.get(war.defenderId) ?? null;
  const opAttacker = calculateBaseOpinion(ally, attacker, atkExpectedLeg, allyPolicy, atkPolicy);
  const opDefender = calculateBaseOpinion(ally, defender, defExpectedLeg, allyPolicy, defPolicy);
  let chosenSide: 'attacker' | 'defender' | 'neutral';
  if (opAttacker > opDefender && opAttacker > 0) chosenSide = 'attacker';
  else if (opDefender > opAttacker && opDefender > 0) chosenSide = 'defender';
  else chosenSide = 'neutral';

  applyAllianceDilemmaOutcome(war, allyId, chosenSide);
}

/** 共用落地函数：冲突盟友的三种结局 */
export function applyAllianceDilemmaOutcome(
  war: War,
  allyId: string,
  outcome: 'attacker' | 'defender' | 'neutral',
): void {
  const cs = useCharacterStore.getState();
  const ws = useWarStore.getState();
  const ally = cs.getCharacter(allyId);
  if (!ally) return;
  const allyName = ally.name;
  const attackerName = cs.getCharacter(war.attackerId)?.name ?? '?';
  const defenderName = cs.getCharacter(war.defenderId)?.name ?? '?';

  if (outcome === 'neutral') {
    // 两盟俱碎：断两份同盟 + 双份背盟好感，但只付一次资源惩罚（情有可原）
    ws.breakAllianceBetween(allyId, war.attackerId);
    ws.breakAllianceBetween(allyId, war.defenderId);
    cs.addResources(allyId, ALLIANCE_BETRAYAL_PENALTY);
    cs.addOpinion(war.attackerId, allyId, { reason: '两盟相绞弃援', value: ALLIANCE_BETRAYAL_OPINION, decayable: true });
    cs.addOpinion(war.defenderId, allyId, { reason: '两盟相绞弃援', value: ALLIANCE_BETRAYAL_OPINION, decayable: true });
    emitChronicleEvent({
      type: '两盟相绞',
      actors: [allyId, war.attackerId, war.defenderId],
      territories: [],
      description: `${allyName}身处${attackerName}与${defenderName}之盟夹缝，左右为难，两不相助，盟约俱碎`,
      priority: EventPriority.Major,
    });
    return;
  }

  // 选了一方：断另一方的同盟（等同背盟），保留本方同盟
  const chosenLeaderId = outcome === 'attacker' ? war.attackerId : war.defenderId;
  const abandonedLeaderId = outcome === 'attacker' ? war.defenderId : war.attackerId;
  const chosenName = outcome === 'attacker' ? attackerName : defenderName;
  const abandonedName = outcome === 'attacker' ? defenderName : attackerName;

  ws.breakAllianceBetween(allyId, abandonedLeaderId);
  cs.addResources(allyId, ALLIANCE_BETRAYAL_PENALTY);
  cs.addOpinion(abandonedLeaderId, allyId, { reason: '两盟相绞背援', value: ALLIANCE_BETRAYAL_OPINION, decayable: true });
  cs.addOpinion(allyId, abandonedLeaderId, { reason: '两盟相绞背援', value: -30, decayable: true });
  emitChronicleEvent({
    type: '两盟相绞',
    actors: [allyId, chosenLeaderId, abandonedLeaderId],
    territories: [],
    description: `${allyName}身处两盟夹缝，择助${chosenName}，背弃与${abandonedName}的盟约`,
    priority: EventPriority.Major,
  });

  // 加入所选一方（可能触发反戈）
  const mustRebel = ally.overlordId != null && ally.overlordId === abandonedLeaderId;
  if (mustRebel) {
    const overlordId = ally.overlordId!;
    const overlordName = cs.getCharacter(overlordId)?.name ?? '?';
    cs.updateCharacter(allyId, { overlordId: undefined });
    emitChronicleEvent({
      type: '同盟反戈',
      actors: [allyId, overlordId, chosenLeaderId],
      territories: [],
      description: `${allyName}为履行盟约，叛离${overlordName}，起兵助${chosenName}`,
      priority: EventPriority.Major,
    });
  }
  ws.addParticipant(war.id, allyId, outcome);
  emitChronicleEvent({
    type: '同盟参战',
    actors: [allyId, chosenLeaderId, abandonedLeaderId],
    territories: [],
    description: `${allyName}依盟约加入${chosenName}对${abandonedName}的战争`,
    priority: EventPriority.Major,
  });
}

/** 玩家冲突盟友：三选一弹窗 */
function pushPlayerAllianceDilemmaEvent(
  warId: string,
  playerId: string,
  attackerId: string,
  defenderId: string,
): void {
  const cs = useCharacterStore.getState();
  const attackerName = cs.getCharacter(attackerId)?.name ?? '?';
  const defenderName = cs.getCharacter(defenderId)?.name ?? '?';

  useStoryEventBus.getState().pushStoryEvent({
    id: crypto.randomUUID(),
    title: '两盟相绞',
    description: `${attackerName}与${defenderName}开战，然两人皆是你的盟友——无论如何抉择，必有一盟要碎。`,
    actors: [
      { characterId: attackerId, role: '盟友 / 攻方' },
      { characterId: playerId, role: '你' },
      { characterId: defenderId, role: '盟友 / 守方' },
    ],
    options: [
      {
        label: `助${attackerName}，背弃${defenderName}`,
        description: `加入攻方。与${defenderName}的盟约破裂（威望 -120 / 正统性 -80）。`,
        effects: [
          { label: '威望', value: -120, type: 'negative' },
          { label: '正统性', value: -80, type: 'negative' },
        ],
        effectKey: 'allianceDilemma:pickAttacker',
        effectData: { warId, allyId: playerId, attackerId, defenderId },
        onSelect: () => {},
      },
      {
        label: `助${defenderName}，背弃${attackerName}`,
        description: `加入守方。与${attackerName}的盟约破裂（威望 -120 / 正统性 -80）。`,
        effects: [
          { label: '威望', value: -120, type: 'negative' },
          { label: '正统性', value: -80, type: 'negative' },
        ],
        effectKey: 'allianceDilemma:pickDefender',
        effectData: { warId, allyId: playerId, attackerId, defenderId },
        onSelect: () => {},
      },
      {
        label: '两不相助，两盟俱碎',
        description: '拒绝出兵，但因两盟冲突事出有因，只付一份代价（威望 -120 / 正统性 -80），两份同盟俱碎。',
        effects: [
          { label: '威望', value: -120, type: 'negative' },
          { label: '正统性', value: -80, type: 'negative' },
        ],
        effectKey: 'allianceDilemma:neutral',
        effectData: { warId, allyId: playerId, attackerId, defenderId },
        onSelect: () => {},
      },
    ],
  });
}

/** 推送"履行盟约 / 拒绝参战（背盟）"决策弹窗给玩家 */
function pushPlayerAutoJoinEvent(
  warId: string,
  side: 'attacker' | 'defender',
  summonerId: string,
  enemyLeaderId: string,
  mustRebel: boolean,
): void {
  const charStore = useCharacterStore.getState();
  const playerId = charStore.playerId!;
  const player = charStore.getCharacter(playerId);
  const summonerName = charStore.getCharacter(summonerId)?.name ?? '?';
  const enemyName = charStore.getCharacter(enemyLeaderId)?.name ?? '?';
  // 反戈时，被离弃的领主 = enemyLeaderId（即 player.overlordId）
  const overlordId = mustRebel ? player?.overlordId : undefined;

  // 描述与选项措辞因场景而异：反戈场景要明确告知"接受 = 起兵反 X"
  const description = mustRebel
    ? `${summonerName}与${enemyName}开战。作为其盟友你须履行盟约——但${enemyName}正是你的领主。起兵相助，便是反叛；袖手旁观，便是背盟。`
    : `${summonerName}与${enemyName}开战，你作为其盟友，须履行盟约参战。背弃盟约将使你声名扫地。`;

  const acceptLabel = mustRebel ? '起兵反戈，履行盟约' : '履行盟约，出兵相助';
  const acceptDesc = mustRebel
    ? `切断与${enemyName}的臣属关系，加入战争站在盟友一方。此举等同叛乱，再无回头之路。`
    : '加入战争站在盟友一方。';

  useStoryEventBus.getState().pushStoryEvent({
    id: crypto.randomUUID(),
    title: mustRebel ? '盟约抉择：反戈或背盟' : '盟约召唤',
    description,
    actors: [
      { characterId: summonerId, role: '盟友' },
      { characterId: playerId, role: '你' },
      { characterId: enemyLeaderId, role: mustRebel ? '领主' : '敌方' },
    ],
    options: [
      {
        label: acceptLabel,
        description: acceptDesc,
        effects: mustRebel ? [{ label: '脱离臣属', value: 0, type: 'neutral' }] : [],
        effectKey: 'allianceAutoJoin:accept',
        effectData: {
          warId,
          side,
          allyId: playerId,
          summonerId,
          severOverlordId: overlordId ?? null,
        },
        onSelect: () => {},
      },
      {
        label: '背弃盟约，拒绝参战',
        description: mustRebel
          ? '维持臣属关系，拒绝出兵。付出沉重代价（威望 -120，正统性 -80，同盟终止）。'
          : '拒绝出兵 = 背盟，付出沉重代价（威望 -120，正统性 -80，同盟终止）。',
        effects: [
          { label: '威望', value: -120, type: 'negative' },
          { label: '正统性', value: -80, type: 'negative' },
        ],
        effectKey: 'allianceAutoJoin:reject',
        effectData: { warId, allyId: playerId, summonerId },
        onSelect: () => {},
      },
    ],
  });
}
