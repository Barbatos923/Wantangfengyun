// ===== NPC 剥夺领地行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { executeRevoke } from '@engine/interaction';
import { registerBehavior } from './index';

// ── 辅助：判断角色是否在战争中 ──────────────────────────────

function isAtWar(charId: string, activeWars: NpcContext['activeWars']): boolean {
  return activeWars.some(w => w.attackerId === charId || w.defenderId === charId);
}

// ── 辅助：获取臣属持有的 grantsControl 岗位 ──────────────────

function getVassalControlPosts(
  vassalId: string,
  ctx: NpcContext,
): Post[] {
  const posts: Post[] = [];
  for (const t of ctx.territories.values()) {
    for (const p of t.posts) {
      if (p.holderId === vassalId) {
        const tpl = positionMap.get(p.templateId);
        if (tpl?.grantsControl) posts.push(p);
      }
    }
  }
  return posts;
}

// ── 行为定义 ────────────────────────────────────────────────

interface RevokeData {
  targetId: string;
  postId: string;
}

export const revokeBehavior: NpcBehavior<RevokeData> = {
  id: 'revoke',
  playerMode: 'skip', // 玩家从交互菜单发起
  // schedule 默认从 playerMode 推断 → monthly-slot

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<RevokeData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    if (rankLevel < 9) return null; // 七品以下不剥夺

    let bestWeight = 0;
    let bestData: RevokeData | null = null;

    // 扫描效忠于 actor 的臣属
    for (const vassal of ctx.characters.values()) {
      if (!vassal.alive || vassal.id === actor.id) continue;
      if (vassal.overlordId !== actor.id) continue;

      // 获取臣属持有的 grantsControl 岗位
      const controlPosts = getVassalControlPosts(vassal.id, ctx);
      if (controlPosts.length === 0) continue;

      // 好感条件：对该臣属不满
      const opinion = ctx.getOpinion(actor.id, vassal.id);
      if (opinion > 0) continue; // 不剥夺好感为正的臣属

      // 不在已有的战争中（与该臣属）
      const atWarWithVassal = ctx.activeWars.some(w =>
        (w.attackerId === actor.id && w.defenderId === vassal.id) ||
        (w.attackerId === vassal.id && w.defenderId === actor.id)
      );
      if (atWarWithVassal) continue;

      // 兵力对比
      const myStr = ctx.getMilitaryStrength(actor.id);
      const theirStr = ctx.getMilitaryStrength(vassal.id);
      const ratio = theirStr > 0 ? myStr / theirStr : 2;

      // ── 权重计算 ──
      const modifiers: WeightModifier[] = [
        { label: '基础', add: -10 },
        // 仇恨驱动（opinion 一定 <= 0 到这里）
        { label: '仇恨', add: Math.abs(opinion) * 0.3 },
        // 人格驱动
        { label: '复仇心', add: personality.vengefulness * 8 },
        { label: '贪婪', add: personality.greed * 6 },
        { label: '荣誉抑制', add: -personality.honor * 10 },
        { label: '理性', add: personality.rationality * 5 },
        { label: '胆量', add: personality.boldness * 4 },
        // 兵力
        ...(ratio >= 2 ? [{ label: '兵力碾压', add: 5 }]
          : ratio >= 1.5 ? [{ label: '兵力优势', add: 3 }]
          : ratio < 0.8 ? [{ label: '兵力劣势', add: -5 }]
          : []),
        // 硬切
        ...(isAtWar(actor.id, ctx.activeWars) ? [{ label: '已在战争中', factor: 0.3 }] : []),
      ];

      const weight = calcWeight(modifiers);

      if (weight > bestWeight) {
        bestWeight = weight;
        // 选第一个 controlPost（可后续优化选择策略）
        bestData = { targetId: vassal.id, postId: controlPosts[0].id };
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(_actor: Character, data: RevokeData, _ctx: NpcContext) {
    executeRevoke(data.postId, _actor.id);
  },
};

registerBehavior(revokeBehavior);
