// ===== 战斗引擎 =====

import type { Character } from '@engine/character/types';
import type { Army, Battalion } from './types';
import type { BattlePhase, StrategyDef } from '@data/strategies';
import { ALL_STRATEGIES, PURSUIT_STRATEGIES } from '@data/strategies';
import { unitTypeMap } from '@data/unitTypes';
import { calcPersonality } from '@engine/character/personalityUtils';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import type { PersonalityKey } from '@data/traits';
import { PERSONALITY_KEYS } from '@data/traits';
import { random } from '@engine/random.ts';

// ── 阶段属性权重 ──

const PHASE_WEIGHTS: Record<BattlePhase | 'pursuit', Record<string, number>> = {
  deploy:   { charge: 0.2, breach: 0.8, pursuit: 0.0, siege: 0.0 },
  clash:    { charge: 0.8, breach: 0.1, pursuit: 0.1, siege: 0.0 },
  decisive: { charge: 0.4, breach: 0.6, pursuit: 0.0, siege: 0.0 },
  pursuit:  { charge: 0.1, breach: 0.0, pursuit: 0.9, siege: 0.0 },
};

// 阶段伤亡系数
const PHASE_CASUALTY_COEFF: Record<BattlePhase | 'pursuit', number> = {
  deploy: 0.02,
  clash: 0.05,
  decisive: 0.08,
  pursuit: 0.1,
};

// ── 类型 ──

export interface PhaseResult {
  phase: BattlePhase | 'pursuit';
  attackerStrategyId: string;
  defenderStrategyId: string;
  attackerTacticalPower: number;
  defenderTacticalPower: number;
  attackerMilitaryPower: number;
  defenderMilitaryPower: number;
  attackerFinalPower: number;
  defenderFinalPower: number;
  attackerLosses: number;
  defenderLosses: number;
  result: 'attackerWin' | 'defenderWin' | 'draw';
  attackerNarrative: string;
  defenderNarrative: string;
}

export interface BattleResult {
  phases: PhaseResult[];
  overallResult: 'attackerWin' | 'defenderWin';
  totalAttackerLosses: number;
  totalDefenderLosses: number;
  warScoreChange: number;
}

// ── 策略抽取 ──

/**
 * 从策略池中按人格权重抽取3条候选策略。
 */
export function drawStrategies(
  commander: Character,
  phase: BattlePhase,
  armyIds: string[],
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
): StrategyDef[] {
  const personality = calcPersonality(commander);

  // 过滤该阶段可用策略
  let pool = ALL_STRATEGIES.filter((s) => s.phases.includes(phase));

  // 过滤兵种需求
  pool = pool.filter((s) => {
    if (!s.unitTypeRequirement) return true;
    const { type, minCount } = s.unitTypeRequirement;
    let count = 0;
    for (const armyId of armyIds) {
      const army = armies.get(armyId);
      if (!army) continue;
      for (const batId of army.battalionIds) {
        const bat = battalions.get(batId);
        if (bat && bat.unitType === type && bat.currentStrength > 0) count++;
      }
    }
    return count >= minCount;
  });

  if (pool.length === 0) {
    // fallback: 坚阵固守
    const fallback = ALL_STRATEGIES.find((s) => s.id === 'str-hold');
    return fallback ? [fallback] : [];
  }

  // 按人格权重计算每条策略的抽取概率
  const weights = pool.map((s) => {
    let w = 1; // 基础权重
    for (const key of PERSONALITY_KEYS) {
      const sw = s.personalityWeights[key as PersonalityKey] ?? 0;
      if (sw !== 0) {
        w += sw * (personality[key as PersonalityKey] + 1); // personality在[-1,1]，+1后在[0,2]
      }
    }
    return Math.max(0.1, w);
  });

  // 加权随机选3条（不重复）
  const selected: StrategyDef[] = [];
  const remaining = pool.map((s, i) => ({ s, w: weights[i] }));

  for (let i = 0; i < Math.min(3, remaining.length); i++) {
    const totalW = remaining.reduce((sum, r) => sum + r.w, 0);
    let roll = random() * totalW;
    let picked = 0;
    for (let j = 0; j < remaining.length; j++) {
      roll -= remaining[j].w;
      if (roll <= 0) { picked = j; break; }
    }
    selected.push(remaining[picked].s);
    remaining.splice(picked, 1);
  }

  return selected;
}

