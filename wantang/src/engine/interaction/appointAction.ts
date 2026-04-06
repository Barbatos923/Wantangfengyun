// ===== "任命职位"交互 =====

import type { Character } from '@engine/character/types';
import type { Post, Territory } from '@engine/territory/types';
import { findAppointRightHolder } from '@engine/character/successionUtils';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { getActualController, getHeldPosts } from '@engine/official/officialUtils';
import { executeDismiss } from './dismissAction';
import {
  seatPost,
  vacatePost,
  syncArmyForPost,
  cascadeSecondaryOverlord,
  capitalZhouSeat,
  refreshPostCaches,
  refreshLegitimacyForChar,
} from '@engine/official/postTransfer';

/** 注册任命交互 */
registerInteraction({
  id: 'appoint',
  name: '任命职位',
  icon: '📜',
  canShow: (player, target) => {
    // 宽松：target 是臣属即显示
    if (target.overlordId !== player.id) return false;
    if (!target.official) return false;
    if (!player.official) return false;
    return true;
  },
  canExecuteCheck: (player, _target) => {
    if (getAppointablePosts(player).length > 0) return null;
    return '无可任命岗位';
  },
  paramType: 'appoint',
});

/** 获取玩家有权任命的所有岗位（含空缺和已占岗位） */
export function getAppointablePosts(player: Character): Post[] {
  const terrStore = useTerritoryStore.getState();
  const territories = terrStore.territories;
  const centralPosts = terrStore.centralPosts;
  const result: Post[] = [];
  const existingIds = new Set<string>();

  const isEmperor = getHeldPosts(player.id).some(p => p.templateId === 'pos-emperor');

  function addPost(post: Post) {
    if (existingIds.has(post.id)) return;
    result.push(post);
    existingIds.add(post.id);
  }

  for (const t of territories.values()) {
    for (const post of t.posts) {
      // 辟署权拦截
      if (post.territoryId) {
        const rightHolder = findAppointRightHolder(post.territoryId, territories);
        if (rightHolder && rightHolder !== player.id) continue;
        if (rightHolder === player.id) { addPost(post); continue; }
      }
      // 朝廷直辖
      if (isEmperor) {
        addPost(post);
      } else if (getActualController(t) === player.id) {
        addPost(post);
      }
    }
  }

  // 皇帝可管理中央岗位
  if (isEmperor) {
    for (const post of centralPosts) {
      addPost(post);
    }
  }

  // 辟署权持有者：递归收集辖区子领地岗位
  const playerPosts = terrStore.getPostsByHolder(player.id);
  for (const pp of playerPosts) {
    if (!pp.hasAppointRight || !pp.territoryId) continue;
    collectPostsInSubtree(pp.territoryId, territories, result, existingIds);
  }

  return result;
}

/** 向后兼容：只返回空缺岗位 */
export function getAppointableVacantPosts(player: Character): Post[] {
  return getAppointablePosts(player).filter(p => p.holderId === null);
}

/** 递归收集 territoryId 及其所有子领地的岗位（含空缺和已占） */
function collectPostsInSubtree(
  territoryId: string,
  territories: Map<string, Territory>,
  result: Post[],
  existingIds: Set<string>,
): void {
  const territory = territories.get(territoryId);
  if (!territory) return;
  for (const post of territory.posts) {
    if (!existingIds.has(post.id)) {
      result.push(post);
      existingIds.add(post.id);
    }
  }
  for (const childId of territory.childIds) {
    collectPostsInSubtree(childId, territories, result, existingIds);
  }
}

// refreshPlayerLedger 已迁移至 postTransfer.ts，此处 re-export 保持向后兼容
export { refreshPlayerLedger } from '@engine/official/postTransfer';

