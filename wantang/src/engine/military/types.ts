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
  ownerId: string;          // 所属角色（统治者）
  commanderId: string | null;  // 兵马使（将领ID）
  locationId: string;       // 驻扎地（州ID）
  battalionIds: string[];   // 下辖营ID列表
}

/** 营的最大编制人数 */
export const MAX_BATTALION_STRENGTH = 1000;

// ===== Phase 3b: 战争系统类型 =====

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

/** 战争 */
export interface War {
  id: string;
  attackerId: string;
  defenderId: string;
  casusBelli: CasusBelli;
  targetTerritoryIds: string[];
  attackerWarScore: number;
  defenderWarScore: number;
  startDate: { year: number; month: number };
  status: 'active' | 'ended';
  result?: 'attackerWin' | 'defenderWin' | 'whitePeace';
}

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
  status: 'mustering' | 'marching' | 'idle' | 'sieging';
  musteringTurnsLeft: number;
  phaseStrategies: PhaseStrategies; // 玩家预设的阶段策略
}

/** 围城 */
export interface Siege {
  id: string;
  warId: string;
  campaignId: string;
  territoryId: string;
  progress: number;
  startDate: { year: number; month: number };
}
