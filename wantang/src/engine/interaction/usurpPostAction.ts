// ===== "篡夺头衔"交互 =====

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { collectRulerIds } from '@engine/official/postQueries';
import { EventPriority } from '@engine/types';
import { canUsurpPost, calcRealmControlRatio, calcPostManageCost } from '@engine/official/postManageCalc';

/** 注册篡夺交互 */
registerInteraction({
  id: 'usurpPost',
  name: '篡夺头衔',
  icon: '⚡',
  canShow: (player, target) => {
    if (player.id === target.id) return false;
    return getUsurpablePosts(player, target).length > 0;
  },
  paramType: 'usurpPost',
});

/** 获取 target 持有的、可被 player 篡夺的 grantsControl 岗位 */
export function getUsurpablePosts(
  player: Character,
  target: Character,
): Post[] {
  const terrStore = useTerritoryStore.getState();
  const characters = useCharacterStore.getState().characters;
  const wars = useWarStore.getState().getActiveWars();
  const posts = terrStore.getPostsByHolder(target.id);

  return posts.filter(p => {
    const tpl = positionMap.get(p.templateId);
    if (!tpl?.grantsControl) return false;
    const territory = p.territoryId ? terrStore.territories.get(p.territoryId) : undefined;
    if (!territory) return false;
    return canUsurpPost(player.id, p, territory, terrStore.territories, characters, wars).eligible;
  });
}

/** 篡夺预览信息 */
export interface UsurpPreview {
  post: Post;
  territoryName: string;
  postName: string;
  controlRatio: number;
  cost: { money: number; prestige: number };
}

/** 获取篡夺预览（UI 用） */
export function previewUsurp(playerId: string, targetId: string): UsurpPreview[] {
  const charStore = useCharacterStore.getState();
  const player = charStore.getCharacter(playerId);
  const target = charStore.getCharacter(targetId);
  if (!player || !target) return [];

  const terrStore = useTerritoryStore.getState();
  const usurpable = getUsurpablePosts(player, target);

  return usurpable.map(p => {
    const territory = terrStore.territories.get(p.territoryId!);
    const tpl = positionMap.get(p.templateId);
    return {
      post: p,
      territoryName: territory?.name ?? '',
      postName: tpl?.name ?? '',
      controlRatio: calcRealmControlRatio(p.territoryId!, playerId, terrStore.territories, useCharacterStore.getState().characters),
      cost: calcPostManageCost('usurp', territory?.tier ?? 'dao'),
    };
  });
}

/**
 * 执行篡夺（引擎层，NPC 可直接调用）。
 */
export function executeUsurp(postId: string, actorId: string): void {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;

  const post = terrStore.findPost(postId);
  if (!post || !post.holderId) return;

  const oldHolderId = post.holderId;
  const territory = post.territoryId ? terrStore.territories.get(post.territoryId) : undefined;
  const tpl = positionMap.get(post.templateId);

  // 扣除资源
  const tier = territory?.tier ?? 'dao';
  const cost = calcPostManageCost('usurp', tier);
  charStore.addResources(actorId, { money: -cost.money, prestige: -cost.prestige });

  // 更新岗位持有人
  terrStore.updatePost(postId, {
    holderId: actorId,
    appointedBy: actorId,
    appointedDate: { year: date.year, month: date.month, day: date.day },
  });

  // 篡夺者好感惩罚
  charStore.addOpinion(oldHolderId, actorId, {
    reason: '篡夺者',
    value: -40,
    decayable: true,
  });

  // 本领地副岗持有人归附新持有者（与 executeAppoint 级联逻辑一致）
  if (territory) {
    const freshTerr = useTerritoryStore.getState().territories.get(territory.id);
    if (freshTerr) {
      const cascadeIds: string[] = [];
      for (const p of freshTerr.posts) {
        if (positionMap.get(p.templateId)?.grantsControl) continue;
        if (!p.holderId || p.holderId === actorId) continue;
        const holder = charStore.getCharacter(p.holderId);
        if (holder?.alive && holder.overlordId !== actorId) {
          cascadeIds.push(p.holderId);
        }
      }
      if (cascadeIds.length > 0) {
        charStore.batchMutate(chars => {
          for (const cid of cascadeIds) {
            const c = chars.get(cid);
            if (c) c.overlordId = actorId;
          }
        });
      }
    }
  }

  // 道级篡夺：治所州联动转移（仅当治所仍在旧持有者手中）
  if (territory && territory.tier === 'dao' && territory.capitalZhouId) {
    const capZhou = useTerritoryStore.getState().territories.get(territory.capitalZhouId);
    if (capZhou) {
      const capPost = capZhou.posts.find(p => positionMap.get(p.templateId)?.grantsControl === true);
      if (capPost && capPost.holderId === oldHolderId) {
        useTerritoryStore.getState().updatePost(capPost.id, {
          holderId: actorId,
          appointedBy: actorId,
          appointedDate: { year: date.year, month: date.month, day: date.day },
        });
        useMilitaryStore.getState().syncArmyOwnersByPost(capPost.id, actorId);
      }
    }
  }

  // 配套三连
  useMilitaryStore.getState().syncArmyOwnersByPost(postId, actorId);
  charStore.refreshIsRuler(collectRulerIds(useTerritoryStore.getState().territories));
  useTerritoryStore.getState().updateExpectedLegitimacy(actorId);
  useTerritoryStore.getState().updateExpectedLegitimacy(oldHolderId);

  // 记录事件
  const actorName = charStore.getCharacter(actorId)?.name ?? '';
  const oldHolderName = charStore.getCharacter(oldHolderId)?.name ?? '';
  useTurnManager.getState().addEvent({
    id: crypto.randomUUID(),
    date: { ...date },
    type: '篡夺头衔',
    actors: [actorId, oldHolderId],
    territories: territory ? [territory.id] : [],
    description: `${actorName}篡夺了${oldHolderName}的${territory?.name ?? ''}${tpl?.name ?? ''}`,
    priority: EventPriority.Major,
  });
}
