// ===== NPC 征兵行为（新建营） =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import type { Army, UnitType } from '@engine/military/types';
import { MAX_BATTALION_STRENGTH } from '@engine/military/types';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { getAvailableRecruits, estimateNetGrain } from '@engine/military/militaryCalc';
import { RECRUIT_COST_PER_SOLDIER, executeRecruit } from '@engine/interaction/militaryAction';
import { ALL_UNIT_TYPES } from '@data/unitTypes';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { getControlledZhou as getControlledZhouPure } from '@engine/official/postQueries';
import { registerBehavior } from './index';

// ── 常量 ────────────────────────────────────────────────

/** 征兵一营的金钱成本 */
const CONSCRIPT_MONEY_COST = MAX_BATTALION_STRENGTH * RECRUIT_COST_PER_SOLDIER;

/** 最低金钱倍率：至少留够 N 倍征兵费用才考虑征兵 */
const MIN_MONEY_MULTIPLIER = 1.5;

/** 新营平均月粮耗（取所有兵种平均值） */
const AVG_GRAIN_PER_BATTALION = (() => {
  let sum = 0;
  for (const u of ALL_UNIT_TYPES) sum += u.grainCostPerThousand;
  return sum / ALL_UNIT_TYPES.length;
})();

// ── 纯函数辅助 ─────────────────────────────────────────

/** 从 ctx 获取角色控制的州（通过 controllerIndex） */
function getControlledZhou(
  actorId: string,
  ctx: NpcContext,
): Territory[] {
  const terrIds = ctx.controllerIndex.get(actorId);
  if (!terrIds) return [];
  const result: Territory[] = [];
  for (const tid of terrIds) {
    const t = ctx.territories.get(tid);
    if (t && t.tier === 'zhou') result.push(t);
  }
  return result;
}

/** 从 ctx 获取角色拥有的军队 */
function getOwnedArmies(actorId: string, ctx: NpcContext): Army[] {
  const result: Army[] = [];
  for (const army of ctx.armies.values()) {
    if (army.ownerId === actorId) result.push(army);
  }
  return result;
}


/** 获取有足够征兵池的州（按征兵池降序） */
function getRecruitableZhou(
  controlledZhou: Territory[],
): Array<{ territoryId: string; available: number }> {
  const result: Array<{ territoryId: string; available: number }> = [];
  for (const t of controlledZhou) {
    const available = getAvailableRecruits(t);
    if (available >= MAX_BATTALION_STRENGTH) {
      result.push({ territoryId: t.id, available });
    }
  }
  result.sort((a, b) => b.available - a.available);
  return result;
}

/** 根据性格选择兵种 */
function pickUnitType(boldness: number): UnitType {
  if (boldness > 0.6) {
    return Math.random() < 0.5 ? 'heavyCavalry' : 'heavyInfantry';
  }
  if (boldness < -0.3) {
    return Math.random() < 0.5 ? 'archer' : 'lightInfantry';
  }
  const idx = Math.floor(Math.random() * ALL_UNIT_TYPES.length);
  return ALL_UNIT_TYPES[idx].id;
}

/** 生成营名 */
function genBattalionName(armyName: string, unitType: UnitType, existingCount: number): string {
  const unitDef = ALL_UNIT_TYPES.find(u => u.id === unitType);
  const unitName = unitDef ? unitDef.name : '兵';
  return `${armyName}${unitName}第${existingCount + 1}营`;
}

// ── 行为定义 ────────────────────────────────────────────

interface ConscriptData {
  recruitableTerritories: Array<{ territoryId: string; available: number }>;
  armyIds: string[];
}

