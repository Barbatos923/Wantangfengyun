// ===== NPC 剥夺领地行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { executeRevoke, executeDismiss, executeDeclareWar } from '@engine/interaction';
import { useTurnManager } from '@engine/TurnManager';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { useStoryEventBus } from '@engine/storyEventBus';
import type { StoryEvent } from '@engine/storyEventBus';
import { findAppointRightHolder } from '@engine/character/successionUtils';
import { findEmperorId } from '@engine/official/postQueries';
import { registerBehavior } from './index';

// ── 辅助：判断角色是否在战争中 ──────────────────────────────

function isAtWar(charId: string, activeWars: NpcContext['activeWars']): boolean {
  return activeWars.some(w => isWarParticipant(charId, w));
}

// ── 辅助：获取臣属持有的 grantsControl 岗位（利用 holderIndex O(1) 查询） ──

function getVassalControlPosts(
  vassalId: string,
  actorId: string,
  ctx: NpcContext,
): Post[] {
  // 预建治所州集合：治所州剥夺后无法授出，NPC 不应剥夺
  const capitalZhouIds = new Set<string>();
  for (const t of ctx.territories.values()) {
    if (t.tier === 'dao' && t.capitalZhouId) capitalZhouIds.add(t.capitalZhouId);
  }

  const postIds = ctx.holderIndex.get(vassalId);
  if (!postIds) return [];
  const posts: Post[] = [];
  for (const pid of postIds) {
    const p = ctx.postIndex.get(pid);
    if (!p) continue;
    const tpl = positionMap.get(p.templateId);
    if (!tpl?.grantsControl) continue;
    // 治所州不可剥夺（剥夺后无法通过授予行为授出）
    if (p.territoryId && capitalZhouIds.has(p.territoryId)) continue;
    // 道级岗位不可NPC剥夺（剥夺后道+治所州都卡在手里，应走调任/铨选）
    if (p.territoryId) {
      const terr = ctx.territories.get(p.territoryId);
      if (terr && terr.tier === 'dao') continue;
    }
    // 剥夺领地需要辟署权：actor 必须是该岗位的法理任命人
    if (p.territoryId) {
      const rightHolder = findAppointRightHolder(p.territoryId, ctx.territories);
      if (rightHolder && rightHolder !== actorId) continue;
      if (!rightHolder) {
        const emperor = findEmperorId(ctx.territories, ctx.centralPosts);
        if (emperor !== actorId) continue;
      }
    }
    posts.push(p);
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

      // 获取臣属持有的 grantsControl 岗位（需 actor 有辟署权）
      const controlPosts = getVassalControlPosts(vassal.id, actor.id, ctx);
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

  executeAsNpc(actor: Character, data: RevokeData, ctx: NpcContext) {
    // 目标是玩家时弹出 StoryEvent 让玩家选择接受或反抗
    if (data.targetId === ctx.playerId) {
      const postLabel = (() => {
        for (const t of ctx.territories.values()) {
          for (const p of t.posts) {
            if (p.id === data.postId) return `${t.name}${positionMap.get(p.templateId)?.name ?? ''}`;
          }
        }
        return '领地';
      })();

      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '领地被剥夺',
        description: `${actor.name}意图剥夺你的${postLabel}。你是接受这一决定，还是起兵反抗？`,
        actors: [
          { characterId: actor.id, role: '剥夺者' },
          { characterId: data.targetId, role: '你' },
        ],
        options: [
          {
            label: '忍辱接受',
            description: '服从上级决定，交出领地。',
            effects: [],
            effectKey: 'revoke:accept',
            effectData: { postId: data.postId, actorId: actor.id },
            onSelect: () => {
              executeDismiss(data.postId, actor.id);
            },
          },
          {
            label: '起兵反抗',
            description: '拒绝剥夺，发动独立战争。',
            effects: [
              { label: '好感', value: -30, type: 'negative' },
            ],
            effectKey: 'revoke:rebel',
            effectData: { targetId: data.targetId, actorId: actor.id },
            onSelect: () => {
              const date = useTurnManager.getState().currentDate;
              useCharacterStore.getState().addOpinion(data.targetId, actor.id, {
                reason: '强行剥夺领地',
                value: -30,
                decayable: true,
              });
              executeDeclareWar(
                data.targetId, actor.id, 'independence', [],
                date, { prestige: 0, legitimacy: 0 },
              );
            },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    executeRevoke(data.postId, actor.id);
  },
};

registerBehavior(revokeBehavior);
