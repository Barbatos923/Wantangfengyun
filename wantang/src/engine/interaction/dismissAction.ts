// ===== "罢免职位"交互 =====

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { refreshPlayerLedger } from './appointAction';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { collectRulerIds } from '@engine/official/postQueries';

/** 注册罢免交互 */
registerInteraction({
  id: 'dismiss',
  name: '罢免职位',
  icon: '❌',
  canShow: (player, target) => {
    // target 必须是臣属且持有非 grantsControl 岗位
    return getDismissablePosts(player, target).length > 0;
  },
  paramType: 'dismiss',
});

/** 获取臣属持有的非 grantsControl 岗位（京官、地方副岗） */
export function getDismissablePosts(
  player: Character,
  target: Character,
): Post[] {
  if (target.overlordId !== player.id) return [];
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(target.id);
  return posts.filter(p => {
    const tpl = positionMap.get(p.templateId);
    // grantsControl 岗位走"剥夺领地"流程，不在此处罢免
    return !tpl?.grantsControl;
  });
}

/** 执行罢免：统一流程，零特殊分支 */
export function executeDismiss(
  postId: string,
  dismisserId: string,
  opts?: { skipOpinion?: boolean; vacateOnly?: boolean },
): void {
  const terrStore = useTerritoryStore.getState();
  const date = useTurnManager.getState().currentDate;
  const post = terrStore.findPost(postId);
  if (!post) return;

  const tpl = positionMap.get(post.templateId);
  const previousHolderId = post.holderId;

  // 如果是领地主岗位(grantsControl)
  if (tpl?.grantsControl) {
    if (opts?.vacateOnly) {
      // 铨选调动：仅清空，不让罢免者接管（后续 executeAppoint 立刻安排新人）
      terrStore.updatePost(postId, {
        holderId: null,
        appointedBy: undefined,
        appointedDate: undefined,
      });
    } else {
      // 正常罢免：罢免者自动接管
      terrStore.updatePost(postId, {
        holderId: dismisserId,
        appointedBy: 'system',
        appointedDate: { year: date.year, month: date.month, day: date.day },
      });
      // 该岗位绑定的军队随岗位易手
      useMilitaryStore.getState().syncArmyOwnersByPost(postId, dismisserId);
    }
  } else {
    // 普通岗位：清空
    terrStore.updatePost(postId, {
      holderId: null,
      appointedBy: undefined,
      appointedDate: undefined,
    });
  }

  // 好感修正：被罢免者对罢免者好感降低（按品级，可衰减）
  // skipOpinion: 铨选调动等合规场景跳过惩罚
  if (previousHolderId && tpl && !opts?.skipOpinion) {
    const charStore = useCharacterStore.getState();
    const opinion = -Math.floor(5 + (tpl.minRank / 29) * 25);
    charStore.addOpinion(previousHolderId, dismisserId, {
      reason: `罢免${tpl.name}`,
      value: opinion,
      decayable: true,
    });
  }

  // 更新被罢免者 overlordId：仅 grantsControl 岗位罢免时处理
  // 非 grantsControl（副岗/京官）罢免不改变效忠关系——丢副职不等于换领主
  // vacateOnly 时跳过：铨选调动只是腾岗，被调人立刻会在新岗位获得正确的 overlordId
  // 仍持有其他 grantsControl 岗位时不改变 overlordId——仍是统治者，现有效忠关系有效
  if (previousHolderId && previousHolderId !== dismisserId && tpl?.grantsControl && !opts?.vacateOnly) {
    const terrStoreNow = useTerritoryStore.getState();
    const remainingControlPosts = terrStoreNow.getPostsByHolder(previousHolderId)
      .filter(p => p.id !== postId && positionMap.get(p.templateId)?.grantsControl);
    if (remainingControlPosts.length === 0) {
      // 彻底无领地：回归罢免者人才池
      const charStore = useCharacterStore.getState();
      charStore.updateCharacter(previousHolderId, { overlordId: dismisserId });
    }
  }

  // 级联效忠：主岗易手时，法理下级主岗持有人 + 本领地副岗持有人的 overlordId 回退给接管者
  // vacateOnly 时跳过：新任者就任后 executeAppoint 会正确处理归附
  if (previousHolderId && tpl?.grantsControl && post.territoryId && !opts?.vacateOnly) {
    const charStore = useCharacterStore.getState();
    const terrStoreForCascade = useTerritoryStore.getState();
    const terr = terrStoreForCascade.territories.get(post.territoryId);
    if (terr) {
      const cascadeIds: string[] = [];

      // 1. 法理下级主岗持有人（子领地的 grantsControl holder）
      for (const childId of terr.childIds) {
        const child = terrStoreForCascade.territories.get(childId);
        if (!child) continue;
        const childMainPost = child.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
        if (childMainPost?.holderId) {
          const holder = charStore.getCharacter(childMainPost.holderId);
          if (holder?.alive && holder.overlordId === previousHolderId) {
            cascadeIds.push(childMainPost.holderId);
          }
        }
      }

      // 2. 本领地副岗持有人（同领地非 grantsControl 岗位）
      for (const p of terr.posts) {
        if (positionMap.get(p.templateId)?.grantsControl) continue;
        if (!p.holderId) continue;
        const holder = charStore.getCharacter(p.holderId);
        if (holder?.alive && holder.overlordId === previousHolderId) {
          cascadeIds.push(p.holderId);
        }
      }

      // 批量更新（排除 dismisser 自身防止自我领主）
      const filteredCascadeIds = cascadeIds.filter(cid => cid !== dismisserId);
      if (filteredCascadeIds.length > 0) {
        charStore.batchMutate(chars => {
          for (const cid of filteredCascadeIds) {
            const c = chars.get(cid);
            if (c) c.overlordId = dismisserId;
          }
        });
      }
    }
  }

  // 治所联动：罢免道级 grantsControl 岗位时，一并罢免同人的治所刺史
  // vacateOnly 时跳过：executeAppoint 的治所联动会处理
  if (previousHolderId && tpl?.grantsControl && post.territoryId && !opts?.vacateOnly) {
    const terrStoreNow = useTerritoryStore.getState();
    const dao = terrStoreNow.territories.get(post.territoryId);
    if (dao?.capitalZhouId) {
      const capitalZhou = terrStoreNow.territories.get(dao.capitalZhouId);
      if (capitalZhou) {
        const capitalPost = capitalZhou.posts.find(p => {
          const t = positionMap.get(p.templateId);
          return t?.grantsControl === true;
        });
        if (capitalPost && capitalPost.holderId === previousHolderId) {
          // 罢免者接管治所（与道级同逻辑）
          terrStoreNow.updatePost(capitalPost.id, {
            holderId: dismisserId,
            appointedBy: 'system',
            appointedDate: { year: date.year, month: date.month, day: date.day },
          });
          useMilitaryStore.getState().syncArmyOwnersByPost(capitalPost.id, dismisserId);
        }
      }
    }
  }

  // 立即重算玩家 ledger
  refreshPlayerLedger();

  // 更新正统性预期缓存
  if (previousHolderId) {
    useTerritoryStore.getState().updateExpectedLegitimacy(previousHolderId);
  }
  if (tpl?.grantsControl) {
    useTerritoryStore.getState().updateExpectedLegitimacy(dismisserId);
  }

  // 刷新 isRuler（岗位持有人变化）
  const rulerIds = collectRulerIds(useTerritoryStore.getState().territories);
  useCharacterStore.getState().refreshIsRuler(rulerIds);
}
