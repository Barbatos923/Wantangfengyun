// ===== "任命职位"交互 =====

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { getActualController, getHeldPosts, canAppointToPost, calculateMonthlyLedger } from '@engine/official/officialUtils';
import { useLedgerStore } from '@engine/official/LedgerStore';

/** 注册任命交互 */
registerInteraction({
  id: 'appoint',
  name: '任命职位',
  icon: '📜',
  canShow: (player, target) => {
    if (target.overlordId !== player.id) return false;
    if (!target.official) return false;
    if (!player.official) return false;
    // 检查是否有空缺岗位可供任命
    return getAppointableVacantPosts(player).length > 0;
  },
  paramType: 'appoint',
});

/** 获取玩家可以任命的所有岗位（空缺岗位 + 玩家自己持有的可转让主岗位） */
export function getAppointableVacantPosts(player: Character): Post[] {
  const terrStore = useTerritoryStore.getState();
  const territories = terrStore.territories;
  const centralPosts = terrStore.centralPosts;
  const result: Post[] = [];

  const isEmperor = getHeldPosts(player.id).some(p => p.templateId === 'pos-emperor');

  // 遍历玩家控制的领地的岗位
  for (const t of territories.values()) {
    const controller = getActualController(t);
    if (controller !== player.id) continue;

    for (const post of t.posts) {
      if (post.holderId === null) {
        // 空缺岗位
        result.push(post);
      } else if (post.holderId === player.id) {
        // 玩家自己持有的 grantsControl 岗位 → 可转让
        const tpl = positionMap.get(post.templateId);
        if (tpl?.grantsControl) {
          result.push(post);
        }
      }
    }
  }

  // 皇帝可以任命空缺的中央岗位
  if (isEmperor) {
    for (const post of centralPosts) {
      if (post.holderId !== null) continue;
      result.push(post);
    }
  }

  return result;
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
): void {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;

  // 1. 设置岗位
  terrStore.updatePost(postId, {
    holderId: appointeeId,
    appointedBy: appointerId,
    appointedDate: { year: date.year, month: date.month },
  });

  // 2. 确保效忠关系
  charStore.updateCharacter(appointeeId, { overlordId: appointerId });

  // 3. 好感修正：被任命者对任命者好感增加（按品级，可衰减）
  const post = terrStore.findPost(postId);
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

  // 4. 立即重算玩家 ledger
  refreshPlayerLedger();
}