// ── 战术力量 ──

/**
 * 战术力量 = 策略基础力量 × 能力系数 × 累计势头
 * 结果在 0~2 之间
 */
export function calcTacticalPower(
  strategy: StrategyDef,
  commander: Character,
  momentum: number, // 累计势头 1.0 为中性
): number {
  const abilities = getEffectiveAbilities(commander);
  const abilityValue = abilities[strategy.abilityDependency];
  // 能力系数：10=1.0，20=1.5，5=0.75
  const abilityCoeff = 0.5 + abilityValue * 0.05;

  const raw = strategy.basePower * abilityCoeff * momentum;
  return Math.max(0, Math.min(2, raw));
}

// ── 军事力量 ──

/**
 * 军事力量 = 总兵力 × 阶段属性加权值 × 叠加修正
 */
export function calcMilitaryPower(
  armyIds: string[],
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
  characters: Map<string, Character>,
  phase: BattlePhase | 'pursuit',
): number {
  const weights = PHASE_WEIGHTS[phase];
  let totalPower = 0;

  for (const armyId of armyIds) {
    const army = armies.get(armyId);
    if (!army) continue;
    const commander = army.commanderId ? characters.get(army.commanderId) : undefined;
    const commanderMil = commander ? getEffectiveAbilities(commander).military : 10;
    // 将领加成: 1 + (military - 10) * 0.02
    const leaderBonus = 1 + (commanderMil - 10) * 0.02;

    for (const batId of army.battalionIds) {
      const bat = battalions.get(batId);
      if (!bat || bat.currentStrength <= 0) continue;

      const unitDef = unitTypeMap.get(bat.unitType);
      if (!unitDef) continue;

      // 阶段属性加权
      const phaseValue =
        (unitDef.charge * (weights.charge ?? 0)) +
        (unitDef.breach * (weights.breach ?? 0)) +
        (unitDef.pursuit * (weights.pursuit ?? 0)) +
        (unitDef.siege * (weights.siege ?? 0));

      // 精锐度修正: 1 + elite/200
      const eliteBonus = 1 + bat.elite / 200;
      // 士气修正: 0.5 + morale/100 * 0.5 (即 morale=0→0.5, 100→1.0)
      const moraleCoeff = 0.5 + bat.morale / 100 * 0.5;

      totalPower += bat.currentStrength * phaseValue * eliteBonus * moraleCoeff * leaderBonus;
    }
  }

  return totalPower;
}

// ── 阶段结算 ──

