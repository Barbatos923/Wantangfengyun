// ===== NPC 军事动员行为（宣战后自动组建行营） =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import type { War } from '@engine/military/types';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { executeCreateCampaign } from '@engine/interaction/campaignAction';
import { positionMap } from '@data/positions';
import { isWarParticipant, isOnAttackerSide, isOnDefenderSide, getPrimaryEnemyId } from '@engine/military/warParticipantUtils';
import { registerBehavior } from './index';

// ── 辅助函数 ────────────────────────────────────────────

/** 获取角色作为攻方或防方参与的、且尚未组建行营的战争 */
function getUnmobilizedWars(actorId: string, ctx: NpcContext): War[] {
  const warStore = useWarStore.getState();
  const campaigns = warStore.campaigns;

  return ctx.activeWars.filter(war => {
    if (!isWarParticipant(actorId, war)) return false;
    // 检查是否已有该角色的行营
    for (const camp of campaigns.values()) {
      if (camp.warId === war.id && camp.ownerId === actorId) return false;
    }
    return true;
  });
}

/** 获取角色控制的第一个州级领地 ID（作为集结点） */
function getHomeZhouId(actorId: string, ctx: NpcContext): string | null {
  for (const t of ctx.territories.values()) {
    if (t.tier !== 'zhou') continue;
    const mainPost = t.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (mainPost?.holderId === actorId) return t.id;
  }
  return null;
}

// ── 行为定义 ────────────────────────────────────────────

interface MobilizeData {
  wars: War[];
  isAttacker: boolean; // 用于 log 区分
}

export const mobilizeBehavior: NpcBehavior<MobilizeData> = {
  id: 'mobilize',
  playerMode: 'skip', // 玩家自己从军事面板操作

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<MobilizeData> | null {
    if (!actor.isRuler) return null;

    const wars = getUnmobilizedWars(actor.id, ctx);
    if (wars.length === 0) return null;

    // 攻方阵营：强制动员，必定出击
    const attackWars = wars.filter(w => isOnAttackerSide(actor.id, w));
    if (attackWars.length > 0) {
      return {
        data: { wars: attackWars, isAttacker: true },
        weight: 100,
        forced: true,
      };
    }

    // 防守方阵营：根据性格/兵力决定是否出城野战
    const defenseWars = wars.filter(w => isOnDefenderSide(actor.id, w));
    if (defenseWars.length === 0) return null;

    const personality = ctx.personalityCache.get(actor.id)!;
    // 评估最危险的那场战争的兵力对比
    let worstRatio = Infinity;
    for (const war of defenseWars) {
      const enemyLeaderId = getPrimaryEnemyId(actor.id, war) ?? war.attackerId;
      const enemyStr = ctx.getMilitaryStrength(enemyLeaderId);
      const myStr = ctx.getMilitaryStrength(actor.id);
      const ratio = enemyStr > 0 ? myStr / enemyStr : 2;
      if (ratio < worstRatio) worstRatio = ratio;
    }

    const modifiers: WeightModifier[] = [
      { label: '基础', add: 30 },  // 默认倾向出城
      { label: '胆识', add: personality.boldness * 30 },
      { label: '理性(弱势不出)', add: worstRatio < 0.8 ? -personality.rationality * 40 : 0 },
      // 兵力悬殊 → 守城
      ...(worstRatio < 0.5 ? [{ label: '实力悬殊', add: -40 }]
        : worstRatio < 0.8 ? [{ label: '兵力劣势', add: -15 }]
        : worstRatio >= 1.5 ? [{ label: '兵力优势', add: 20 }]
        : []),
    ];
    const weight = calcWeight(modifiers);

    if (weight <= 0) return null;

    return {
      data: { wars: defenseWars, isAttacker: false },
      weight,
      forced: false, // 防守方出城是自愿行为
    };
  },

  executeAsNpc(actor: Character, data: MobilizeData, ctx: NpcContext) {
    const milStore = useMilitaryStore.getState();
    const armies = milStore.getArmiesByOwner(actor.id);
    if (armies.length === 0) return;

    const homeId = getHomeZhouId(actor.id, ctx);
    if (!homeId) return;

    const armyIds = armies.map(a => a.id);

    for (const war of data.wars) {
      // 只组建行营，行军目标由 warSystem 行营 AI 自动决定
      executeCreateCampaign(war.id, actor.id, armyIds, homeId);

      // 只处理第一场未动员的战争（一次动员一场）
      break;
    }
  },
};

registerBehavior(mobilizeBehavior);
