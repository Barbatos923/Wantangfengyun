// ===== NPC 提议结盟行为 =====
//
// 独立统治者每月一次扫描周边，挑选最佳结盟对象。
// target = NPC → 直接走 executeProposeAlliance 骰子决定。
// target = 玩家 → pushStoryEvent 由玩家决定（不走 PlayerTask 通路）。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { executeProposeAlliance, previewProposeAlliance, canEnterAlliance } from '@engine/interaction/proposeAllianceAction';
import { useStoryEventBus, type StoryEvent } from '@engine/storyEventBus';
import { useWarStore } from '@engine/military/WarStore';
import { useNpcStore } from '../NpcStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { toAbsoluteDay } from '@engine/dateUtils';
import { MAX_ALLIANCES_PER_RULER } from '@engine/military/types';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { buildZhouAdjacency } from '@engine/military/deployCalc';
import { getSovereigntyTier } from '@engine/official/postQueries';
import { registerBehavior } from './index';

interface ProposeAllianceData {
  targetId: string;
}

/** 两跳内可达（领地相邻 或 相邻的相邻） */
function isWithinTwoHops(
  aId: string,
  bId: string,
  ctx: NpcContext,
): boolean {
  const aTerr = ctx.controllerIndex.get(aId);
  const bTerr = ctx.controllerIndex.get(bId);
  if (!aTerr?.size || !bTerr?.size) return false;
  const aZhou: string[] = [];
  const bZhou = new Set<string>();
  for (const tId of aTerr) {
    if (ctx.territories.get(tId)?.tier === 'zhou') aZhou.push(tId);
  }
  for (const tId of bTerr) {
    if (ctx.territories.get(tId)?.tier === 'zhou') bZhou.add(tId);
  }
  if (aZhou.length === 0 || bZhou.size === 0) return false;
  const adj = buildZhouAdjacency();
  // 1 跳
  for (const z of aZhou) {
    const neighbors = adj.get(z);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (bZhou.has(n)) return true;
    }
  }
  // 2 跳
  for (const z of aZhou) {
    const neighbors = adj.get(z);
    if (!neighbors) continue;
    for (const n of neighbors) {
      const neighbors2 = adj.get(n);
      if (!neighbors2) continue;
      for (const n2 of neighbors2) {
        if (bZhou.has(n2)) return true;
      }
    }
  }
  return false;
}

function countCommonEnemies(aId: string, bId: string, ctx: NpcContext): number {
  const aEnemies = new Set<string>();
  const bEnemies = new Set<string>();
  for (const w of ctx.activeWars) {
    if (w.status !== 'active') continue;
    if (isWarParticipant(aId, w)) {
      const isAttacker = w.attackerId === aId || w.attackerParticipants.includes(aId);
      aEnemies.add(isAttacker ? w.defenderId : w.attackerId);
    }
    if (isWarParticipant(bId, w)) {
      const isAttacker = w.attackerId === bId || w.attackerParticipants.includes(bId);
      bEnemies.add(isAttacker ? w.defenderId : w.attackerId);
    }
  }
  let count = 0;
  for (const e of aEnemies) {
    if (bEnemies.has(e)) count++;
  }
  return count;
}

/** 评估 actor 对自身的威胁度（有强敌 / 在劣势战争中） */
function selfThreatLevel(actor: Character, ctx: NpcContext): number {
  let threat = 0;
  for (const w of ctx.activeWars) {
    if (w.status !== 'active') continue;
    if (!isWarParticipant(actor.id, w)) continue;
    const isAttacker = w.attackerId === actor.id || w.attackerParticipants.includes(actor.id);
    // 攻方劣势：warScore <= -30 扣分；守方劣势：warScore >= 30 扣分
    if (isAttacker && w.warScore <= -30) threat += 30;
    if (!isAttacker && w.warScore >= 30) threat += 30;
    threat += 10; // 参战本身就是威胁
  }
  return threat;
}

