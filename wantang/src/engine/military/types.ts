// ===== 军事系统类型定义 =====

/** 兵种 */
export type UnitType = 'heavyInfantry' | 'lightInfantry' | 'heavyCavalry' | 'lightCavalry' | 'archer';

/** 兵种多维属性定义 */
export interface UnitTypeDef {
  id: UnitType;
  name: string;
  charge: number;         // 冲击
  breach: number;         // 攻坚
  pursuit: number;        // 追击
  siege: number;          // 攻城
  marchSpeed: number;     // 行军速度（州/天）
  grainCostPerThousand: number;  // 每千人每月粮耗
}

/** 营（最小军事单位，固定1000人编制） */
export interface Battalion {
  id: string;
  name: string;
  unitType: UnitType;
  currentStrength: number; // 当前兵力 0-1000
  homeTerritory: string;   // 籍贯（招募所在州ID）
  locationId: string;      // 当前所在州
  morale: number;          // 士气 0-100
  elite: number;           // 精锐度 0-100
  armyId: string;          // 所属军ID
}

/** 军（玩家管理单位） */
export interface Army {
  id: string;
  name: string;
  postId: string | null;      // 绑定岗位ID（头衔兵），null = 私兵/无主
  ownerId: string;            // 所属角色（缓存，由 postId→Post.holderId 派生）
  commanderId: string | null; // 兵马使（将领ID）
  locationId: string;         // 驻扎地（州ID）
  battalionIds: string[];     // 下辖营ID列表
}

/** 营的最大编制人数 */
export const MAX_BATTALION_STRENGTH = 1000;

// ===== Phase 3b: 战争系统类型 =====

import type { Era } from '@engine/types';
import type { Territory } from '@engine/territory/types';
import type { Character } from '@engine/character/types';

/** 战争理由 */
export type CasusBelli =
  | 'annexation'
  | 'deJureClaim'
  | 'personalClaim'
  | 'pushingClaim'
  | 'imperialOrder'
  | 'forgedMandate'
  | 'independence'
  | 'expansion';

/** 战争理由名称映射 */
export const CASUS_BELLI_NAMES: Record<CasusBelli, string> = {
  annexation: '武力兼并',
  deJureClaim: '法理宣称',
  personalClaim: '个人宣称',
  pushingClaim: '为他人宣称',
  imperialOrder: '奉召讨逆',
  forgedMandate: '矫诏征伐',
  independence: '独立',
  expansion: '开疆拓土',
};

/** 宣战判定上下文 */
export interface WarContext {
  attackerId: string;
  defenderId: string;
  era: Era;
  territories: Map<string, Territory>;
  characters: Map<string, Character>;
  hasTruce?: boolean; // 双方是否处于停战期
  hasAlliance?: boolean; // 双方是否处于同盟（背盟宣战会额外惩罚）
}

/** 单条宣战理由的判定结果 */
export interface CasusBelliEval {
  id: CasusBelli;
  name: string;
  failureReason: string | null; // null = 可用
  cost: { prestige: number; legitimacy: number };
  trucePenalty?: { prestige: number; legitimacy: number }; // 停战期额外惩罚（仅当 hasTruce 时存在）
  allianceBetrayal?: { prestige: number; legitimacy: number }; // 背盟额外惩罚（仅当 hasAlliance 时存在）
}

/** 战争 */
export interface War {
  id: string;
  attackerId: string;
  defenderId: string;
  attackerParticipants: string[]; // 攻方参战者（不含 attackerId 本身）
  defenderParticipants: string[]; // 守方参战者（不含 defenderId 本身）
  casusBelli: CasusBelli;
  targetTerritoryIds: string[];
  warScore: number; // -100~+100，正=攻方优势，负=防方优势
  startDate: { year: number; month: number; day: number };
  status: 'active' | 'ended';
  result?: 'attackerWin' | 'defenderWin' | 'whitePeace';
  previousOverlordId?: string; // 独立战争：攻方宣战前的领主，败北时恢复
  summonCooldowns?: Record<string, number>; // charId → absoluteDay，召集参战冷却（30天内不重复）
}

