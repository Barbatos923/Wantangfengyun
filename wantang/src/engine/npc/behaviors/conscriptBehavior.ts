// ===== NPC 征兵行为（新建营） =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import type { Army, UnitType } from '@engine/military/types';
import { MAX_BATTALION_STRENGTH } from '@engine/military/types';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { getAvailableRecruits } from '@engine/military/militaryCalc';
import { useLedgerStore } from '@engine/official/LedgerStore';
import type { MonthlyLedger } from '@engine/official/types';
import { RECRUIT_COST_PER_SOLDIER, executeRecruit } from '@engine/interaction/militaryAction';
import { ALL_UNIT_TYPES } from '@data/unitTypes';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { registerBehavior } from './index';

// ── 常量 ────────────────────────────────────────────────

/** 征兵一营的金钱成本 */
const CONSCRIPT_MONEY_COST = MAX_BATTALION_STRENGTH * RECRUIT_COST_PER_SOLDIER;

/** 最低金钱倍率：至少留够 N 倍征兵费用才考虑征兵 */
const MIN_MONEY_MULTIPLIER = 1.5;

/** 新营平均月粮耗（取所有兵种平均值），用于评估新增一营的边际粮草成本 */
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


/** 获取兵员够 + 本州国库金钱够的州（按征兵池降序）。粮草由全局 ledger 评估，不在此处过滤 */
function getRecruitableZhou(
  controlledZhou: Territory[],
  actor: Character,
): Array<{ territoryId: string; available: number }> {
  const result: Array<{ territoryId: string; available: number }> = [];
  for (const t of controlledZhou) {
    const available = getAvailableRecruits(t);
    if (available < MAX_BATTALION_STRENGTH) continue;
    // 本州国库（无 treasury fallback 私产，与 debitTreasury 一致）
    const treasuryMoney = t.treasury?.money ?? actor.resources.money;
    if (treasuryMoney < CONSCRIPT_MONEY_COST * MIN_MONEY_MULTIPLIER) continue;
    result.push({ territoryId: t.id, available });
  }
  result.sort((a, b) => b.available - a.available);
  return result;
}

/**
 * 全局粮草净流量评估（国库视角，不含俸禄）：
 *   收入 = 领地产出 + 属下上缴 + 回拨收入
 *   支出 = 军事维持 + 回拨下属 + 上缴领主
 *
 * 直接读取月结时缓存的 ledger（economySystem 写入），零额外计算成本。
 * 没有缓存时（首月或非月初）返回 +Infinity，相当于不门控（让权重 modifier 决定）。
 */
function calcGlobalGrainNet(ledger: MonthlyLedger | undefined): number {
  if (!ledger) return Infinity;
  const income = ledger.territoryIncome.grain + ledger.vassalTribute.grain + ledger.redistributionReceived.grain;
  const expense = ledger.militaryMaintenance.grain + ledger.redistributionPaid.grain + ledger.overlordTribute.grain;
  return income - expense;
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

    // 控制的州
    const controlledZhou = getControlledZhou(actor.id, ctx);

    // 必须有"兵员够 + 本州国库金钱够"的州
    const recruitableTerritories = getRecruitableZhou(controlledZhou, actor);
    if (recruitableTerritories.length === 0) return null;

    // 全局粮草净流量（国库视角，不含俸禄）
    const globalGrainNet = calcGlobalGrainNet(ctx.ledgers.get(actor.id));
    // 加一营是否仍可负担：净流量 - 单营月粮耗 ≥ 0
    if (globalGrainNet - AVG_GRAIN_PER_BATTALION < 0) return null;

    // 当前总营数
    let totalBattalions = 0;
    for (const army of armies) {
      totalBattalions += army.battalionIds.length;
    }

    // 每州期望 2 营基准
    const desiredBattalions = Math.max(2, controlledZhou.length * 2);
    const isBelowDesired = totalBattalions < desiredBattalions;

    const isAtWar = ctx.activeWars.some(w => isWarParticipant(actor.id, w));

    // moneyRatio：可征兵州国库总和 / 单营成本（衡量"还能征几营"）
    let recruitablePoolMoney = 0;
    for (const r of recruitableTerritories) {
      const t = ctx.territories.get(r.territoryId);
      recruitablePoolMoney += t?.treasury?.money ?? 0;
    }
    const moneyRatio = recruitablePoolMoney / CONSCRIPT_MONEY_COST;

    const modifiers: WeightModifier[] = [
      { label: '基础', add: 10 },

      // 状态驱动
      ...(isAtWar ? [{ label: '战时扩军', add: 20 }] : []),
      ...(isBelowDesired ? [{ label: '兵力不足', add: 15 }] : []),
      ...(!isBelowDesired ? [{ label: '兵力充足', add: -15 }] : []),

      // 财政驱动
      ...(moneyRatio > 5 ? [{ label: '财力雄厚', add: 10 }] : []),
      ...(moneyRatio < 2 ? [{ label: '财力紧张', add: -10 }] : []),

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
    // 基准粮草净流量（月初账本快照），后续每征一营递减 AVG_GRAIN_PER_BATTALION
    let grainNetRemaining = calcGlobalGrainNet(useLedgerStore.getState().allLedgers.get(actor.id));
    const terrStore = useTerritoryStore.getState();
    for (const { territoryId } of data.recruitableTerritories) {
      if (count >= 2) break;
      // 征兵扣本州国库，按本州金钱判断
      const freshTerritory = terrStore.territories.get(territoryId);
      const freshTreasuryMoney = freshTerritory?.treasury?.money ?? actor.resources.money;
      if (freshTreasuryMoney < CONSCRIPT_MONEY_COST) continue; // 该州不够，试下一个

      // 全局粮草检查：每加一营前校验，连征时递减避免超载
      if (grainNetRemaining - AVG_GRAIN_PER_BATTALION < 0) break;

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
      grainNetRemaining -= AVG_GRAIN_PER_BATTALION;
      count++;
    }
  },
};

registerBehavior(conscriptBehavior);
