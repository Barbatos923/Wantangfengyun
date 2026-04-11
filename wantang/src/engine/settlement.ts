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
import { runSchemeSystem } from './scheme/schemeSystem.ts';
import { useWarStore } from './military/WarStore.ts';
import { useCharacterStore } from './character/CharacterStore.ts';
import { useStoryEventBus } from './storyEventBus.ts';
import { toAbsoluteDay } from './dateUtils.ts';
import { emitChronicleEvent } from './chronicle/emitChronicleEvent.ts';
import { EventPriority } from './types.ts';

/**
 * 每日执行。由 TurnManager.advanceDay() 的 dailyCallback 触发。
 */
export function runDailySettlement(date: GameDate): void {
  runWarSystem(date);
  if (date.day !== 1) {
    runSchemeSystem(date);    // 非月初：scheme 在 NPC 决策之前推进
    runDailyNpcEngine(date);  // 非月初：日结中运行 NPC 决策
  }
}

/**
 * 每月初执行（day===1 时由 TurnManager 的 monthlyCallback 触发）。
 * 顺序严格：角色 → NPC → 人口 → 社交 → 经济 → 军事 → 时代 → 建筑。
 */
export function runMonthlySettlement(date: GameDate): void {
  const today = toAbsoluteDay(date);
  useWarStore.getState().cleanExpiredTruces(today); // 停战过期清理
  // 同盟过期清理：返回过期列表用于 emit 史书事件 + 玩家通知
  const expiredAlliances = useWarStore.getState().cleanExpiredAlliances(today);
  if (expiredAlliances.length > 0) {
    const charStore = useCharacterStore.getState();
    const playerId = charStore.playerId;
    for (const al of expiredAlliances) {
      const aChar = charStore.characters.get(al.partyA);
      const bChar = charStore.characters.get(al.partyB);
      const aName = aChar?.name ?? '?';
      const bName = bChar?.name ?? '?';
      emitChronicleEvent({
        type: '同盟到期',
        actors: [al.partyA, al.partyB],
        territories: [],
        description: `${aName}与${bName}的盟约期满，自动解除`,
        priority: EventPriority.Normal,
      });
      // 玩家是其中一方 → 推送 StoryEvent 通知
      if (playerId && (al.partyA === playerId || al.partyB === playerId)) {
        const otherId = al.partyA === playerId ? al.partyB : al.partyA;
        const otherName = al.partyA === playerId ? bName : aName;
        useStoryEventBus.getState().pushStoryEvent({
          id: crypto.randomUUID(),
          title: '盟约期满',
          description: `你与${otherName}的盟约已到期，双方关系恢复中立。`,
          actors: [
            { characterId: playerId, role: '你' },
            { characterId: otherId, role: '原盟友' },
          ],
          options: [
            {
              label: '知悉',
              description: '盟约自然到期，无任何惩罚。',
              effects: [],
              effectKey: 'noop:notification',
              effectData: {},
              onSelect: () => {},
            },
          ],
        });
      }
    }
  }
  runCharacterSystem(date);   // 1. 健康/死亡/压力/成长（必须最先：死亡影响后续所有系统）
  runSchemeSystem(date);      // 1.5 scheme 推进：在 characterSystem 之后看到最新死亡/继承结果
  runDailyNpcEngine(date);    // 2. NPC 决策（月初在 characterSystem 之后，保证继承先完成）
  runPopulationSystem(date);  // 3. 年度人口变化
  runSocialSystem(date);      // 4. 好感度衰减/领地漂移/贤能/晋升
  runEconomySystem(date);     // 5. 经济结算/破产检查
  runMilitarySystem(date);    // 6. 征兵池/士气训练/兵变
  runEraSystem(date);         // 7. 时代进度推进/时代切换
  runBuildingSystem(date);    // 8. 建筑施工
  // 考课改由 NpcEngine 的 reviewBehavior 统一驱动（CD: 三年一考正月）
}
