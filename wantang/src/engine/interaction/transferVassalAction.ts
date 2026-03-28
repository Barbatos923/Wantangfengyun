// ===== "转移臣属"交互 =====

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getActualController } from '@engine/official/postQueries';
import { positionMap } from '@data/positions';
import { refreshPlayerLedger } from './appointAction';

/** 注册转移臣属交互 */
registerInteraction({
  id: 'transferVassal',
  name: '转移臣属',
  icon: '🔄',
  canShow: (player, target) => canTransferVassal(player, target),
  paramType: 'transferVassal',
});

// ── canShow ──────────────────────────────────────────

function canTransferVassal(player: Character, target: Character): boolean {
  if (!target.alive) return false;
  if (target.overlordId !== player.id) return false;

  // target 必须持有 grantsControl 岗位
  const terrStore = useTerritoryStore.getState();
  const targetPosts = terrStore.getPostsByHolder(target.id);
  const hasControlPost = targetPosts.some(p => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.grantsControl === true;
  });
  if (!hasControlPost) return false;

  // 必须存在至少一个可转移候选人
  return getTransferCandidates(player.id, target.id).length > 0;
}

// ── 候选人筛选 ──────────────────────────────────────────

export interface TransferCandidate {
  character: Character;
  post: Post;
  territoryName: string;
  positionName: string;
}

/** 获取可转移给 target 的候选人列表 */
export function getTransferCandidates(
  playerId: string,
  targetId: string,
): TransferCandidate[] {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const territories = terrStore.territories;

  // 获取 player 的所有臣属
  const vassals = charStore.getVassalsByOverlord(playerId);

  const result: TransferCandidate[] = [];

  for (const vassal of vassals) {
    if (vassal.id === targetId) continue;
    if (!vassal.alive) continue;

    // 获取该臣属的 grantsControl 岗位
    const vassalPosts = terrStore.getPostsByHolder(vassal.id);
    for (const post of vassalPosts) {
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      if (!post.territoryId) continue;

      // 检查该岗位所在领地是否在 target 的法理管辖范围内
      // 沿 parentId 向上查找，看是否有 target 控制的领地
      let currentId: string | undefined = territories.get(post.territoryId)?.parentId;
      while (currentId) {
        const territory = territories.get(currentId);
        if (!territory) break;
        if (getActualController(territory) === targetId) {
          const postTerritory = territories.get(post.territoryId);
          result.push({
            character: vassal,
            post,
            territoryName: postTerritory?.name ?? '',
            positionName: tpl.name,
          });
          break;
        }
        currentId = territory.parentId;
      }
    }
  }

  return result;
}

// ── 执行 ──────────────────────────────────────────────

export function executeTransferVassal(
  vassalId: string,
  newOverlordId: string,
  transferrerId: string,
): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();

  charStore.updateCharacter(vassalId, { overlordId: newOverlordId });

  // 接收方对转移发起人好感加成：等同于直接授予对应职位好感的一半
  const vassalPosts = terrStore.getPostsByHolder(vassalId);
  let maxRank = 0;
  let maxTplName = '';
  for (const post of vassalPosts) {
    const tpl = positionMap.get(post.templateId);
    if (tpl?.grantsControl && tpl.minRank > maxRank) {
      maxRank = tpl.minRank;
      maxTplName = tpl.name;
    }
  }
  if (maxRank > 0) {
    const opinion = Math.floor((5 + (maxRank / 29) * 25) / 2);
    charStore.addOpinion(newOverlordId, transferrerId, {
      reason: `转授${maxTplName}`,
      value: opinion,
      decayable: true,
    });
  }

  refreshPlayerLedger();
}