/** 执行任命：统一流程 */
export function executeAppoint(
  postId: string,
  appointeeId: string,
  appointerId: string,
  vacateOldPost?: boolean,
): void {
  // ── 升调/平调：先清空候选人的当前岗位 ──
  if (vacateOldPost) {
    const ts = useTerritoryStore.getState();
    const currentPosts = ts.getPostsByHolder(appointeeId);
    for (const p of currentPosts) {
      if (p.id !== postId) {
        const pTpl = positionMap.get(p.templateId);
        if (pTpl?.grantsControl) {
          executeDismiss(p.id, appointerId, { skipOpinion: true, vacateOnly: true });
        } else {
          vacatePost(p.id);
        }
      }
    }
  }

  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;

  // ── 0. 如果岗位已有人 → 先处理前任 ──
  const currentPost = terrStore.findPost(postId);
  const previousHolderId = currentPost?.holderId;
  if (previousHolderId && previousHolderId !== appointeeId && previousHolderId !== appointerId) {
    const tpl = positionMap.get(currentPost!.templateId);
    if (tpl) {
      const penalty = -Math.floor(5 + (tpl.minRank / 29) * 25);
      charStore.addOpinion(previousHolderId, appointerId, {
        reason: `罢免${tpl.name}`,
        value: penalty,
        decayable: true,
      });
    }
    charStore.updateCharacter(previousHolderId, { overlordId: appointerId });
  }

  // ── 1. 设置岗位 ──
  const post = terrStore.findPost(postId);
  const appointee = charStore.getCharacter(appointeeId);
  const extra: Partial<Post> = {};
  if (post?.successionLaw === 'bureaucratic') {
    const terr = post.territoryId ? terrStore.territories.get(post.territoryId) : undefined;
    extra.reviewBaseline = {
      population: terr?.basePopulation ?? 0,
      virtue: appointee?.official?.virtue ?? 0,
      date: { year: date.year, month: date.month, day: date.day },
    };
  }
  seatPost(postId, appointeeId, appointerId, date, extra);

  // ── 2. 确保效忠关系 ──
  let effectiveOverlord = appointerId;
  if (post) {
    const postTpl = positionMap.get(post.templateId);
    if (postTpl?.grantsControl && post.territoryId && vacateOldPost) {
      // 铨选调动主岗：沿 parentId 找法理上级主岗持有人
      const terr = terrStore.territories.get(post.territoryId);
      if (terr?.parentId) {
        const parent = terrStore.territories.get(terr.parentId);
        if (parent) {
          const parentMainPost = parent.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
          if (parentMainPost?.holderId) effectiveOverlord = parentMainPost.holderId;
        }
      }
    } else if (!postTpl?.grantsControl && post.territoryId) {
      // 副岗：效忠本领地 grantsControl 主岗持有人
      const terr = terrStore.territories.get(post.territoryId);
      if (terr) {
        const mainPost = terr.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
        if (mainPost?.holderId) effectiveOverlord = mainPost.holderId;
      }
    }
  }
  charStore.updateCharacter(appointeeId, { overlordId: effectiveOverlord });

  // ── 3. 军队随岗位转移 ──
  syncArmyForPost(postId, appointeeId);

  // ── 4. 副岗持有人归附新任者 ──
  if (post) {
    const postTpl = positionMap.get(post.templateId);
    if (postTpl?.grantsControl && post.territoryId) {
      cascadeSecondaryOverlord(post.territoryId, appointeeId);
    }
  }

  // ── 5. 好感修正 ──
  if (post) {
    const tpl = positionMap.get(post.templateId);
    if (tpl) {
      const opinion = Math.floor(5 + (tpl.minRank / 29) * 25);
      charStore.addOpinion(appointeeId, appointerId, {
        reason: `授予${tpl.name}`,
        value: opinion,
        decayable: true,
      });
    }
  }

  // ── 6. 正统性刷新 ──
  refreshLegitimacyForChar(appointeeId);

  // ── 7. 治所联动 ──
  if (post) {
    const postTpl = positionMap.get(post.templateId);
    if (postTpl?.grantsControl && post.territoryId) {
      const capitalExtra: Partial<Post> = {};
      // 治所流官也需要重置考课基线
      const dao = terrStore.territories.get(post.territoryId);
      if (dao?.capitalZhouId) {
        const capitalZhou = terrStore.territories.get(dao.capitalZhouId);
        if (capitalZhou) {
          const capPost = capitalZhou.posts.find(p => positionMap.get(p.templateId)?.grantsControl === true);
          if (capPost?.successionLaw === 'bureaucratic') {
            capitalExtra.reviewBaseline = {
              population: capitalZhou.basePopulation,
              virtue: appointee?.official?.virtue ?? 0,
              date: { year: date.year, month: date.month, day: date.day },
            };
          }
        }
      }
      capitalZhouSeat(post.territoryId, appointeeId, appointerId, date, {
        checkCanTake: true,
        appointerId,
        extra: capitalExtra,
      });
    }
  }

  // ── 8. 缓存刷新 ──
  const affectedIds = [appointeeId];
  if (previousHolderId && previousHolderId !== appointeeId) affectedIds.push(previousHolderId);
  refreshPostCaches(affectedIds);
}
