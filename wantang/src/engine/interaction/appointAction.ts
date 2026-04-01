// ===== "任命职位"交互 =====

import type { Character } from '@engine/character/types';
import type { Post, Territory } from '@engine/territory/types';
import { findAppointRightHolder } from '@engine/character/successionUtils';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { getActualController, getHeldPosts, calculateMonthlyLedger } from '@engine/official/officialUtils';
import { getHighestBaseLegitimacy, getRankLegitimacyCap } from '@engine/official/legitimacyCalc';
import { getHeldPosts as getHeldPostsPure } from '@engine/official/postQueries';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';

/** 注册任命交互 */
registerInteraction({
  id: 'appoint',
  name: '任命职位',
  icon: '📜',
  canShow: (player, target) => {
    if (target.overlordId !== player.id) return false;
    if (!target.official) return false;
    if (!player.official) return false;
    // 检查是否有可任命的岗位（含空缺和已占）
    return getAppointablePosts(player).length > 0;
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

/** 任命/罢免后立即重算玩家 ledger */
export function refreshPlayerLedger(): void {
  const charStore = useCharacterStore.getState();
  const playerId = charStore.playerId;
  if (!playerId) return;
  const player = charStore.getCharacter(playerId);
  if (!player) return;
  const territories = useTerritoryStore.getState().territories;
  const characters = charStore.characters;
  const ledger = calculateMonthlyLedger(player, territories, characters);
  useLedgerStore.getState().updatePlayerLedger(ledger);
}

/** 执行任命：统一流程，零特殊分支 */
export function executeAppoint(
  postId: string,
  appointeeId: string,
  appointerId: string,
  vacateOldPost?: boolean,
): void {
  // 升调/平调：先清空候选人的当前岗位
  if (vacateOldPost) {
    const ts = useTerritoryStore.getState();
    const currentPosts = ts.getPostsByHolder(appointeeId);
    for (const p of currentPosts) {
      if (p.id !== postId) {
        ts.updatePost(p.id, { holderId: null, appointedBy: undefined, appointedDate: undefined });
      }
    }
  }

  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;

  // 0. 如果岗位已有人 → 先罢免前任
  const currentPost = terrStore.findPost(postId);
  const previousHolderId = currentPost?.holderId;
  if (previousHolderId && previousHolderId !== appointeeId) {
    // 好感减损
    const tpl = positionMap.get(currentPost!.templateId);
    if (tpl) {
      const penalty = -Math.floor(5 + (tpl.minRank / 29) * 25);
      charStore.addOpinion(previousHolderId, appointerId, {
        reason: `罢免${tpl.name}`,
        value: penalty,
        decayable: true,
      });
    }
    // overlordId 回归任命者
    charStore.updateCharacter(previousHolderId, { overlordId: appointerId });
  }

  // 1. 设置岗位
  const post = terrStore.findPost(postId);
  const appointee = charStore.getCharacter(appointeeId);
  const baselineUpdate: Record<string, unknown> = {
    holderId: appointeeId,
    appointedBy: appointerId,
    appointedDate: { year: date.year, month: date.month },
  };
  // 流官岗位：重置考课基线（任期从此刻起算）
  if (post?.successionLaw === 'bureaucratic') {
    const terr = post.territoryId ? terrStore.territories.get(post.territoryId) : undefined;
    baselineUpdate.reviewBaseline = {
      population: terr?.basePopulation ?? 0,
      virtue: appointee?.official?.virtue ?? 0,
      date: { year: date.year, month: date.month },
    };
  }
  terrStore.updatePost(postId, baselineUpdate);

  // 2. 确保效忠关系
  // 地方副岗：效忠本领地 grantsControl 主岗持有人（而非法理主体）
  let effectiveOverlord = appointerId;
  if (post) {
    const postTpl = positionMap.get(post.templateId);
    if (!postTpl?.grantsControl && post.territoryId) {
      const terr = terrStore.territories.get(post.territoryId);
      if (terr) {
        const mainPost = terr.posts.find(p => {
          const t = positionMap.get(p.templateId);
          return t?.grantsControl === true;
        });
        if (mainPost?.holderId) effectiveOverlord = mainPost.holderId;
      }
    }
  }
  charStore.updateCharacter(appointeeId, { overlordId: effectiveOverlord });

  // 3. 该岗位绑定的军队随岗位转移给被任命者
  useMilitaryStore.getState().syncArmyOwnersByPost(postId, appointeeId);

  // 4. 好感修正：被任命者对任命者好感增加（按品级，可衰减）
  if (post) {
    const tpl = positionMap.get(post.templateId);
    if (tpl) {
      // minRank 1~29，映射到好感 +5~+30
      const opinion = Math.floor(5 + (tpl.minRank / 29) * 25);
      charStore.addOpinion(appointeeId, appointerId, {
        reason: `授予${tpl.name}`,
        value: opinion,
        decayable: true,
      });
    }
  }

  // 5. 正统性刷新：任命后刷新至岗位 baseLegitimacy（受品位 Cap 约束）
  {
    const freshAppointee = charStore.getCharacter(appointeeId);
    if (freshAppointee) {
      const freshTerrStore = useTerritoryStore.getState();
      const heldPosts = getHeldPostsPure(appointeeId, freshTerrStore.territories, freshTerrStore.centralPosts);
      const baseLeg = getHighestBaseLegitimacy(heldPosts);
      if (baseLeg !== null && freshAppointee.resources.legitimacy < baseLeg) {
        const cap = freshAppointee.official ? getRankLegitimacyCap(freshAppointee.official.rankLevel) : 100;
        const targetLeg = Math.min(baseLeg, cap);
        if (freshAppointee.resources.legitimacy < targetLeg) {
          charStore.addResources(appointeeId, {
            legitimacy: targetLeg - freshAppointee.resources.legitimacy,
          });
        }
      }
    }
  }

  // 6. 治所联动：道级 grantsControl 岗位 → 自动任命治所刺史
  if (post) {
    const postTpl = positionMap.get(post.templateId);
    if (postTpl?.grantsControl && post.territoryId) {
      const dao = terrStore.territories.get(post.territoryId);
      if (dao?.capitalZhouId) {
        const capitalZhou = terrStore.territories.get(dao.capitalZhouId);
        if (capitalZhou) {
          const capitalPost = capitalZhou.posts.find(p => {
            const t = positionMap.get(p.templateId);
            return t?.grantsControl === true;
          });
          if (capitalPost && capitalPost.holderId !== appointeeId) {
            // 清退治所前任（如有）
            if (capitalPost.holderId) {
              charStore.updateCharacter(capitalPost.holderId, { overlordId: appointerId });
            }
            const capitalUpdate: Record<string, unknown> = {
              holderId: appointeeId,
              appointedBy: appointerId,
              appointedDate: { year: date.year, month: date.month },
            };
            if (capitalPost.successionLaw === 'bureaucratic') {
              capitalUpdate.reviewBaseline = {
                population: capitalZhou.basePopulation,
                virtue: appointee?.official?.virtue ?? 0,
                date: { year: date.year, month: date.month },
              };
            }
            terrStore.updatePost(capitalPost.id, capitalUpdate);
            useMilitaryStore.getState().syncArmyOwnersByPost(capitalPost.id, appointeeId);
          }
        }
      }
    }
  }

  // 7. 立即重算玩家 ledger
  refreshPlayerLedger();
}
