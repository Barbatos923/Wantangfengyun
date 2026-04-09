// ===== 决议：销毁头衔 =====

import { registerDecision } from './registry';
import type { DecisionTarget } from './types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { canDestroyPost, calcPostManageCost } from '@engine/official/postManageCalc';
import { EventPriority } from '@engine/types';
import type { Post } from '@engine/territory/types';
import { destroyMainPost, refreshPostCaches } from '@engine/official/postTransfer';

// ── 查询辅助 ──────────────────────────────────────────────────

/** 获取 actor 持有的所有 grantsControl 岗位 */
function getHeldGrantsPosts(actorId: string): Post[] {
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(actorId);
  return posts.filter(p => positionMap.get(p.templateId)?.grantsControl === true);
}

/** 获取 actor 可销毁的国级岗位 */
export function getDestroyablePosts(actorId: string): Post[] {
  const grantsPosts = getHeldGrantsPosts(actorId);
  return grantsPosts.filter(p => canDestroyPost(actorId, p, grantsPosts).eligible);
}

// ── 执行函数（引擎层，NPC 可直接调用） ───────────────────────

export function executeDestroyTitle(actorId: string, postId: string): boolean {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;

  const post = terrStore.findPost(postId);
  if (!post || post.holderId !== actorId) return false;

  const territory = post.territoryId ? terrStore.territories.get(post.territoryId) : undefined;
  const tpl = positionMap.get(post.templateId);

  // 执行瞬间二次校验：弹窗打开期间持有岗位 / 资源都可能变化
  const grantsPosts = getHeldGrantsPosts(actorId);
  const eligibility = canDestroyPost(actorId, post, grantsPosts);
  if (!eligibility.eligible) return false;
  const cost = calcPostManageCost('destroy', 'guo');
  const actor = charStore.getCharacter(actorId);
  if (!actor || actor.resources.prestige < cost.prestige) return false;

  // 扣除资源
  charStore.addResources(actorId, { prestige: -cost.prestige });

  // 对 guo 下 de jure dao 控制者施加好感惩罚
  if (territory) {
    for (const childId of territory.childIds) {
      const child = terrStore.territories.get(childId);
      if (!child) continue;
      for (const p of child.posts) {
        if (positionMap.get(p.templateId)?.grantsControl === true && p.holderId && p.holderId !== actorId) {
          charStore.addOpinion(p.holderId, actorId, {
            reason: '销毁头衔',
            value: -40,
            decayable: true,
          });
        }
      }
    }
  }

  // 清空副岗 + 军队变私兵 + 移除主岗
  if (territory) {
    destroyMainPost(postId, territory.id);
  } else {
    terrStore.removePost(postId);
  }

  // 缓存刷新
  refreshPostCaches([actorId]);

  // 记录事件
  useTurnManager.getState().addEvent({
    id: crypto.randomUUID(),
    date: { ...date },
    type: '销毁头衔',
    actors: [actorId],
    territories: territory ? [territory.id] : [],
    description: `${charStore.getCharacter(actorId)?.name ?? ''}销毁了${territory?.name ?? ''}${tpl?.name ?? '岗位'}`,
    priority: EventPriority.Major,
  });

  return true;
}

// ── 决议注册 ──────────────────────────────────────────────────

registerDecision({
  id: 'destroyTitle',
  name: '销毁头衔',
  icon: '🔥',
  description: '放弃持有的国级头衔，使之回归未建制状态',

  canShow: (actorId) => {
    return getDestroyablePosts(actorId).length > 0;
  },

  canExecute: (actorId) => {
    const reasons: string[] = [];
    if (getDestroyablePosts(actorId).length === 0) reasons.push('无可销毁的国级岗位');

    const actor = useCharacterStore.getState().getCharacter(actorId);
    const cost = calcPostManageCost('destroy', 'guo');
    if (actor && actor.resources.prestige < cost.prestige) reasons.push(`名望不足（需 ${cost.prestige}）`);

    return { executable: reasons.length === 0, reasons };
  },

  getTargets: (actorId) => {
    const terrStore = useTerritoryStore.getState();
    const grantsPosts = getHeldGrantsPosts(actorId);
    const cost = calcPostManageCost('destroy', 'guo');
    const targets: DecisionTarget[] = [];

    for (const p of grantsPosts) {
      const result = canDestroyPost(actorId, p, grantsPosts);
      const territory = p.territoryId ? terrStore.territories.get(p.territoryId) : undefined;
      const tpl = positionMap.get(p.templateId);
      targets.push({
        id: p.id,
        label: `${territory?.name ?? ''} ${tpl?.name ?? ''}`,
        eligible: result.eligible,
        reason: result.reason,
        cost,
      });
    }

    return targets;
  },

  execute: (actorId, targetId) => {
    if (!targetId) return false;
    return executeDestroyTitle(actorId, targetId);
  },
});
