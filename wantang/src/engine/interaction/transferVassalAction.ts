// ===== "转移臣属"交互 =====

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useWarStore } from '@engine/military/WarStore';

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

  // 预计算活跃战争中参战的角色集合，排除正在打仗的臣属
  const activeWars = useWarStore.getState().getActiveWars();
  const atWarSet = new Set<string>();
  for (const w of activeWars) {
    if (w.status !== 'active') continue;
    for (const id of [w.attackerId, ...w.attackerParticipants, w.defenderId, ...w.defenderParticipants]) {
      atWarSet.add(id);
    }
  }

  const result: TransferCandidate[] = [];

  // receiver 岗位模板最高品级（用 minRank 而非个人 rankLevel，防止同职位因个人品级差异绕过）
  const targetPosts = terrStore.getPostsByHolder(targetId);
  const targetPostRank = Math.max(0, ...targetPosts.map(p => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.grantsControl ? tpl.minRank : 0;
  }));

  for (const vassal of vassals) {
    if (vassal.id === targetId) continue;
    if (!vassal.alive) continue;
    if (atWarSet.has(vassal.id)) continue;

    // 获取该臣属的 grantsControl 岗位
    const vassalPosts = terrStore.getPostsByHolder(vassal.id);

    // 品级检查：receiver 岗位品级必须严格高于 vassal（不能同级节度使互转）
    const vassalPostRank = Math.max(0, ...vassalPosts.map(p => {
      const tpl = positionMap.get(p.templateId);
      return tpl?.grantsControl ? tpl.minRank : 0;
    }));
    if (targetPostRank <= vassalPostRank) continue;
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
): boolean {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();

  // 瞬时重校验：三方存活 + vassal 仍是 transferrer 的臣属 + 仍在 newOverlordId 的可接收候选集中
  const transferrer = charStore.getCharacter(transferrerId);
  const vassal = charStore.getCharacter(vassalId);
  const newOverlord = charStore.getCharacter(newOverlordId);
  if (!transferrer?.alive || !vassal?.alive || !newOverlord?.alive) return false;
  if (vassal.overlordId !== transferrerId) return false;
  if (newOverlordId === transferrerId || newOverlordId === vassalId) return false;
  const candidates = getTransferCandidates(transferrerId, newOverlordId);
  if (!candidates.some((c) => c.character.id === vassalId)) return false;

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
  return true;
}
