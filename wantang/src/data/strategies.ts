// ===== 战斗策略数据（最小化初版） =====

import type { Abilities } from '@engine/character/types';
import type { UnitType } from '@engine/military/types';
import type { PersonalityKey } from './traits';

/** 战斗阶段（不含追击） */
export type BattlePhase = 'deploy' | 'clash' | 'decisive';

/** 策略定义 */
export interface StrategyDef {
  id: string;
  name: string;
  basePower: number;
  personalityWeights: Partial<Record<PersonalityKey, number>>;
  abilityDependency: keyof Abilities;
  phases: BattlePhase[];
  unitTypeRequirement?: { type: UnitType; minCount: number };
  narratives: { win: string; lose: string };
}

/** 追击阶段策略 */
export interface PursuitStrategyDef {
  id: string;
  name: string;
  side: 'winner' | 'loser';
  damageMultiplier: number;     // 对敌方伤害倍率
  selfDamageMultiplier: number; // 对自身伤害倍率
  narrative: string;
}

// ── 正式策略（列阵/交锋/决胜共用池，按 phases 过滤） ──

export const ALL_STRATEGIES: StrategyDef[] = [
  // 进攻型
  {
    id: 'str-charge', name: '全军冲锋',
    basePower: 1.2,
    personalityWeights: { boldness: 0.8, energy: 0.5 },
    abilityDependency: 'military',
    phases: ['clash', 'decisive'],
    narratives: { win: '我军全军冲锋，敌阵大溃', lose: '全军冲锋受挫，损失惨重' },
  },
  {
    id: 'str-ambush', name: '设伏诱敌',
    basePower: 1.3,
    personalityWeights: { rationality: 0.8, vengefulness: 0.3 },
    abilityDependency: 'strategy',
    phases: ['deploy', 'clash'],
    narratives: { win: '伏兵四起，敌军中计', lose: '伏击被识破，反遭突袭' },
  },
  {
    id: 'str-cavalry-charge', name: '铁骑冲锋',
    basePower: 1.4,
    personalityWeights: { boldness: 0.7, energy: 0.6 },
    abilityDependency: 'military',
    phases: ['clash', 'decisive'],
    unitTypeRequirement: { type: 'heavyCavalry', minCount: 2 },
    narratives: { win: '铁骑洪流冲破敌阵', lose: '骑兵冲锋受阻，折损过半' },
  },
  // 防御型
  {
    id: 'str-hold', name: '坚阵固守',
    basePower: 1.1,
    personalityWeights: { rationality: 0.6, honor: 0.5 },
    abilityDependency: 'administration',
    phases: ['deploy', 'clash', 'decisive'],
    narratives: { win: '坚阵不动，敌军攻势瓦解', lose: '固守阵地终被突破' },
  },
  {
    id: 'str-shield-wall', name: '结阵拒敌',
    basePower: 1.0,
    personalityWeights: { honor: 0.7, rationality: 0.4 },
    abilityDependency: 'military',
    phases: ['deploy', 'clash'],
    narratives: { win: '盾阵如墙，敌箭无功', lose: '阵型被冲散' },
  },
  // 谋略型
  {
    id: 'str-feint', name: '虚张声势',
    basePower: 1.15,
    personalityWeights: { sociability: 0.6, rationality: 0.5 },
    abilityDependency: 'diplomacy',
    phases: ['deploy'],
    narratives: { win: '疑兵之计奏效，敌军犹豫不前', lose: '虚张声势被识破' },
  },
  {
    id: 'str-flank', name: '迂回包抄',
    basePower: 1.25,
    personalityWeights: { rationality: 0.7, boldness: 0.4 },
    abilityDependency: 'strategy',
    phases: ['clash', 'decisive'],
    narratives: { win: '侧翼包抄成功，敌军腹背受敌', lose: '迂回失败，兵力分散' },
  },
  // 气势型
  {
    id: 'str-warcry', name: '擂鼓助威',
    basePower: 1.05,
    personalityWeights: { energy: 0.8, sociability: 0.4 },
    abilityDependency: 'diplomacy',
    phases: ['deploy', 'clash'],
    narratives: { win: '战鼓震天，我军士气大振', lose: '鼓声未能提振士气' },
  },
  {
    id: 'str-decisive-strike', name: '破釜沉舟',
    basePower: 1.35,
    personalityWeights: { boldness: 0.9, vengefulness: 0.5 },
    abilityDependency: 'military',
    phases: ['decisive'],
    narratives: { win: '背水一战，敌军崩溃', lose: '孤注一掷失败，全军动摇' },
  },
  {
    id: 'str-archer-volley', name: '万箭齐发',
    basePower: 1.2,
    personalityWeights: { rationality: 0.6, compassion: -0.3 },
    abilityDependency: 'strategy',
    phases: ['deploy', 'clash'],
    unitTypeRequirement: { type: 'archer', minCount: 2 },
    narratives: { win: '箭如雨下，敌军伤亡惨重', lose: '箭矢射尽，未能重创敌军' },
  },
];

export const strategyMap = new Map<string, StrategyDef>();
for (const s of ALL_STRATEGIES) strategyMap.set(s.id, s);

// ── 追击阶段固定策略 ──

export const PURSUIT_STRATEGIES: PursuitStrategyDef[] = [
  // 胜方
  { id: 'pursuit-chase', name: '纵兵追杀', side: 'winner', damageMultiplier: 1.5, selfDamageMultiplier: 0.1, narrative: '纵兵追杀，敌军尸横遍野' },
  { id: 'pursuit-restrain', name: '穷寇勿追', side: 'winner', damageMultiplier: 0.5, selfDamageMultiplier: 0.0, narrative: '收兵止战，敌军溃退' },
  // 败方
  { id: 'pursuit-flee', name: '拼命逃窜', side: 'loser', damageMultiplier: 0.0, selfDamageMultiplier: 0.0, narrative: '残兵败将仓皇而逃' },
  { id: 'pursuit-counter', name: '反戈一击', side: 'loser', damageMultiplier: 0.8, selfDamageMultiplier: 0.5, narrative: '败军回头反击' },
];

export const pursuitStrategyMap = new Map<string, PursuitStrategyDef>();
for (const s of PURSUIT_STRATEGIES) pursuitStrategyMap.set(s.id, s);
