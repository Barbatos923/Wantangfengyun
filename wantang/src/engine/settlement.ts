// ===== 月结算调度器 =====

import type { GameDate } from './types.ts';
import {
  runCharacterSystem,
  runPopulationSystem,
  runSocialSystem,
  runEconomySystem,
  runMilitarySystem,
  runWarSystem,
  runEraSystem,
  runBuildingSystem,
} from './systems/index.ts';
import { runNpcEngine } from './npc/NpcEngine.ts';

const systems: Array<(date: GameDate) => void> = [
  runCharacterSystem,    // 1. 健康/死亡/压力/成长（必须最先：死亡影响后续所有系统）
  runNpcEngine,          // 2. NPC 决策（铨选拟案等）
  runPopulationSystem,   // 3. 年度人口变化
  runSocialSystem,       // 4. 好感度衰减/领地漂移/贤能/晋升
  runEconomySystem,      // 5. 经济结算/破产检查
  runMilitarySystem,     // 6. 征兵池/士气训练/兵变
  runWarSystem,          // 7. 行营推进/战斗/围城/战争分数
  runEraSystem,          // 8. 时代进度推进/时代切换
  runBuildingSystem,     // 9. 建筑施工
];

/**
 * 执行月结算。在 TurnManager.advanceMonth() 回调中调用。
 */
export function runMonthlySettlement(date: GameDate): void {
  for (const system of systems) {
    system(date);
  }
  // 考课改由 NpcEngine 的 reviewBehavior 统一驱动（CD: 三年一考正月）
}