export const conscriptBehavior: NpcBehavior<ConscriptData> = {
  id: 'conscript',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<ConscriptData> | null {
    if (!actor.isRuler) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    // 必须有军队（从 ctx 快照查）
    const armies = getOwnedArmies(actor.id, ctx);
    if (armies.length === 0) return null;

    // 必须有足够金钱（检查 capital 国库）
    const capitalMoney = ctx.capitalTreasury.get(actor.id)?.money ?? actor.resources.money;
    if (capitalMoney < CONSCRIPT_MONEY_COST * MIN_MONEY_MULTIPLIER) return null;

    // 控制的州
    const controlledZhou = getControlledZhou(actor.id, ctx);

    // 必须有可征兵领地
    const recruitableTerritories = getRecruitableZhou(controlledZhou);
    if (recruitableTerritories.length === 0) return null;

    // 当前总营数
    let totalBattalions = 0;
    for (const army of armies) {
      totalBattalions += army.battalionIds.length;
    }

    // 每州期望 2 营基准
    const desiredBattalions = Math.max(2, controlledZhou.length * 2);
    const isBelowDesired = totalBattalions < desiredBattalions;

    const isAtWar = ctx.activeWars.some(w => isWarParticipant(actor.id, w));

    const moneyRatio = capitalMoney / CONSCRIPT_MONEY_COST;

    // 粮草评估：轻量估算月净粮草，判断征兵后是否仍为正
    const netGrain = estimateNetGrain(actor, controlledZhou, ctx.armies, ctx.battalions, undefined, {
      characters: ctx.characters,
      territories: ctx.territories,
      getControlledZhou: (cid) => getControlledZhouPure(cid, ctx.territories),
    });
    const netGrainAfter = netGrain - AVG_GRAIN_PER_BATTALION;

    const modifiers: WeightModifier[] = [
      { label: '基础', add: 10 },

      // 状态驱动
      ...(isAtWar ? [{ label: '战时扩军', add: 20 }] : []),
      ...(isBelowDesired ? [{ label: '兵力不足', add: 15 }] : []),
      ...(!isBelowDesired ? [{ label: '兵力充足', add: -15 }] : []),

      // 财政驱动
      ...(moneyRatio > 5 ? [{ label: '财力雄厚', add: 10 }] : []),
      ...(moneyRatio < 2 ? [{ label: '财力紧张', add: -10 }] : []),

      // 粮草驱动
      ...(netGrainAfter < 0 ? [{ label: '征兵后粮草为负', factor: 0 }] : []),
      ...(netGrain < AVG_GRAIN_PER_BATTALION * 2 ? [{ label: '粮草余量不足', add: -15 }] : []),
      ...(netGrain > AVG_GRAIN_PER_BATTALION * 5 ? [{ label: '粮草充裕', add: 10 }] : []),

      // 人格驱动
      { label: '尚武', add: personality.boldness * 15 },
      { label: '贪财', add: -personality.greed * 20 },
      { label: '荣誉', add: personality.honor * 5 },
      { label: '复仇', add: personality.vengefulness * 5 },
    ];

    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    return {
      data: {
        recruitableTerritories,
        armyIds: armies.map(a => a.id),
      },
      weight,
    };
  },

  // executeAsNpc 是副作用函数，允许读 Store 获取最新状态
  executeAsNpc(actor: Character, data: ConscriptData, ctx: NpcContext) {
    const personality = ctx.personalityCache.get(actor.id);
    const boldness = personality?.boldness ?? 0;
    const milStore = useMilitaryStore.getState();

    let count = 0;
    for (const { territoryId } of data.recruitableTerritories) {
      if (count >= 2) break;
      const freshCapitalMoney = ctx.capitalTreasury.get(actor.id)?.money ?? actor.resources.money;
      if (freshCapitalMoney < CONSCRIPT_MONEY_COST) break;

      // 粮草检查：用最新 Store 状态实时判断征兵后净粮草是否为正
      const controlledZhou = getControlledZhou(actor.id, ctx);
      const netGrain = estimateNetGrain(
        actor, controlledZhou, milStore.armies, milStore.battalions, undefined, {
          characters: ctx.characters,
          territories: ctx.territories,
          getControlledZhou: (cid) => getControlledZhouPure(cid, ctx.territories),
        },
      );
      if (netGrain - AVG_GRAIN_PER_BATTALION < 0) break;

      // 选营数最少的军队扩编
      let bestArmyId = data.armyIds[0];
      let minBats = Infinity;
      for (const armyId of data.armyIds) {
        const army = milStore.getArmy(armyId);
        if (army && army.battalionIds.length < minBats) {
          minBats = army.battalionIds.length;
          bestArmyId = armyId;
        }
      }

      const army = milStore.getArmy(bestArmyId);
      if (!army) break;

      const unitType = pickUnitType(boldness);
      const name = genBattalionName(army.name, unitType, army.battalionIds.length);
      executeRecruit(bestArmyId, territoryId, unitType, name);
      count++;
    }
  },
};

registerBehavior(conscriptBehavior);
