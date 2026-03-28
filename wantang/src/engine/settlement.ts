// ===== 月结算调度器 =====

import type { GameDate } from './types.ts';
import {
  runCharacterSystem,
  runPopulationSystem,
  runSocialSystem,
  runEconomySystem,
  runMilitarySystem,
  runWarSystem,
  runBuildingSystem,
} from './systems/index.ts';
import { runNpcEngine } from './npc/NpcEngine.ts';
import { runReview } from './npc/behaviors/reviewBehavior.ts';

const systems: Array<(date: GameDate) => void> = [
  runCharacterSystem,    // 1. 健康/死亡/压力/成长（必须最先：死亡影响后续所有系统）
  runNpcEngine,          // 2. NPC 决策（铨选拟案等）
  runPopulationSystem,   // 3. 年度人口变化
  runSocialSystem,       // 4. 好感度衰减/领地漂移/贤能/晋升
  runEconomySystem,      // 5. 经济结算/破产检查
  runMilitarySystem,     // 6. 征兵池/士气训练/兵变
  runWarSystem,          // 7. 行营推进/战斗/围城/战争分数
  runBuildingSystem,     // 8. 建筑施工
];

/**
 * 执行月结算。在 TurnManager.advanceMonth() 回调中调用。
 */
export function runMonthlySettlement(date: GameDate): void {
  for (const system of systems) {
    system(date);
  }

  // 三年一考：每三年正月触发
  if (date.month === 1 && date.year % 3 === 0) {
    runReview(date);
  }
}
