// ===== "篡夺头衔"交互 =====

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { EventPriority } from '@engine/types';
import { canUsurpPost, calcRealmControlRatio, calcPostManageCost } from '@engine/official/postManageCalc';
import {
  seatPost,
  syncArmyForPost,
  cascadeSecondaryOverlord,
  capitalZhouSeat,
  refreshPostCaches,
  refreshLegitimacyForChar,
  promoteOverlordIfNeeded,
} from '@engine/official/postTransfer';

/** 注册篡夺交互 */
registerInteraction({
  id: 'usurpPost',
  name: '篡夺头衔',
  icon: '⚡',
  canShow: (player, target) => {
    if (player.id === target.id) return false;
    // 宽松：target 持有 dao/guo 级 grantsControl 岗位即显示
    const terrStore = useTerritoryStore.getState();
    const posts = terrStore.getPostsByHolder(target.id);
    return posts.some(p => {
      const tpl = positionMap.get(p.templateId);
      if (!tpl?.grantsControl) return false;
      const territory = p.territoryId ? terrStore.territories.get(p.territoryId) : undefined;
      return territory?.tier === 'dao' || territory?.tier === 'guo';
    });
  },
  canExecuteCheck: (player, target) => {
    const usurpable = getUsurpablePosts(player, target);
    if (usurpable.length > 0) return null;
    // 找出第一个不可篡夺的原因
    const terrStore = useTerritoryStore.getState();
    const characters = useCharacterStore.getState().characters;
    const wars = useWarStore.getState().getActiveWars();
    const posts = terrStore.getPostsByHolder(target.id);
    for (const p of posts) {
      const tpl = positionMap.get(p.templateId);
      if (!tpl?.grantsControl) continue;
      const territory = p.territoryId ? terrStore.territories.get(p.territoryId) : undefined;
      if (!territory) continue;
      if (territory.tier !== 'dao' && territory.tier !== 'guo') continue;
      const result = canUsurpPost(player.id, p, territory, terrStore.territories, characters, wars);
      if (!result.eligible && result.reason) return result.reason;
    }
    return '条件不满足';
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

  // ── 扣除资源 ──
  const tier = territory?.tier ?? 'dao';
  const cost = calcPostManageCost('usurp', tier);
  charStore.addResources(actorId, { money: -cost.money, prestige: -cost.prestige });

  // ── 岗位易手 ──
  seatPost(postId, actorId, actorId, date);

  // ── 好感惩罚 ──
  charStore.addOpinion(oldHolderId, actorId, {
    reason: '篡夺者',
    value: -40,
    decayable: true,
  });

  // ── 副岗持有人归附篡夺者 ──
  if (post.territoryId) {
    cascadeSecondaryOverlord(post.territoryId, actorId);
  }

  // ── 治所联动（仅当治所仍在旧持有者手中） ──
  if (post.territoryId) {
    capitalZhouSeat(post.territoryId, actorId, actorId, date, {
      oldHolderId,
    });
  }

  // ── 军队 ──
  syncArmyForPost(postId, actorId);

  // ── 效忠链提升（篡夺后与原 overlord 平级则上溯） ──
  const TIER_RANK: Record<string, number> = { zhou: 1, dao: 2, guo: 3, tianxia: 4 };
  promoteOverlordIfNeeded(actorId, TIER_RANK[tier] ?? 0);

  // ── 缓存 ──
  refreshPostCaches([actorId, oldHolderId]);

  // ── 正统性刷新 ──
  refreshLegitimacyForChar(actorId);

  // ── 记录事件 ──
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
