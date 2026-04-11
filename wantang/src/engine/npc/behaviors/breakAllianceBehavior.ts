// ===== NPC 主动解除同盟行为 =====
//
// 合法解约（非背盟）。核心触发条件是**积怨**（好感 ≤ -50）——这是离间计生效的关键入口。
// 必要条件：好感 ≤ -50 + 过试用期 + 非共同参战；
// 权重影响：荣誉（高 honor 强烈抑制）+ 实力悬殊（加成）+ 积怨深度。
// 不设 honor 硬闸——极端积怨（-100 级）应能压倒任何荣誉守约。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { executeBreakAlliance } from '@engine/interaction/breakAllianceAction';
import { useWarStore } from '@engine/military/WarStore';
import { toAbsoluteDay } from '@engine/dateUtils';
import { ALLIANCE_MIN_AGE_BEFORE_NPC_BREAK_DAYS } from '@engine/military/types';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { registerBehavior } from './index';

interface BreakAllianceData {
  otherPartyId: string;
}

export const breakAllianceBehavior: NpcBehavior<BreakAllianceData> = {
  id: 'breakAlliance',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<BreakAllianceData> | null {
    if (!actor.alive || !actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const currentDay = toAbsoluteDay(ctx.date);
    const warStore = useWarStore.getState();
    const alliances = warStore.getAlliancesOf(actor.id);
    if (alliances.length === 0) return null;

    let bestWeight = 0;
    let bestOther: string | null = null;

    for (const al of alliances) {
      // ── 必要条件（硬闸）──
      // 1. 同盟仍在有效期
      if (al.expiryDay <= currentDay) continue;
      // 2. 已过试用期
      if (currentDay - al.startDay < ALLIANCE_MIN_AGE_BEFORE_NPC_BREAK_DAYS) continue;

      const otherId = al.partyA === actor.id ? al.partyB : al.partyA;
      const other = ctx.characters.get(otherId);
      if (!other?.alive) continue;

      // 3. 非共同参战（战时弃盟代价过高，留作未来"前线弃盟"专属场景）
      let coFighting = false;
      for (const w of ctx.activeWars) {
        if (isWarParticipant(actor.id, w) && isWarParticipant(otherId, w)) {
          coFighting = true;
          break;
        }
      }
      if (coFighting) continue;

      // 4. 积怨：opinion ≤ -50 —— 这是离间计的关键入口门槛
      const opinion = ctx.getOpinion(actor.id, otherId);
      if (opinion > -50) continue;

      // ── 权重计算（软影响）──
      const myStr = Math.max(1, ctx.getMilitaryStrength(actor.id));
      const theirStr = Math.max(1, ctx.getMilitaryStrength(otherId));
      const ratio = myStr / theirStr;
      const ratioExtreme = ratio >= 3 || ratio <= 1 / 3;

      const modifiers: WeightModifier[] = [
        // 过硬闸即有基础概率
        { label: '基础', add: 10 },
        // 积怨：-50 → 0，-100 → +100（线性放大）
        { label: '积怨', add: (Math.abs(opinion) - 50) * 2 },
        // 荣誉：honor=1 → -60，honor=-1 → +60。不硬闸，但高 honor 强烈抑制
        { label: '荣誉', add: -personality.honor * 60 },
        // 实力悬殊：降级为权重加成而非硬闸，避免平级盟友（如河北三镇）永不解盟
        { label: '实力悬殊', add: ratioExtreme ? 20 : 0 },
      ];
      const weight = calcWeight(modifiers);
      if (weight > bestWeight) {
        bestWeight = weight;
        bestOther = otherId;
      }
    }

    if (!bestOther || bestWeight <= 10) return null;

    return {
      data: { otherPartyId: bestOther },
      weight: bestWeight,
    };
  },

  executeAsNpc(actor: Character, data: BreakAllianceData) {
    // executeBreakAlliance 内部会做 stale 校验、战时禁止、玩家通知
    executeBreakAlliance(actor.id, data.otherPartyId);
  },
};

registerBehavior(breakAllianceBehavior);