function resolvePhase(
  phase: BattlePhase,
  attackerStrategy: StrategyDef,
  defenderStrategy: StrategyDef,
  attackerCommander: Character,
  defenderCommander: Character,
  attackerArmyIds: string[],
  defenderArmyIds: string[],
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
  characters: Map<string, Character>,
  attackerMomentum: number,
  defenderMomentum: number,
): PhaseResult {
  const aTactical = calcTacticalPower(attackerStrategy, attackerCommander, attackerMomentum);
  const dTactical = calcTacticalPower(defenderStrategy, defenderCommander, defenderMomentum);
  const aMilitary = calcMilitaryPower(attackerArmyIds, armies, battalions, characters, phase);
  const dMilitary = calcMilitaryPower(defenderArmyIds, armies, battalions, characters, phase);

  const aFinal = aMilitary * aTactical;
  const dFinal = dMilitary * dTactical;

  const ratio = aFinal > 0 && dFinal > 0 ? Math.max(aFinal, dFinal) / Math.min(aFinal, dFinal) : 1;
  const result: PhaseResult['result'] = aFinal > dFinal ? 'attackerWin' : aFinal < dFinal ? 'defenderWin' : 'draw';

  // 伤害计算：以较小方兵力为基准
  const coeff = PHASE_CASUALTY_COEFF[phase];
  const winnerBonus = ratio >= 2 ? 0.3 : ratio >= 1.5 ? 0.15 : 0;
  const loserPenalty = ratio >= 2 ? 0.5 : ratio >= 1.5 ? 0.25 : 0;

  // 统计双方实际兵力
  let aTroops = 0;
  for (const aid of attackerArmyIds) {
    for (const bat of battalions.values()) {
      if (bat.armyId === aid && bat.currentStrength > 0) aTroops += bat.currentStrength;
    }
  }
  let dTroops = 0;
  for (const did of defenderArmyIds) {
    for (const bat of battalions.values()) {
      if (bat.armyId === did && bat.currentStrength > 0) dTroops += bat.currentStrength;
    }
  }
  const baseCasualties = Math.min(aTroops, dTroops) * coeff;
  const weakerRatio = Math.min(aFinal, dFinal) / Math.max(aFinal, dFinal, 1); // 0~1

  let attackerLosses: number;
  let defenderLosses: number;

  if (result === 'attackerWin') {
    attackerLosses = Math.floor(baseCasualties * weakerRatio * (1 - winnerBonus));
    defenderLosses = Math.floor(baseCasualties * (1 + loserPenalty));
  } else if (result === 'defenderWin') {
    attackerLosses = Math.floor(baseCasualties * (1 + loserPenalty));
    defenderLosses = Math.floor(baseCasualties * weakerRatio * (1 - winnerBonus));
  } else {
    attackerLosses = Math.floor(baseCasualties * 0.5);
    defenderLosses = Math.floor(baseCasualties * 0.5);
  }

  const attackerNarrative = result === 'attackerWin' ? attackerStrategy.narratives.win : attackerStrategy.narratives.lose;
  const defenderNarrative = result === 'defenderWin' ? defenderStrategy.narratives.win : defenderStrategy.narratives.lose;

  return {
    phase,
    attackerStrategyId: attackerStrategy.id,
    defenderStrategyId: defenderStrategy.id,
    attackerTacticalPower: aTactical,
    defenderTacticalPower: dTactical,
    attackerMilitaryPower: aMilitary,
    defenderMilitaryPower: dMilitary,
    attackerFinalPower: aFinal,
    defenderFinalPower: dFinal,
    attackerLosses,
    defenderLosses,
    result,
    attackerNarrative,
    defenderNarrative,
  };
}

// ── 应用伤亡 ──

function applyCasualties(
  armyIds: string[],
  losses: number,
  battalions: Map<string, Battalion>,
): void {
  // 按各营兵力比例分摊损失
  let totalStrength = 0;
  const bats: Battalion[] = [];
  for (const armyId of armyIds) {
    // 需要从 battalions 中找到属于该军的
    for (const bat of battalions.values()) {
      if (bat.armyId === armyId && bat.currentStrength > 0) {
        totalStrength += bat.currentStrength;
        bats.push(bat);
      }
    }
  }
  if (totalStrength === 0) return;

  let remainingLoss = losses;
  for (const bat of bats) {
    const share = Math.floor(losses * (bat.currentStrength / totalStrength));
    const actualLoss = Math.min(share, bat.currentStrength);
    battalions.set(bat.id, { ...bat, currentStrength: bat.currentStrength - actualLoss });
    remainingLoss -= actualLoss;
  }
  // 剩余损失分给第一个有兵的营
  if (remainingLoss > 0) {
    for (const bat of bats) {
      const current = battalions.get(bat.id)!;
      if (current.currentStrength > 0) {
        const loss = Math.min(remainingLoss, current.currentStrength);
        battalions.set(bat.id, { ...current, currentStrength: current.currentStrength - loss });
        break;
      }
    }
  }
}

