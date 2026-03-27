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

const systems: Array<(date: GameDate) => void> = [
  runCharacterSystem,    // 1. 健康/死亡/压力/成长（必须最先：死亡影响后续所有系统）
  runPopulationSystem,   // 2. 年度人口变化
  runSocialSystem,       // 3. 好感度衰减/领地漂移/贤能/晋升
  runEconomySystem,      // 4. 经济结算/破产检查
  runMilitarySystem,     // 5. 征兵池/士气训练/兵变
  runWarSystem,          // 6. 行营推进/战斗/围城/战争分数
  runBuildingSystem,     // 7. 建筑施工
];

/**
 * 执行月结算。在 TurnManager.advanceMonth() 回调中调用。
 */
export function runMonthlySettlement(date: GameDate): void {
  for (const system of systems) {
    system(date);
  }
}
