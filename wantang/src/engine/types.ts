// ===== 核心类型定义 =====

/** 游戏日期（现实平年日历，无闰年） */
export interface GameDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-28/30/31（取决于月份）
}

/** 游戏速度 */
export enum GameSpeed {
  Paused = 0,
  Normal = 1,
  Fast = 2,
  VeryFast = 3,
}

/** 时代状态 */
export enum Era {
  ZhiShi = '治世',
  WeiShi = '危世',
  LuanShi = '乱世',
}

/** 资源类型 */
export enum ResourceType {
  Money = 'money',
  Grain = 'grain',
  Prestige = 'prestige',
  Legitimacy = 'legitimacy',
}

/** 资源集合 */
export interface Resources {
  money: number;
  grain: number;
  prestige: number;
  legitimacy: number;
}

/** 事件优先级 */
export enum EventPriority {
  Minor = 1,
  Normal = 2,
  Major = 3,
}

/** 游戏事件 */
export interface GameEvent {
  id: string;
  date: GameDate;
  type: string;
  actors: string[];
  territories: string[];
  description: string;
  priority: EventPriority;
  payload?: Record<string, unknown>;
}

/** 人物简要引用（Phase 0） */
export interface CharacterStub {
  id: string;
  name: string;
  title: string;
}

/** 领地简要引用（Phase 0） */
export interface TerritoryStub {
  id: string;
  name: string;
  type: 'zhou' | 'dao' | 'guo';
  controllerId: string;
}
