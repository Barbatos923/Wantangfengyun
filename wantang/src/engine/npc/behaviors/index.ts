// ===== NPC 行为注册表 =====

import type { NpcBehavior } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const behaviorRegistry: NpcBehavior<any>[] = [];

/** 注册一个 NPC 行为 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerBehavior(behavior: NpcBehavior<any>): void {
  behaviorRegistry.push(behavior);
}

/** 获取所有已注册的行为 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllBehaviors(): NpcBehavior<any>[] {
  return behaviorRegistry;
}
