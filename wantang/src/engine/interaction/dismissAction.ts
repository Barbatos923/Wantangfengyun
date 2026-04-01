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
    // target 必须持有由 player 任命的岗位
    return getDismissablePosts(player, target).length > 0;
  },
  paramType: 'dismiss',
});

/** 获取 target 中由 player 任命的所有岗位 */
export function getDismissablePosts(
  player: Character,
  target: Character,
): Post[] {
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(target.id);
  return posts.filter(p => p.appointedBy === player.id);
}

/** 执行罢免：统一流程，零特殊分支 */
export function executeDismiss(
  postId: string,
  dismisserId: string,
): void {
  const terrStore = useTerritoryStore.getState();
  const date = useTurnManager.getState().currentDate;
  const post = terrStore.findPost(postId);
  if (!post) return;

  const tpl = positionMap.get(post.templateId);
  const previousHolderId = post.holderId;

  // 如果是领地主岗位(grantsControl)，罢免者自动接管
  if (tpl?.grantsControl) {
    terrStore.updatePost(postId, {
      holderId: dismisserId,
      appointedBy: 'system',
      appointedDate: { year: date.year, month: date.month },
    });
    // 该岗位绑定的军队随岗位易手
    useMilitaryStore.getState().syncArmyOwnersByPost(postId, dismisserId);
  } else {
    // 普通岗位：清空
    terrStore.updatePost(postId, {
      holderId: null,
      appointedBy: undefined,
      appointedDate: undefined,
    });
  }

  // 好感修正：被罢免者对罢免者好感降低（按品级，可衰减）
  if (previousHolderId && tpl) {
    const charStore = useCharacterStore.getState();
    const opinion = -Math.floor(5 + (tpl.minRank / 29) * 25);
    charStore.addOpinion(previousHolderId, dismisserId, {
      reason: `罢免${tpl.name}`,
      value: opinion,
      decayable: true,
    });
  }

  // 更新被罢免者 overlordId：回归罢免者人才池
  if (previousHolderId) {
    const charStore = useCharacterStore.getState();
    charStore.updateCharacter(previousHolderId, { overlordId: dismisserId });
  }

  // 治所联动：罢免道级 grantsControl 岗位时，一并罢免同人的治所刺史
  if (previousHolderId && tpl?.grantsControl && post.territoryId) {
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
            appointedDate: { year: date.year, month: date.month },
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
