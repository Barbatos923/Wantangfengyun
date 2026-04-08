// ===== NPC 罢免职位行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { executeDismiss } from '@engine/interaction';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { useStoryEventBus } from '@engine/storyEventBus';
import type { StoryEvent } from '@engine/storyEventBus';
import { registerBehavior } from './index';

// ── 辅助：获取臣属持有的非 grantsControl 岗位（利用 holderIndex O(1) 查询） ──

function getVassalNonControlPosts(
  vassalId: string,
  ctx: NpcContext,
): Post[] {
  const postIds = ctx.holderIndex.get(vassalId);
  if (!postIds) return [];
  const posts: Post[] = [];
  for (const pid of postIds) {
    const p = ctx.postIndex.get(pid);
    if (!p) continue;
    const tpl = positionMap.get(p.templateId);
    if (tpl && !tpl.grantsControl) posts.push(p);
  }
  return posts;
}

// ── 行为定义 ────────────────────────────────────────────────

interface DismissData {
  targetId: string;
  postId: string;
}

export const dismissBehavior: NpcBehavior<DismissData> = {
  id: 'dismiss',
  playerMode: 'skip', // 玩家从交互菜单发起
  // schedule 默认从 playerMode 推断 → monthly-slot

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<DismissData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    if (rankLevel < 9) return null; // 七品以下不罢免

    const isActorAtWar = ctx.activeWars.some(w => isWarParticipant(actor.id, w));

    let bestWeight = 0;
    let bestData: DismissData | null = null;

    // 扫描直属臣属
    for (const vassal of ctx.characters.values()) {
      if (!vassal.alive || vassal.id === actor.id) continue;
      if (vassal.overlordId !== actor.id) continue;

      // 获取臣属持有的非 grantsControl 岗位
      const nonControlPosts = getVassalNonControlPosts(vassal.id, ctx);
      if (nonControlPosts.length === 0) continue;

      // 好感条件：对该臣属不满
      const opinion = ctx.getOpinion(actor.id, vassal.id);
      if (opinion > -10) continue; // 好感 > -10 不罢免

      // ── 权重计算 ──
      const modifiers: WeightModifier[] = [
        { label: '基础', add: -5 },
        // 不满驱动（opinion 一定 <= -10 到这里）
        { label: '不满', add: Math.abs(opinion) * 0.3 },
        // 人格驱动
        { label: '复仇心', add: personality.vengefulness * 6 },
        { label: '理性', add: personality.rationality * 5 },
        { label: '荣誉抑制', add: -personality.honor * 8 },
        { label: '体恤抑制', add: -personality.compassion * 4 },
        // 硬切
        ...(isActorAtWar ? [{ label: '已在战争中', factor: 0.3 }] : []),
      ];

      const weight = calcWeight(modifiers);

      if (weight > bestWeight) {
        bestWeight = weight;
        // 选第一个非 control 岗位
        bestData = { targetId: vassal.id, postId: nonControlPosts[0].id };
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: DismissData, ctx: NpcContext) {
    // 目标是玩家时推送通知（副岗罢免无选项抵抗）
    if (data.targetId === ctx.playerId) {
      const postLabel = (() => {
        for (const t of ctx.territories.values()) {
          for (const p of t.posts) {
            if (p.id === data.postId) return `${t.name}${positionMap.get(p.templateId)?.name ?? ''}`;
          }
        }
        return '职位';
      })();

      // 先执行罢免
      executeDismiss(data.postId, actor.id);

      // 再通知玩家
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '职位被罢免',
        description: `${actor.name}将你从${postLabel}上罢免。`,
        actors: [
          { characterId: actor.id, role: '罢免者' },
          { characterId: data.targetId, role: '你' },
        ],
        options: [
          {
            label: '知道了',
            description: '接受上级的决定。',
            effects: [],
            effectKey: 'noop:notification',
            onSelect: () => { /* 已执行，无需额外操作 */ },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    // NPC 目标直接执行
    executeDismiss(data.postId, actor.id);
  },
};

registerBehavior(dismissBehavior);