export const proposeAllianceBehavior: NpcBehavior<ProposeAllianceData> = {
  id: 'proposeAlliance',
  playerMode: 'skip', // 玩家被提议时直接 pushStoryEvent，不走通用 push-task 通路

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<ProposeAllianceData> | null {
    if (!canEnterAlliance(actor, ctx.territories)) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const currentDay = toAbsoluteDay(ctx.date);
    const warStore = useWarStore.getState();
    // 已达同盟上限
    if (warStore.getAllies(actor.id, currentDay).length >= MAX_ALLIANCES_PER_RULER) return null;

    // 当前处于 warScore >= 30 的优势战争 → 不需要额外盟友（避免滚雪球）
    for (const w of ctx.activeWars) {
      if (!isWarParticipant(actor.id, w)) continue;
      const isAttacker = w.attackerId === actor.id || w.attackerParticipants.includes(actor.id);
      if (isAttacker && w.warScore >= 30) return null;
      if (!isAttacker && w.warScore <= -30) return null;
    }

    const actorTier = getSovereigntyTier(actor.id, ctx.territories, ctx.centralPosts);
    if (actorTier === 0) return null;

    const npcStore = useNpcStore.getState();
    let bestWeight = 0;
    let bestTarget: string | null = null;

    for (const target of ctx.characters.values()) {
      if (target.id === actor.id) continue;
      if (!canEnterAlliance(target, ctx.territories)) continue;
      // 不能和自己的直接领主或自己的直接臣属结盟（避免同一效忠链条内结盟导致语义混乱）
      if (actor.overlordId === target.id || target.overlordId === actor.id) continue;

      // 已有同盟 / 活跃对立战争 → 跳过
      if (warStore.hasAlliance(actor.id, target.id, currentDay)) continue;
      let activeWarBetween = false;
      for (const w of ctx.activeWars) {
        if (isWarParticipant(actor.id, w) && isWarParticipant(target.id, w)) {
          activeWarBetween = true;
          break;
        }
      }
      if (activeWarBetween) continue;

      // target 已达同盟上限
      if (warStore.getAllies(target.id, currentDay).length >= MAX_ALLIANCES_PER_RULER) continue;

      // 提议冷却
      if (npcStore.isAllianceProposalCooldown(actor.id, target.id, currentDay)) continue;

      // 好感门槛
      const opinion = ctx.getOpinion(actor.id, target.id);
      if (opinion < 20) continue;

      // tier 同级或相邻一档
      const targetTier = getSovereigntyTier(target.id, ctx.territories, ctx.centralPosts);
      if (targetTier === 0) continue;
      if (Math.abs(targetTier - actorTier) > 1) continue;

      // 两跳内邻接
      if (!isWithinTwoHops(actor.id, target.id, ctx)) continue;

      // 权重计算
      const commonEnemies = countCommonEnemies(actor.id, target.id, ctx);
      const selfThreat = selfThreatLevel(actor, ctx);
      const modifiers: WeightModifier[] = [
        { label: '基础', add: 10 },
        { label: '好感', add: opinion * 0.3 },
        { label: '共同敌人', add: commonEnemies * 30 },
        { label: '受威胁', add: selfThreat * 0.8 },
        { label: '荣誉', add: personality.honor * 10 },
        { label: '理性', add: personality.rationality * 5 },
      ];
      const weight = calcWeight(modifiers);

      if (weight > bestWeight) {
        bestWeight = weight;
        bestTarget = target.id;
      }
    }

    if (!bestTarget || bestWeight <= 10) return null;

    return {
      data: { targetId: bestTarget },
      weight: bestWeight,
    };
  },

  executeAsNpc(actor: Character, data: ProposeAllianceData, ctx: NpcContext) {
    // target 是玩家 → pushStoryEvent，让玩家在 UI 上决定
    if (data.targetId === ctx.playerId) {
      const preview = previewProposeAlliance(actor.id, data.targetId);
      if (!preview) return;
      const target = useCharacterStore.getState().getCharacter(data.targetId);
      if (!target) return;
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '结盟请使',
        description: `${actor.name}遣使来访，提议与你缔结盟约，约定三年内互相参战、共御外敌。`,
        actors: [
          { characterId: actor.id, role: '提议者' },
          { characterId: data.targetId, role: '你' },
        ],
        options: [
          {
            label: '接受提议，缔结盟约',
            description: '与对方缔结三年同盟。战争时双方自动参战，双方好感 +30。',
            effects: [
              { label: '好感', value: 30, type: 'positive' },
            ],
            effectKey: 'proposeAlliance:accept',
            effectData: { proposerId: actor.id, targetId: data.targetId },
            onSelect: () => {},
          },
          {
            label: '婉拒',
            description: '不接受此次结盟提议。对方好感轻微下降。',
            effects: [
              { label: '好感', value: -10, type: 'negative' },
            ],
            effectKey: 'proposeAlliance:reject',
            effectData: { proposerId: actor.id, targetId: data.targetId },
            onSelect: () => {},
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    // target 是 NPC → 直接走 execute
    executeProposeAlliance(actor.id, data.targetId);
  },
};

registerBehavior(proposeAllianceBehavior);