// ── 完整战斗（AI自动结算） ──

export function resolveBattle(
  attackerCommanderId: string,
  defenderCommanderId: string,
  attackerArmyIds: string[],
  defenderArmyIds: string[],
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
  characters: Map<string, Character>,
  attackerPresets?: Record<string, string | undefined>,
  defenderPresets?: Record<string, string | undefined>,
): BattleResult {
  const attacker = characters.get(attackerCommanderId);
  const defender = characters.get(defenderCommanderId);
  if (!attacker || !defender) {
    return { phases: [], overallResult: 'attackerWin', totalAttackerLosses: 0, totalDefenderLosses: 0, warScoreChange: 0 };
  }

  const phases: PhaseResult[] = [];
  let attackerMomentum = 1.0;
  let defenderMomentum = 1.0;
  let totalAttackerLosses = 0;
  let totalDefenderLosses = 0;

  // 前三阶段
  const battlePhases: BattlePhase[] = ['deploy', 'clash', 'decisive'];
  for (const phase of battlePhases) {
    // 预设策略 > AI自动选
    const aPresetId = attackerPresets?.[phase];
    const dPresetId = defenderPresets?.[phase];
    const aPreset = aPresetId ? ALL_STRATEGIES.find((s) => s.id === aPresetId) : undefined;
    const dPreset = dPresetId ? ALL_STRATEGIES.find((s) => s.id === dPresetId) : undefined;
    const aStrategy = aPreset ?? drawStrategies(attacker, phase, attackerArmyIds, armies, battalions)[0] ?? ALL_STRATEGIES[3];
    const dStrategy = dPreset ?? drawStrategies(defender, phase, defenderArmyIds, armies, battalions)[0] ?? ALL_STRATEGIES[3];

    const result = resolvePhase(
      phase, aStrategy, dStrategy,
      attacker, defender,
      attackerArmyIds, defenderArmyIds,
      armies, battalions, characters,
      attackerMomentum, defenderMomentum,
    );

    // 应用伤亡
    applyCasualties(attackerArmyIds, result.attackerLosses, battalions);
    applyCasualties(defenderArmyIds, result.defenderLosses, battalions);
    totalAttackerLosses += result.attackerLosses;
    totalDefenderLosses += result.defenderLosses;

    // 更新势头
    if (result.result === 'attackerWin') {
      attackerMomentum = Math.min(1.5, attackerMomentum + 0.1);
      defenderMomentum = Math.max(0.7, defenderMomentum - 0.1);
    } else if (result.result === 'defenderWin') {
      defenderMomentum = Math.min(1.5, defenderMomentum + 0.1);
      attackerMomentum = Math.max(0.7, attackerMomentum - 0.1);
    }

    phases.push(result);
  }

  // 决胜阶段胜者 = 战斗胜者
  const decisiveResult = phases[2].result;
  const overallResult: BattleResult['overallResult'] =
    decisiveResult === 'defenderWin' ? 'defenderWin' : 'attackerWin';

  // 追击阶段
  const winnerPursuit = PURSUIT_STRATEGIES.find((s) => s.side === 'winner' && s.id === 'pursuit-chase')!;
  const loserPursuit = PURSUIT_STRATEGIES.find((s) => s.side === 'loser' && s.id === 'pursuit-flee')!;

  // 追击伤亡：以败方剩余兵力为基准，受胜方追击属性影响
  const loserArmyIds = overallResult === 'attackerWin' ? defenderArmyIds : attackerArmyIds;
  const winnerArmyIds = overallResult === 'attackerWin' ? attackerArmyIds : defenderArmyIds;
  let loserRemainingTroops = 0;
  for (const aid of loserArmyIds) {
    for (const bat of battalions.values()) {
      if (bat.armyId === aid && bat.currentStrength > 0) loserRemainingTroops += bat.currentStrength;
    }
  }
  // 胜方加权追击属性
  let totalPursuit = 0;
  let totalBats = 0;
  for (const aid of winnerArmyIds) {
    for (const bat of battalions.values()) {
      if (bat.armyId === aid && bat.currentStrength > 0) {
        const ud = unitTypeMap.get(bat.unitType);
        if (ud) {
          totalPursuit += (bat.currentStrength / 1000) * ud.pursuit;
          totalBats++;
        }
      }
    }
  }
  const avgPursuit = totalBats > 0 ? totalPursuit / totalBats : 3;
  const pursuitEfficiency = Math.max(0.2, Math.min(10, avgPursuit / 5 * 3)); // 全轻骑可达5.4，极端场景可全歼
  let pursuitLosses = Math.floor(loserRemainingTroops * PHASE_CASUALTY_COEFF.pursuit * winnerPursuit.damageMultiplier * pursuitEfficiency);
  // 追击损失超过90%时直接全歼
  if (pursuitLosses >= loserRemainingTroops * 0.9) {
    pursuitLosses = loserRemainingTroops;
  }

  if (overallResult === 'attackerWin') {
    applyCasualties(defenderArmyIds, pursuitLosses, battalions);
    totalDefenderLosses += pursuitLosses;
  } else {
    applyCasualties(attackerArmyIds, pursuitLosses, battalions);
    totalAttackerLosses += pursuitLosses;
  }

  phases.push({
    phase: 'pursuit',
    attackerStrategyId: overallResult === 'attackerWin' ? winnerPursuit.id : loserPursuit.id,
    defenderStrategyId: overallResult === 'attackerWin' ? loserPursuit.id : winnerPursuit.id,
    attackerTacticalPower: 0,
    defenderTacticalPower: 0,
    attackerMilitaryPower: 0,
    defenderMilitaryPower: 0,
    attackerFinalPower: 0,
    defenderFinalPower: 0,
    attackerLosses: overallResult === 'attackerWin' ? 0 : pursuitLosses,
    defenderLosses: overallResult === 'attackerWin' ? pursuitLosses : 0,
    result: overallResult === 'attackerWin' ? 'attackerWin' : 'defenderWin',
    attackerNarrative: overallResult === 'attackerWin' ? winnerPursuit.narrative : loserPursuit.narrative,
    defenderNarrative: overallResult === 'attackerWin' ? loserPursuit.narrative : winnerPursuit.narrative,
  });

  // 战争分数
  const loserTotalTroops = overallResult === 'attackerWin' ? totalDefenderLosses : totalAttackerLosses;
  const lossRatio = loserTotalTroops / Math.max(1, 50000);
  const warScoreChange = lossRatio >= 0.5 ? 25 : lossRatio >= 0.3 ? 15 : lossRatio >= 0.15 ? 8 : 3;

  // 士气和精锐度影响
  const finalLoserArmyIds = overallResult === 'attackerWin' ? defenderArmyIds : attackerArmyIds;

  for (const bat of battalions.values()) {
    if (winnerArmyIds.includes(bat.armyId)) {
      // 胜方：士气+10，精锐度+5（上限100）
      battalions.set(bat.id, {
        ...bat,
        morale: Math.min(100, bat.morale + 10),
        elite: Math.min(100, bat.elite + 5),
      });
    } else if (finalLoserArmyIds.includes(bat.armyId)) {
      // 败方：士气-15，精锐度-3（下限0）
      battalions.set(bat.id, {
        ...bat,
        morale: Math.max(0, bat.morale - 15),
        elite: Math.max(0, bat.elite - 3),
      });
    }
  }

  return {
    phases,
    overallResult,
    totalAttackerLosses,
    totalDefenderLosses,
    warScoreChange,
  };
}
