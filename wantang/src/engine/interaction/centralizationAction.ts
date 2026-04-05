// ===== "调整集权"交互 =====

import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { positionMap } from '@data/positions';
import { refreshPlayerLedger } from './appointAction';
import type { CentralizationLevel, Post, Territory } from '@engine/territory/types';

// 军/民模板切换映射
export const MILITARY_TO_CIVIL: Record<string, string> = {
  'pos-jiedushi': 'pos-guancha-shi',
  'pos-fangyu-shi': 'pos-cishi',
};
export const CIVIL_TO_MILITARY: Record<string, string> = {
  'pos-guancha-shi': 'pos-jiedushi',
  'pos-cishi': 'pos-fangyu-shi',
};

// ── 状态好感值表（持有人→上级） ──────────────────────────────────────────────

/** 辟署权好感：guo +40, dao +20, zhou +10 */
export const APPOINT_RIGHT_OPINION: Record<string, number> = { guo: 40, dao: 20, zhou: 10 };
/** 宗法继承好感：guo +30, dao +15, zhou +5 */
export const CLAN_SUCCESSION_OPINION: Record<string, number> = { guo: 30, dao: 15, zhou: 5 };
/** 军事职类好感：固定 +5 */
export const MILITARY_TYPE_OPINION = 5;

// 赋税等级 → 好感修正：1级=+10, 2级=0, 3级=-10, 4级=-20
export const CENTRALIZATION_OPINION: Record<number, number> = { 1: 10, 2: 0, 3: -10, 4: -20 };

/** 注册集权调整交互 */
registerInteraction({
  id: 'centralization',
  name: '调整权责',
  icon: '⚖️',
  canShow: (_player, target) => {
    return target.overlordId === _player.id && target.isRuler;
  },
  paramType: 'centralization',
});

// ── 执行函数 ─────────────────────────────────────────────────────────────────

/** 变更赋税等级 */
export function executeTaxChange(targetId: string, _playerId: string, delta: number): void {
  const charStore = useCharacterStore.getState();
  const target = charStore.characters.get(targetId);
  if (!target) return;
  const currentLevel = target.centralization ?? 2;
  const newLevel = Math.max(1, Math.min(4, currentLevel + delta)) as CentralizationLevel;
  if (newLevel === currentLevel) return;
  charStore.updateCharacter(targetId, { centralization: newLevel });
  refreshPlayerLedger();
}

/** 切换职类（军事 ↔ 民政） */
export function executeToggleType(postId: string, territoryId: string): void {
  const terrStore = useTerritoryStore.getState();
  const post = terrStore.findPost(postId);
  if (!post) return;
  const tpl = positionMap.get(post.templateId);
  if (!tpl) return;
  const isMilitary = tpl.territoryType === 'military';
  const newTemplateId = isMilitary
    ? MILITARY_TO_CIVIL[post.templateId]
    : CIVIL_TO_MILITARY[post.templateId];
  if (!newTemplateId) return;
  const newType = isMilitary ? 'civil' as const : 'military' as const;
  terrStore.updatePost(post.id, { templateId: newTemplateId });
  terrStore.updateTerritory(territoryId, { territoryType: newType });

  refreshPlayerLedger();
}

/** 切换继承法（宗法 ↔ 流官） */
export function executeToggleSuccession(
  postId: string,
  capitalZhouId: string | undefined,
  territories: Map<string, Territory>,
): void {
  const terrStore = useTerritoryStore.getState();
  const post = terrStore.findPost(postId);
  if (!post) return;
  const newLaw = post.successionLaw === 'clan' ? 'bureaucratic' as const : 'clan' as const;
  const patch: Partial<Post> = { successionLaw: newLaw };
  if (newLaw === 'bureaucratic') patch.designatedHeirId = null;
  terrStore.updatePost(post.id, patch);
  if (capitalZhouId) {
    const capZhou = territories.get(capitalZhouId);
    const capPost = capZhou?.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (capPost) terrStore.updatePost(capPost.id, patch);
  }

}

/** 切换辟署权 */
export function executeToggleAppointRight(postId: string): void {
  const terrStore = useTerritoryStore.getState();
  const post = terrStore.findPost(postId);
  if (!post) return;
  const newValue = !post.hasAppointRight;
  terrStore.updatePost(postId, { hasAppointRight: newValue });

}

/** 变更回拨率 */
export function executeRedistributionChange(playerId: string, delta: number): void {
  const charStore = useCharacterStore.getState();
  const player = charStore.characters.get(playerId);
  if (!player) return;
  const currentRate = player.redistributionRate ?? 0;
  const newRate = Math.max(0, Math.min(100, currentRate + delta));
  if (newRate === currentRate) return;
  charStore.updateCharacter(playerId, { redistributionRate: newRate });
  refreshPlayerLedger();
}

/** 指定继承人（留后唯一：所有宗法岗位共享同一继承人） */
export function executeDesignateHeir(postId: string, heirId: string | null): void {
  const terrStore = useTerritoryStore.getState();
  const post = terrStore.findPost(postId);
  if (!post?.holderId) return;

  const allPosts = terrStore.getPostsByHolder(post.holderId);
  const territories = terrStore.territories;

  for (const p of allPosts) {
    if (p.successionLaw !== 'clan') continue;
    const tpl = positionMap.get(p.templateId);
    if (!tpl?.grantsControl) continue;
    terrStore.updatePost(p.id, { designatedHeirId: heirId });

    // 治所联动
    if (p.territoryId) {
      const terr = territories.get(p.territoryId);
      if (terr?.capitalZhouId) {
        const capZhou = territories.get(terr.capitalZhouId);
        const capPost = capZhou?.posts.find(cp => positionMap.get(cp.templateId)?.grantsControl);
        if (capPost && capPost.holderId === post.holderId) {
          terrStore.updatePost(capPost.id, { designatedHeirId: heirId });
        }
      }
    }
  }
}
