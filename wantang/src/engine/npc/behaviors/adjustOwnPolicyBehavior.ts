// ===== NPC 自调政策行为（独立统治者提升自身权力） =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { getOwnPolicyPosts } from '../policyCalc';
import { executeToggleSuccession, executeToggleAppointRight } from '@engine/interaction';
import { registerBehavior } from './index';
import { debugLog } from '@engine/debugLog';

interface AdjustOwnPolicyData {
  postId: string;
  territoryId: string;
  capitalZhouId?: string;
  action: 'toClan' | 'grantAppointRight';
}

export const adjustOwnPolicyBehavior: NpcBehavior<AdjustOwnPolicyData> = {
  id: 'adjustOwnPolicy',
  playerMode: 'skip', // 玩家从 RealmPanel 体制Tab手动操作

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<AdjustOwnPolicyData> | null {
    // 仅独立统治者/皇帝
    if (!actor.isRuler) return null;
    if (actor.overlordId) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const ownPosts = getOwnPolicyPosts(actor.id, ctx);
    if (ownPosts.length === 0) return null;

    // 提升方向：流官 → 宗法（增强世袭权）
    for (const pp of ownPosts) {
      if (pp.successionLaw === 'clan') continue;
      const modifiers: WeightModifier[] = [
        { label: '基础', add: 5 },
        { label: '荣誉驱动', add: personality.honor * 3 },
        { label: '贪婪抑制', add: personality.greed * -2 },
      ];
      const w = calcWeight(modifiers);
      if (w > 0) {
        return {
          data: {
            postId: pp.postId,
            territoryId: pp.territoryId,
            capitalZhouId: pp.capitalZhouId,
            action: 'toClan',
          },
          weight: w,
        };
      }
    }

    // 提升方向：无辟署权 → 有辟署权（获得自主任命权）
    for (const pp of ownPosts) {
      if (pp.hasAppointRight) continue;
      const modifiers: WeightModifier[] = [
        { label: '基础', add: 5 },
        { label: '荣誉驱动', add: personality.honor * 3 },
        { label: '贪婪抑制', add: personality.greed * -2 },
      ];
      const w = calcWeight(modifiers);
      if (w > 0) {
        return {
          data: {
            postId: pp.postId,
            territoryId: pp.territoryId,
            action: 'grantAppointRight',
          },
          weight: w,
        };
      }
    }

    return null;
  },

  executeAsNpc(actor: Character, data: AdjustOwnPolicyData, ctx: NpcContext) {
    const terrName = ctx.territories.get(data.territoryId)?.name ?? '';

    if (data.action === 'toClan') {
      executeToggleSuccession(data.postId);
      debugLog('policy', `[自身政策] ${actor.name}：${terrName} 改为世袭`);
    } else {
      executeToggleAppointRight(data.postId);
      debugLog('policy', `[自身政策] ${actor.name}：${terrName} 授予辟署权`);
    }
  },
};

registerBehavior(adjustOwnPolicyBehavior);
