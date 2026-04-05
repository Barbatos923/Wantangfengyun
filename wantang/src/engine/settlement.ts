// ===== 结算调度器（日结 + 月结） =====

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
import { runDailyNpcEngine } from './npc/NpcEngine.ts';
import { useWarStore } from './military/WarStore.ts';
import { toAbsoluteDay } from './dateUtils.ts';

/**
 * 每日执行。由 TurnManager.advanceDay() 的 dailyCallback 触发。
 */
export function runDailySettlement(date: GameDate): void {
  runWarSystem(date);
  if (date.day !== 1) {
    runDailyNpcEngine(date);  // 非月初：日结中运行 NPC 决策
  }
}

/**
 * 每月初执行（day===1 时由 TurnManager 的 monthlyCallback 触发）。
 * 顺序严格：角色 → NPC → 人口 → 社交 → 经济 → 军事 → 时代 → 建筑。
 */
export function runMonthlySettlement(date: GameDate): void {
  useWarStore.getState().cleanExpiredTruces(toAbsoluteDay(date)); // 停���过���清理
  runCharacterSystem(date);   // 1. 健康/死亡/压力/成长（必须最先：死亡影响后续所有系统）
  runDailyNpcEngine(date);    // 2. NPC 决策（月初在 characterSystem 之后，保证继承先完成）
  runPopulationSystem(date);  // 3. 年度人口变化
  runSocialSystem(date);      // 4. 好感度衰减/领地漂移/贤能/晋升
  runEconomySystem(date);     // 5. 经济结算/破产检查
  runMilitarySystem(date);    // 6. 征兵池/士气训练/兵变
  runEraSystem(date);         // 7. 时代进度推进/时代切换
  runBuildingSystem(date);    // 8. 建筑施工
  // 考课改由 NpcEngine 的 reviewBehavior 统一驱动（CD: 三年一考正月）
}
