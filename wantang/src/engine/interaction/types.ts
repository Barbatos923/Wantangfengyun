// ===== 交互系统类型定义 =====

import type { Character } from '@engine/character/types';

/** 交互参数类型 */
export type InteractionParamType = 'none' | 'appoint' | 'dismiss' | 'centralization' | 'declareWar' | 'transferVassal' | 'revoke';

/** 交互定义 */
export interface Interaction {
  id: string;
  name: string;
  icon: string;
  /** 粗筛：该交互对 player→target 是否可见 */
  canShow: (player: Character, target: Character) => boolean;
  /** 是否需要额外参数选择 */
  paramType: InteractionParamType;
}
