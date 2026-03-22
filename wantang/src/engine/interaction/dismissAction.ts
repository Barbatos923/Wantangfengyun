// ===== "罢免职位"交互 =====

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { refreshPlayerLedger } from './appointAction';

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

  // 立即重算玩家 ledger
  refreshPlayerLedger();
}
