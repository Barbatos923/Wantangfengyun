// ===== NPC 转移臣属行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { getActualController } from '@engine/official/postQueries';
import { executeTransferVassal } from '@engine/interaction';
import { positionMap } from '@data/positions';
import { registerBehavior } from './index';
import { useStoryEventBus, type StoryEvent } from '@engine/storyEventBus';

// ── 辅助 ──────────────────────────────────────────────────

/** 获取角色持有的所有 grantsControl 岗位的模板 minRank 数组 */
function getControlPostMinRanks(charId: string, ctx: NpcContext): number[] {
  const ranks: number[] = [];
  for (const terr of ctx.territories.values()) {
    for (const post of terr.posts) {
      if (post.holderId !== charId) continue;
      const tpl = positionMap.get(post.templateId);
      if (tpl?.grantsControl) ranks.push(tpl.minRank);
    }
  }
  return ranks;
}

// ── 辅助：找臣属应转给谁 ──────────────────────────────────

interface TransferPair {
  vassalId: string;
  receiverId: string;
  receiverRank: number; // 用于优先选岗位品级高的 receiver
}

/**
 * 遍历 actor 的直属臣属，找出法理上应归属于 actor 另一个臣属管辖的，
 * 返回所有 (vassal, receiver) 对。
 */
function findTransferPairs(actorId: string, ctx: NpcContext): TransferPair[] {
  // 预计算活跃战争中参战的角色集合，排除正在打仗的臣属
  const atWarSet = new Set<string>();
  for (const w of ctx.activeWars) {
    if (w.status !== 'active') continue;
    for (const id of [w.attackerId, ...w.attackerParticipants, w.defenderId, ...w.defenderParticipants]) {
      atWarSet.add(id);
    }
  }

  const pairs: TransferPair[] = [];

  for (const char of ctx.characters.values()) {
    if (!char.alive || char.overlordId !== actorId) continue;
    if (atWarSet.has(char.id)) continue;

    // 找该臣属持有的 grantsControl 岗位
    for (const terr of ctx.territories.values()) {
      for (const post of terr.posts) {
        if (post.holderId !== char.id) continue;
        const tpl = positionMap.get(post.templateId);
        if (!tpl?.grantsControl) continue;
        if (!post.territoryId) continue;

        // 沿 parentId 向上找：是否有 actor 的其他臣属控制的领地（直接法理上级）
        const postTerr = ctx.territories.get(post.territoryId);
        if (!postTerr?.parentId) continue;

        const parent = ctx.territories.get(postTerr.parentId);
        if (!parent) continue;

        const controllerId = getActualController(parent);
        if (!controllerId || controllerId === actorId || controllerId === char.id) continue;

        // 确认 controller 是 actor 的臣属
        const controller = ctx.characters.get(controllerId);
        if (!controller?.alive || controller.overlordId !== actorId) continue;

        // 品级检查：receiver 岗位品级必须严格高于 vassal（不能同级节度使互转）
        // 用岗位模板 minRank 而非角色个人 rankLevel，避免同职位因个人品级差异绕过
        const receiverPostRank = Math.max(0, ...getControlPostMinRanks(controllerId, ctx));
        const vassalPostRank = Math.max(0, ...getControlPostMinRanks(char.id, ctx));
        if (receiverPostRank <= vassalPostRank) continue;

        pairs.push({ vassalId: char.id, receiverId: controllerId, receiverRank: receiverPostRank });
        break; // 该臣属已找到归属，跳出岗位循环
      }
    }
  }

  return pairs;
}

// ── 行为定义 ────────────────────────────────────────────

interface TransferVassalData {
  vassalId: string;
  receiverId: string;
}

export const transferVassalBehavior: NpcBehavior<TransferVassalData> = {
  id: 'transferVassal',
  playerMode: 'skip', // 玩家从交互菜单发起

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<TransferVassalData> | null {
    if (!actor.isRuler) return null;

    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    if (rankLevel < 17) return null; // 节度使及以上才有转移需求

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const pairs = findTransferPairs(actor.id, ctx);
    if (pairs.length === 0) return null;

    // 优先品级高的 receiver（先整理高层级的法理关系）
    pairs.sort((a, b) => b.receiverRank - a.receiverRank);
    const best = pairs[0];

    const modifiers: WeightModifier[] = [
      { label: '基础', add: 40 },
      { label: '荣誉感', add: personality.honor * 5 },     // 秩序感 → 整理法理关系
      { label: '理性', add: personality.rationality * 5 },  // 理性 → 合理分配
    ];

    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    return { data: { vassalId: best.vassalId, receiverId: best.receiverId }, weight };
  },

  executeAsNpc(actor: Character, data: TransferVassalData, ctx: NpcContext) {
    executeTransferVassal(data.vassalId, data.receiverId, actor.id);

    // 玩家被转移 → 纯通知
    if (data.vassalId === ctx.playerId) {
      const receiverName = ctx.characters.get(data.receiverId)?.name ?? '???';
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '效忠对象变更',
        description: `${actor.name}将你转封给${receiverName}，你此后效忠于${receiverName}。`,
        actors: [
          { characterId: actor.id, role: '转封者' },
          { characterId: data.vassalId, role: '你' },
          { characterId: data.receiverId, role: '新领主' },
        ],
        options: [
          {
            label: '知道了',
            description: '接受新的效忠关系。',
            effects: [],
            effectKey: 'noop:notification',
            onSelect: () => { /* 已执行 */ },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
    }
  },
};

registerBehavior(transferVassalBehavior);