/** 停战协议 */
export interface Truce {
  id: string;
  partyA: string; // 角色 ID
  partyB: string; // 角色 ID
  expiryDay: number; // 到期的绝对天数
}

/** 停战期：2 年 */
export const TRUCE_DURATION_DAYS = 730;
/** 违反停战额外惩罚 */
export const TRUCE_PENALTY = { prestige: -30, legitimacy: -20 };

/** 同盟（双向、有期限的强约束契约） */
export interface Alliance {
  id: string;
  partyA: string;       // 角色 ID
  partyB: string;       // 角色 ID
  startDay: number;     // 缔结日（绝对天）
  expiryDay: number;    // 到期日（绝对天）
}

/** 同盟期限：3 年 */
export const ALLIANCE_DURATION_DAYS = 1095;
/** 每人同盟数量上限 */
export const MAX_ALLIANCES_PER_RULER = 2;
/** 背盟惩罚（向盟友宣战 / 拒绝履约自动参战） */
export const ALLIANCE_BETRAYAL_PENALTY = { prestige: -120, legitimacy: -80 };
/** 背盟好感惩罚（双向，一次性 decayable 事件） */
export const ALLIANCE_BETRAYAL_OPINION = -100;
/** 主动解盟（合法解约）的资源代价 */
export const ALLIANCE_BREAK_PRESTIGE_COST = -40;
/** 同盟提议被拒绝后的冷却 */
export const ALLIANCE_PROPOSAL_REJECT_CD_DAYS = 365;
/** 同盟最低存续期（缔结后多少天才允许 NPC 主动解盟，给个"试用期"） */
export const ALLIANCE_MIN_AGE_BEFORE_NPC_BREAK_DAYS = 365;

/** 正在赶赴行营的军队 */
export interface IncomingArmy {
  armyId: string;
  turnsLeft: number; // 剩余回合数，0=到达
}

/** 阶段策略预设 */
export interface PhaseStrategies {
  deploy?: string;   // 策略ID
  clash?: string;
  decisive?: string;
  pursuit?: string;  // 追击策略ID
}

/** 行营 */
export interface Campaign {
  id: string;
  warId: string;
  ownerId: string;
  commanderId: string;
  armyIds: string[];
  incomingArmies: IncomingArmy[];
  locationId: string;
  targetId: string | null;
  route: string[];
  routeProgress: number;
  marchProgress: number; // 0.0~1.0 日行军累积器
  status: 'marching' | 'idle' | 'sieging';
  phaseStrategies: PhaseStrategies; // 玩家预设的阶段策略
}

/** 和谈提议意愿上下文（提议方视角） */
export interface PeaceProposalContext {
  /** 提议方视角的战争分数（正=我方优势，负=我方劣势） */
  myScore: number;
  warDurationMonths: number;
  personality: { compassion: number; boldness: number; rationality: number };
  money: number;
  /** 月收入（负=赤字） */
  monthlyIncome: number;
}

/** 和谈接受判定上下文（被提议方视角） */
export interface PeaceAcceptanceContext {
  /** 提议方视角的战争分数（正=提议方优势，负=被提议方优势） */
  proposerScore: number;
  warDurationMonths: number;
  /** 被提议方性格 */
  targetPersonality: { compassion: number; boldness: number; honor: number; greed: number };
}

/** 和谈判定结果 */
export interface PeaceResult {
  accept: boolean;
  score: number;
  threshold: number;
  breakdown: Record<string, number>;
}

/** 围城 */
export interface Siege {
  id: string;
  warId: string;
  campaignId: string;
  territoryId: string;
  progress: number;
  startDate: { year: number; month: number; day: number };
}
