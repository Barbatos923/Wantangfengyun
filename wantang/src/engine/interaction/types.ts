// ===== 交互系统类型定义 =====

import type { Character } from '@engine/character/types';

/** 交互参数类型 */
export type InteractionParamType = 'none' | 'appoint' | 'dismiss' | 'centralization' | 'declareWar' | 'transferVassal' | 'revoke' | 'joinWar' | 'callToArms' | 'usurpPost' | 'reassign' | 'demandRights' | 'negotiateTax' | 'scheme';

/** 交互定义 */
export interface Interaction {
  id: string;
  name: string;
  icon: string;
  /** 粗筛：该交互是否出现在菜单中（隐藏 = 完全不相关） */
  canShow: (player: Character, target: Character) => boolean;
  /** 细筛：返回 null 表示可执行，返回字符串表示不可执行的原因（灰显） */
  canExecuteCheck?: (player: Character, target: Character) => string | null;
  /** 是否需要额外参数选择 */
  paramType: InteractionParamType;
}

/** 交互菜单条目（含灰显原因） */
export interface InteractionEntry {
  interaction: Interaction;
  /** null = 可执行；非 null = 灰显并显示原因 */
  disabledReason: string | null;
}
