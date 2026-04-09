// ===== "调整集权"交互 =====

import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { refreshPlayerLedger } from './appointAction';
import type { CentralizationLevel, Post } from '@engine/territory/types';

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

/**
 * 切换职类（军事 ↔ 民政）。
 *
 * 治所州联动（CLAUDE.md `### 治所州联动`）：道级主岗变化时，治所州主岗的 templateId
 * 与 territory.territoryType 一并按对照表同步切换；治所州 holder 与道主岗不一致也强制
 * 写入——这种状态本身就是非法脱绑。
 */
export function executeToggleType(postId: string): void {
  const terrStore = useTerritoryStore.getState();
  const post = terrStore.findPost(postId);
  if (!post?.territoryId) return;
  const tpl = positionMap.get(post.templateId);
  if (!tpl) return;
  const isMilitary = tpl.territoryType === 'military';
  const newTemplateId = isMilitary
    ? MILITARY_TO_CIVIL[post.templateId]
    : CIVIL_TO_MILITARY[post.templateId];
  if (!newTemplateId) return;
  const newType = isMilitary ? 'civil' as const : 'military' as const;
  terrStore.updatePost(post.id, { templateId: newTemplateId });
  terrStore.updateTerritory(post.territoryId, { territoryType: newType });

  // 治所州联动：道级主岗 → 治所州 zhou 级主岗也跟着切
  const terr = terrStore.territories.get(post.territoryId);
  if (terr?.tier === 'dao' && terr.capitalZhouId) {
    const capZhou = terrStore.territories.get(terr.capitalZhouId);
    const capPost = capZhou?.posts.find((p) => positionMap.get(p.templateId)?.grantsControl);
    if (capPost) {
      const capTpl = positionMap.get(capPost.templateId);
      if (capTpl) {
        const capIsMil = capTpl.territoryType === 'military';
        const capNewTemplateId = capIsMil
          ? MILITARY_TO_CIVIL[capPost.templateId]
          : CIVIL_TO_MILITARY[capPost.templateId];
        if (capNewTemplateId && capIsMil === isMilitary) {
          terrStore.updatePost(capPost.id, { templateId: capNewTemplateId });
        }
      }
      terrStore.updateTerritory(terr.capitalZhouId, { territoryType: newType });
    }
  }

  refreshPlayerLedger();
}

/**
 * 切换继承法（宗法 ↔ 流官）。
 *
 * 治所州联动（CLAUDE.md `### 治所州联动`）：道级主岗变化时自动联动治所州主岗，
 * capitalZhouId 由 post.territoryId 内部自查，调用方无需传入。
 */
export function executeToggleSuccession(postId: string): void {
  const terrStore = useTerritoryStore.getState();
  const post = terrStore.findPost(postId);
  if (!post) return;
  const territories = terrStore.territories;
  const newLaw = post.successionLaw === 'clan' ? 'bureaucratic' as const : 'clan' as const;
  const patch: Partial<Post> = { successionLaw: newLaw };
  if (newLaw === 'bureaucratic') {
    patch.designatedHeirId = null;
    // 改为流官时补设 reviewBaseline，使现任持有人进入考课周期
    if (post.holderId) {
      const date = useTurnManager.getState().currentDate;
      const terr = post.territoryId ? territories.get(post.territoryId) : undefined;
      const holder = useCharacterStore.getState().characters.get(post.holderId);
      patch.reviewBaseline = {
        population: terr?.basePopulation ?? 0,
        virtue: holder?.official?.virtue ?? 0,
        date: { year: date.year, month: date.month, day: date.day },
      };
    }
  }
  terrStore.updatePost(post.id, patch);

  // 治所州联动：道级主岗 → 治所州 zhou 级主岗
  const terr = post.territoryId ? territories.get(post.territoryId) : undefined;
  if (terr?.tier === 'dao' && terr.capitalZhouId) {
    const capZhou = territories.get(terr.capitalZhouId);
    const capPost = capZhou?.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (capPost) {
      const capPatch: Partial<Post> = { ...patch };
      // 治所州岗位的 reviewBaseline 需要用治所州自己的人口数据
      if (newLaw === 'bureaucratic' && capPost.holderId) {
        const date = useTurnManager.getState().currentDate;
        const capHolder = useCharacterStore.getState().characters.get(capPost.holderId);
        capPatch.reviewBaseline = {
          population: capZhou?.basePopulation ?? 0,
          virtue: capHolder?.official?.virtue ?? 0,
          date: { year: date.year, month: date.month, day: date.day },
        };
      }
      terrStore.updatePost(capPost.id, capPatch);
    }
  }
}

/**
 * 切换辟署权。
 *
 * 治所州联动（CLAUDE.md `### 治所州联动`）：道级主岗变化时治所州主岗一并强制写入，
 * 不因 holder 不一致跳过。
 */
export function executeToggleAppointRight(postId: string): void {
  const terrStore = useTerritoryStore.getState();
  const post = terrStore.findPost(postId);
  if (!post) return;
  const newValue = !post.hasAppointRight;
  terrStore.updatePost(postId, { hasAppointRight: newValue });

  // 治所州联动：道级主岗 → 治所州 zhou 级主岗
  const terr = post.territoryId ? terrStore.territories.get(post.territoryId) : undefined;
  if (terr?.tier === 'dao' && terr.capitalZhouId) {
    const capZhou = terrStore.territories.get(terr.capitalZhouId);
    const capPost = capZhou?.posts.find((p) => positionMap.get(p.templateId)?.grantsControl);
    if (capPost) {
      terrStore.updatePost(capPost.id, { hasAppointRight: newValue });
    }
  }
}

/** 变更回拨率 */
export function executeRedistributionChange(playerId: string, delta: number): void {
  const charStore = useCharacterStore.getState();
  const player = charStore.characters.get(playerId);
  if (!player) return;
  const currentRate = player.redistributionRate;
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

    // 治所联动：以道为权威源强制覆盖治所州主岗的留后，不因 holder 不一致跳过
    // （holder 不一致本身就是非法脱绑状态，详见 CLAUDE.md `### 治所州联动`）
    if (p.territoryId) {
      const terr = territories.get(p.territoryId);
      if (terr?.tier === 'dao' && terr.capitalZhouId) {
        const capZhou = territories.get(terr.capitalZhouId);
        const capPost = capZhou?.posts.find(cp => positionMap.get(cp.templateId)?.grantsControl);
        if (capPost) {
          terrStore.updatePost(capPost.id, { designatedHeirId: heirId });
        }
      }
    }
  }
}
