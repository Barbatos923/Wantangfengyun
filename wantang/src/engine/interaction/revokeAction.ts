// ===== "剥夺领地"交互 =====

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import type { Personality } from '@data/traits';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { executeDismiss } from './dismissAction';
import { executeDeclareWar } from './declareWarAction';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { calcPersonality } from '@engine/character/personalityUtils';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { random } from '@engine/random';

/** 注册剥夺领地交互 */
registerInteraction({
  id: 'revoke',
  name: '剥夺领地',
  icon: '🔴',
  canShow: (player, target) => {
    return target.overlordId === player.id && getRevokablePosts(player, target).length > 0;
  },
  paramType: 'revoke',
});

/** 获取 target 持有的、可被 player 剥夺的 grantsControl 岗位 */
export function getRevokablePosts(
  player: Character,
  target: Character,
): Post[] {
  if (target.overlordId !== player.id) return [];
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(target.id);
  return posts.filter(p => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.grantsControl === true;
  });
}

/**
 * 计算剥夺成功率（纯函数）。
 *
 * @param targetOpinion - target 对 actor 的好感（正=服从，负=反抗）
 * @param actorStrength - 剥夺者兵力
 * @param targetStrength - 被剥夺者兵力
 * @param actorRankLevel - 剥夺者品级
 * @param targetRankLevel - 被剥夺者品级
 * @param actorLegitimacy - 剥夺者正统性
 * @param targetPersonality - 被剥夺者性格
 * @returns 成功概率 [10, 95]
 */
export function calcRevokeChance(
  targetOpinion: number,
  actorStrength: number,
  targetStrength: number,
  actorRankLevel: number,
  targetRankLevel: number,
  actorLegitimacy: number,
  targetPersonality: Personality,
): number {
  const ratio = targetStrength > 0 ? actorStrength / targetStrength : 2;

  let chance = 50;

  // 好感方向：target 对 actor 好感越高越服从
  chance += Math.max(-30, Math.min(30, targetOpinion * 0.5));

  // 兵力对比
  if (ratio >= 2) chance += 20;
  else if (ratio >= 1.5) chance += 10;
  else if (ratio < 0.8) chance -= 20;

  // 品级差：上级品级优势
  chance += (actorRankLevel - targetRankLevel) * 2;

  // 正统性
  if (actorLegitimacy > 60) chance += 10;
  else if (actorLegitimacy < 30) chance -= 10;

  // 被剥夺者性格
  chance += targetPersonality.honor * 10;       // 荣誉高→接受上级命令
  chance -= targetPersonality.boldness * 15;    // 胆大→反抗

  return Math.max(10, Math.min(95, Math.round(chance)));
}

// ── 辅助：计算角色总兵力 ────────────────────────────────────

function getTotalStrength(charId: string): number {
  const milStore = useMilitaryStore.getState();
  const armies = milStore.getArmiesByOwner(charId);
  let total = 0;
  for (const army of armies) {
    total += getArmyStrength(army, milStore.battalions);
  }
  return total;
}

/**
 * 预览剥夺成功率（UI 用，读 Store 组装参数后委派给纯函数）。
 */
export function previewRevokeChance(
  revokerId: string,
  targetId: string,
): number {
  const charStore = useCharacterStore.getState();
  const revoker = charStore.getCharacter(revokerId);
  const target = charStore.getCharacter(targetId);
  if (!revoker || !target) return 50;

  const bExpectedLeg = useTerritoryStore.getState().expectedLegitimacy.get(revokerId) ?? null;
  const opinion = calculateBaseOpinion(target, revoker, bExpectedLeg);
  const personality = calcPersonality(target);

  return calcRevokeChance(
    opinion,
    getTotalStrength(revokerId),
    getTotalStrength(targetId),
    revoker.official?.rankLevel ?? 0,
    target.official?.rankLevel ?? 0,
    revoker.resources.legitimacy,
    personality,
  );
}

/**
 * 执行剥夺领地（含成功/失败判定）。
 * @returns true=成功，false=失败（触发独立战争）
 */
export function executeRevoke(
  postId: string,
  revokerId: string,
): boolean {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;

  const post = terrStore.findPost(postId);
  if (!post || !post.holderId) return true;

  const targetId = post.holderId;
  const target = charStore.getCharacter(targetId);
  const revoker = charStore.getCharacter(revokerId);
  if (!target || !revoker) return true;

  // 计算好感：target 对 revoker 的好感
  const bExpectedLeg = terrStore.expectedLegitimacy.get(revokerId) ?? null;
  const opinion = calculateBaseOpinion(target, revoker, bExpectedLeg);

  // 计算性格
  const personality = calcPersonality(target);

  const chance = calcRevokeChance(
    opinion,
    getTotalStrength(revokerId),
    getTotalStrength(targetId),
    revoker.official?.rankLevel ?? 0,
    target.official?.rankLevel ?? 0,
    revoker.resources.legitimacy,
    personality,
  );

  const success = random() * 100 < chance;

  if (success) {
    executeDismiss(postId, revokerId);
    return true;
  } else {
    // 失败：好感惩罚 + 独立战争
    charStore.addOpinion(targetId, revokerId, {
      reason: '强行剥夺领地',
      value: -30,
      decayable: true,
    });

    // 被剥夺者发动免费独立战争
    executeDeclareWar(
      targetId,
      revokerId,
      'independence',
      [],
      date,
      { prestige: 0, legitimacy: 0 },
    );

    return false;
  }
}
