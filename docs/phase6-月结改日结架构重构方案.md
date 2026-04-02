# 月结改日结架构重构方案（CK3 模式）

**设计日期**：2026-04-02
**设计目标**：将《晚唐风云》的底层时间驱动机制从"月结"重构为"日结"（CK3 模式），以支持更细腻的战争、谋略和事件系统，同时最小化对现有经济、人口等系统的破坏。

## 一、核心设计理念：时间粒度与系统节律解耦

CK3 的"日结"模式并非每天全量运行所有系统，而是：
**时钟以天为单位推进，但各系统按各自的节律（日/月/年/特定周期）触发。**

本次重构的核心目标是**扩展时钟粒度**，而非**改变所有系统的业务逻辑**。绝大多数带有 `Monthly` 语义的系统（如经济结算、士气衰减、建筑进度）将保持原样，只需在调度层控制它们仅在"月末"触发即可。

## 二、重构范围与阶段划分

为了控制风险，重构分为两个阶段：

*   **第一阶段（当前目标）**：底层时钟扩展为日结，UI 适配，**仅将战争行军系统改为日结**，其余所有系统保持月末结算。
*   **第二阶段（未来按需）**：逐步将围城、NPC 决策、特定事件等系统改为日结或自定义周期触发。

## 三、第一阶段详细实施方案

### 1. 扩展 `GameDate` 数据结构

修改 `engine/types.ts`，为 `GameDate` 增加 `day` 字段。

```typescript
export interface GameDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-30（为简化历法，统一每月 30 天）
}
```

**影响面**：全项目所有使用 `GameDate` 的地方都会报错，需要进行全量修复（初始化时补充 `day: 1`）。

### 2. 重构 `TurnManager` 调度器

修改 `engine/TurnManager.ts`，将 `advanceMonth` 替换为 `advanceDay`，并引入分层调度逻辑。

```typescript
// TurnManager.ts 核心逻辑示意
advanceDay: () => {
  const { currentDate } = get();
  let nextDay = currentDate.day + 1;
  let nextMonth = currentDate.month;
  let nextYear = currentDate.year;

  let isMonthEnd = false;
  let isYearEnd = false;

  if (nextDay > 30) {
    nextDay = 1;
    isMonthEnd = true;
    nextMonth++;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
      isYearEnd = true;
    }
  }

  const nextDate = { year: nextYear, month: nextMonth, day: nextDay };
  set({ currentDate: nextDate });

  // 1. 每日触发：战争行军
  runDailySettlement(nextDate);

  // 2. 月末触发：原有的大部分系统
  if (isMonthEnd) {
    runMonthlySettlement(nextDate);
    // 触发月度事件记录、归档等
  }

  // 3. 年末触发：人口等（如果之前是绑在 1 月，可调整或保持）
  if (isYearEnd) {
    runYearlySettlement(nextDate);
  }
}
```

### 3. 战争系统（`warSystem.ts`）的日结改造

这是第一阶段唯一需要修改业务逻辑的系统。

*   **行军进度**：将行营的 `routeProgress` 从"每月一格"改为"每日推进"。可以引入一个 `marchProgress`（0-100）字段，每天根据军队速度增加，满 100 时 `routeProgress + 1`。
*   **战斗检测**：每天检查同一州内的敌对行营，触发战斗。
*   **围城**：第一阶段可保持月结（在 `runMonthlySettlement` 中处理），或者改为日结（每天增加少量进度）。建议第一阶段保持月结以降低复杂度。

### 4. UI 层全面适配

*   **`TimeControl.tsx`**：
    *   将"结束回合"按钮改为"播放/暂停"按钮。
    *   实现基于 `setInterval` 的自动走时逻辑，受 `GameSpeed` 控制（例如 Normal 速度下每 1 秒走 1 天，Fast 每 0.5 秒走 1 天）。
    *   日期显示格式更新为 `大唐 XX年 X月 X日`。
*   **`AlertBar.tsx`**：
    *   修改 `monthsDiff` 的计算逻辑，或者引入 `daysBetween` 工具函数，确保"最近 3 个月"的判断在引入 `day` 字段后依然正确。
*   **其他面板**：
    *   所有显示"月收入"、"月消耗"的地方（如 `ResourceBar`、`MilitaryPanel`）**无需修改文案**，因为经济系统依然是按月结算的。

### 5. 修复冷却期与过期逻辑

项目中存在多处基于月份差值的计算，需要提供统一的工具函数，并替换现有的硬编码逻辑。

```typescript
// engine/utils/timeUtils.ts
export function daysBetween(from: GameDate, to: GameDate): number {
  const fromDays = from.year * 360 + (from.month - 1) * 30 + from.day;
  const toDays = to.year * 360 + (to.month - 1) * 30 + to.day;
  return toDays - fromDays;
}

export function monthsBetween(from: GameDate, to: GameDate): number {
  return Math.floor(daysBetween(from, to) / 30);
}
```

*   **`selectionCalc.ts`**：`COOLDOWN_MONTHS = 36` 的计算改用 `monthsBetween`。
*   **`NpcStore.ts`**：`getExpiredTasks` 的判断逻辑需要加入 `day` 的比较，或者直接使用 `daysBetween(currentDate, deadline) > 0`。

## 四、第二阶段展望（未来规划）

在第一阶段稳定运行后，可以逐步将更多系统解耦到更细的粒度：

1.  **NPC 决策打散**：目前所有 NPC 在每月末集中进行决策，容易造成性能尖峰。未来可以为每个 NPC 分配一个随机的 `decisionOffset`（1-30），让他们在每月的不同日子进行决策。
2.  **围城日结**：将围城进度改为每日增加，使战争反馈更平滑。
3.  **事件系统**：支持精确到某天的定时事件和随机事件触发。

## 五、风险提示

1.  **存档兼容性**：`GameDate` 结构的改变会导致旧存档无法读取。由于目前尚未实现读档 UI，此风险可控，但需注意清理本地 IndexedDB 数据。
2.  **性能问题**：自动走时（`setInterval`）可能会引发频繁的 React 渲染。需要确保 `TurnManager` 的状态更新粒度合适，避免不相关的组件（如百官图）在每天 tick 时重新渲染。建议使用 Zustand 的 selector 进行精确订阅。
