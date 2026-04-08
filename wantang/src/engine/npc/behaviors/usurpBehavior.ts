// ===== NPC 行为：篡夺头衔 =====

import type { Character } from '@engine/character/types';
import type { NpcBehavior, NpcContext, BehaviorTaskResult } from '../types';
import { calcWeight } from '../types';
import { registerBehavior } from './index';
import { canUsurpPost, calcRealmControlRatio, calcPostManageCost } from '@engine/official/postManageCalc';
import { executeUsurp } from '@engine/interaction';
import { positionMap } from '@data/positions';
import { useStoryEventBus, type StoryEvent } from '@engine/storyEventBus';

interface UsurpData {
  postId: string;
  holderId: string;
  territoryId: string;
}

export const usurpBehavior: NpcBehavior<UsurpData> = {
  id: 'usurp',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<UsurpData> | null {
    if (!actor.isRuler) return null;

    const rankLevel = ctx.rankLevelCache.get(actor.id) ?? 0;
    if (rankLevel < 12) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    let bestWeight = 0;
    let bestData: UsurpData | null = null;

    // 扫描所有 guo/dao 级领地的 grantsControl 岗位
    for (const t of ctx.territories.values()) {
      if (t.tier !== 'guo' && t.tier !== 'dao') continue;

      for (const post of t.posts) {
        const tpl = positionMap.get(post.templateId);
        if (!tpl?.grantsControl || !post.holderId) continue;
        if (post.holderId === actor.id) continue;

        const result = canUsurpPost(actor.id, post, t, ctx.territories, ctx.characters, ctx.activeWars);
        if (!result.eligible) continue;

        // 资源检查（金钱看 capital 国库，声望看私产）
        const cost = calcPostManageCost('usurp', t.tier);
        const capMoney = ctx.capitalTreasury.get(actor.id)?.money ?? actor.resources.money;
        if (capMoney < cost.money || actor.resources.prestige < cost.prestige) continue;

        const ratio = calcRealmControlRatio(t.id, actor.id, ctx.territories, ctx.characters);
        const opinion = ctx.getOpinion(actor.id, post.holderId);

        const modifiers = [
          { label: '基础', add: 20 },
          { label: '野心', add: personality.greed * 12 },
          { label: '胆量', add: personality.boldness * 8 },
          { label: '控制比例', add: ratio >= 0.8 ? 15 : ratio >= 0.6 ? 5 : 0 },
          { label: '厌恶持有者', add: opinion < -30 ? 10 : 0 },
          // guo 级篡夺权重更高
          ...(t.tier === 'guo' ? [{ label: '国级', add: 10 }] : []),
        ];

        const weight = calcWeight(modifiers);
        if (weight > bestWeight) {
          bestWeight = weight;
          bestData = { postId: post.id, holderId: post.holderId, territoryId: t.id };
        }
      }
    }

    if (!bestData || bestWeight <= 0) return null;
    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: UsurpData, ctx: NpcContext) {
    const isPlayerTarget = data.holderId === ctx.playerId;

    executeUsurp(data.postId, actor.id);

    // 玩家的岗位被篡夺 → 纯通知
    if (isPlayerTarget) {
      const territory = ctx.territories.get(data.territoryId);
      const terrName = territory?.name ?? '';
      // 从领地 posts 中查找岗位模板名
      const postTplId = territory?.posts.find(p => p.id === data.postId)?.templateId;
      const postName = postTplId ? (positionMap.get(postTplId)?.name ?? '') : '';
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '头衔被篡夺',
        description: `${actor.name}篡夺了你的${terrName}${postName}！`,
        actors: [
          { characterId: actor.id, role: '篡夺者' },
          { characterId: data.holderId, role: '你' },
        ],
        options: [
          {
            label: '知道了',
            description: '失去了这个头衔。',
            effects: [],
            effectKey: 'noop:notification',
            onSelect: () => { /* 已执行 */ },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
    }
  },
};

registerBehavior(usurpBehavior);
