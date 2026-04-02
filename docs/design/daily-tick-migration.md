# 月结改日结 — 实现方案

## Context

当前游戏以月为最小时间单位推进，所有 9 个系统每月执行一次。这导致：
1. 玩家月初操作而 NPC 等月结，体验不自然
2. 战争行军/围城/战斗粒度太粗（一月一格）
3. 无法支持未来的谋略/事件系统（需要日级触发）

目标：时钟改为按日推进（现实平年日历，365天/年），各系统按自身节律触发。**仅战争系统改为日结，其余系统保持月结——数值无需重新校准。**

---

## 核心设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 日历 | 现实平年日历（1月31天、2月28天…12月31天，全年365天） | 更贴近真实历史感，日期天数与现实一致 |
| 哪些系统日结 | 仅 warSystem | 其余系统月频足够，改日结性价比极低 |
| 月结系统数值 | **不变** | 仍然每月触发一次，所有 /月 的数值保持原样 |
| 行军速度 | 使用已有 `marchSpeed`（州/天）| types.ts 已定义但未使用，0.8~1.5 |
| NPC Engine | 保持月结 | 计算量大，且决策粒度无需日级 |

---

## Step 1：基础设施（纯类型+工具，零行为变化）

### 1a. 扩展 GameDate

**`src/engine/types.ts`**：`GameDate` 加 `day: number`（1~28/30/31，取决于月份）

### 1b. 新建日期工具模块

**新文件 `src/engine/dateUtils.ts`**：
```ts
/** 每月天数表（平年，无闰年） */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DAYS_PER_YEAR = 365;

function getDaysInMonth(month: number): number  // month: 1-12
toAbsoluteDay(d) / fromAbsoluteDay(n)
addDays(d, n) / diffDays(a, b) / diffMonths(a, b)
isFirstOfMonth(d) / isFirstOfYear(d)
compareDates(a, b) / isDateReached(current, target)
```

`toAbsoluteDay` 核心：`(year - 1) * 365 + 月份前缀和[month-1] + (day - 1)`
`fromAbsoluteDay` 反向：先除 365 得年，余数查表定月日。

### 1c. 修复所有 GameDate 字面量（加 `day: 1`）

受影响文件（所有构造 `{ year, month }` 的地方）：
- `TurnManager.ts` — 初始日期、系统事件日期
- `characterSystem.ts` — appointedDate、死亡事件
- `warSystem.ts` — 战斗/围城事件
- `reviewBehavior.ts` — 考课基线日期
- `appointAction.ts` / `dismissAction.ts` — appointedDate
- `NpcContext.ts` — 快照日期
- `campaignAction.ts` — 通过 WarStore 创建战争

### 1d. 替换所有手写日期算术为 dateUtils

| 位置 | 当前 | 替换为 |
|---|---|---|
| `reviewSystem.ts:14` | `(to.year-from.year)*12+(to.month-from.month)` | `diffMonths` |
| `selectionCalc.ts:189` | 同上模式 | `diffMonths` |
| `warSystem.ts:500` | 同上模式 | `diffMonths` |
| `AlertBar.tsx:62` | 同上模式 | `diffMonths` |
| `negotiateWarBehavior.ts:38` | 同上模式 | `diffMonths` |
| `MilitaryPanel.tsx:778` | 同上模式 | `diffMonths` |
| `NpcStore.ts:49-51` | 手动年/月比较 | `isDateReached` |

**验证点：** `tsc --noEmit` 通过，`npx vitest run` 全绿，游戏行为完全不变（day 始终为 1）。

---

## Step 2：TurnManager 日结机制

**`src/engine/TurnManager.ts`**：

- 新增 `dailyCallbacks` 注册表（与现有 `monthlyCallbacks` 并列）
- 新增 `advanceDay()`：
  1. `nextDate = addDays(currentDate, 1)`
  2. 更新 `currentDate`
  3. 触发所有 `dailyCallbacks`
  4. 若 `nextDate.day === 1`（跨月）：创建月结算事件 + 触发 `monthlyCallbacks` + 检查归档
- 保留 `advanceMonth()` 加 `@deprecated` 注释（内部循环调用 `getDaysInMonth(month)` 次 `advanceDay()`），仅供测试使用
- 新增 `advanceToNextMonth()`：循环 `advanceDay()` 直到跨月，供 UI "下月" 按钮使用
- 新增 `registerDailyCallback` / `unregisterDailyCallback`

**`src/App.tsx`**：
```ts
registerDailyCallback('daily-settlement', runDailySettlement);
registerMonthlyCallback('monthly-settlement', runMonthlySettlement);
```

**验证点：** 点击"结束回合"（仍调用 `advanceMonth`）= 该月天数次日结 + 1 次月结，行为与改造前一致。

---

## Step 3：结算管线拆分

**`src/engine/settlement.ts`** 拆为两个函数：

```ts
// 每日执行
export function runDailySettlement(date: GameDate): void {
  runWarSystem(date);
}

// 每月初执行（day===1 时由 TurnManager 触发）
export function runMonthlySettlement(date: GameDate): void {
  runCharacterSystem(date);   // 1. 健康/死亡
  runNpcEngine(date);         // 2. NPC 决策
  runPopulationSystem(date);  // 3. 年度人口
  runSocialSystem(date);      // 4. 社交
  runEconomySystem(date);     // 5. 经济
  runMilitarySystem(date);    // 6. 军事（士气/征兵/兵变）
  runEraSystem(date);         // 7. 时代
  runBuildingSystem(date);    // 8. 建筑
}
```

**注意**：warSystem 从月结管线移出，改为日结管线。月结管线内部顺序不变（除了少了 warSystem）。

---

## Step 4：战争系统日结化（最大改动）

### 4a. 行军：使用已有 marchSpeed

**`src/engine/military/types.ts`**：Campaign 新增 `marchProgress: number`（0.0~1.0 累积器）

**`warSystem.ts`** 行军逻辑（当前 L122-152）改为：
```ts
// 每日：
const speed = getCampaignMarchSpeed(campaign, armies, battalions); // min(各营 marchSpeed)
campaign.marchProgress += speed / 10;  // marchSpeed=1.0 → 10天一格
while (marchProgress >= 1.0) {
  推进一格;
  marchProgress -= 1.0;
}
```

行军速度数据（已有 `marchSpeed` 字段，单位"州/天"）：
- 牙兵: 0.8 → 12.5天/格
- 镇兵: 1.2 → 8.3天/格  
- 弓手: 1.0 → 10天/格
- 骑兵: 1.5 → 6.7天/格
- 团结兵: 1.0 → 10天/格

> 直接用 `marchSpeed / 10` 作为日推进量，即 marchSpeed=1.0 的部队 10 天走一格。一个月（28~31天）可推进约 3 格，比原来 1 格/月快，但兵种速度差异更明显。

**`src/engine/military/militaryCalc.ts`** 已有 `getCampaignMarchSpeed` 函数取各营最低 marchSpeed，直接复用。

### 4b. 集结时间：月→天

**`src/engine/military/marchCalc.ts`** `getMusteringTime()`：
- 同道: 0 → 0 天
- 同国: 1 → 10 天
- 不同国: 2 → 20 天

下游 `campaignAction.ts` 使用返回值设置 `turnsLeft` / `musteringTurnsLeft`，自动变为天数。

### 4c. 赶赴中军队 turnsLeft

`IncomingArmy.turnsLeft` 语义从"回合"变为"天"，warSystem 每日 -1（原代码 L49 不变）。

### 4d. 围城进度：日结

```ts
const dim = getDaysInMonth(date.month);
const monthlyProgress = siegeCalc.calcMonthlyProgress(...);
const dailyProgress = monthlyProgress / dim;
siege.progress += dailyProgress;
```

`siegeCalc.ts` 本身不改，调用方除以当月天数。保留 `calcMonthlyProgress` 可用于 UI tooltip 显示"围城速度 X%/月"。

### 4e. 守军损耗：日结

```ts
const dim = getDaysInMonth(date.month);
const monthlyRate = siegeCalc.calcDefenderAttritionRate(...);
siegeCalc.applyDefenderAttrition(..., monthlyRate / dim, ...);
```

### 4f. 防守方分数累积：日结

当前 -2/月 → 改为 -2/dim/天，缓冲期从 2 月 → 60 天：
```ts
const dim = getDaysInMonth(date.month);
const warDays = diffDays(war.startDate, date);
if (!hasProgress && warDays >= 60) {
  warScore -= 2 / dim;
}
```

### 4g. 事件 ID 唯一性

日结后同一位置同月可能多次战斗，事件 ID 加 day：
- `battle-${y}-${m}-${d}-${locationId}` 
- `siege-fall-${y}-${m}-${d}-${territoryId}`
- `mutiny-${y}-${m}-${d}-${batId}`（militarySystem 仍月结，但为安全起见一并改）

---

## Step 5：UI 改造

### 5a. 日期显示

**`TimeControl.tsx`** `formatChineseDate`：追加天的中文：
```
初一 初二 … 初十 十一 … 二十 廿一 … 三十 三十一
```
（2月只到廿八，各月上限不同——用 `getDaysInMonth` 校验即可）

显示："大唐 咸通八年 正月初一"

### 5b. 时间控制 UI

替换单一"结束回合"按钮为：
- **"下一日"** 按钮 → `advanceDay()`
- **"下月"** 按钮 → `advanceToNextMonth()`（循环推进到下月初一）
- **速度控制**（使用已有 `GameSpeed` 枚举）：暂停 / 正常 / 快速 / 极速
- **自动推进**：`useEffect` + `setInterval`，按速度档位控制间隔
  - Normal: 500ms/天（2天/秒）
  - Fast: 200ms/天（5天/秒）
  - VeryFast: 50ms/天（20天/秒）

### 5c. AlertBar 事件窗口

`AlertBar.tsx`：3 个月窗口 → 90 天窗口，用 `diffDays`。

### 5d. 军事面板文字更新

- 集结倒计时："集结中 剩余X日"
- 赶赴倒计时："赶赴中 剩余X日"  
- 战争时长：保持月显示（`diffMonths`）

---

## 不改的东西（明确列出）

| 系统 | 频率 | 数值 | 理由 |
|---|---|---|---|
| characterSystem | 月结 | 不变 | 健康/压力月频足够 |
| NpcEngine | 月结 | 不变 | 计算量大，月频合理 |
| populationSystem | 年结 | 不变 | 仍只在 month===1 触发（月结管线中，day 必为 1） |
| socialSystem | 月结 | 不变 | 好感/正统/贤能月频足够 |
| economySystem | 月结 | 不变 | 月俸月结是自然语义 |
| militarySystem | 月结 | 不变 | 士气(-0.5~-2.5/月)、征兵(cap/12/月)保持 |
| eraSystem | 月结 | 不变 | +1/12/月 保持 |
| buildingSystem | 月结 | 不变 | remainingMonths-1 保持 |

---

## 性能估算

| 场景 | 耗时 |
|---|---|
| 日结 tick（仅 warSystem） | ~2-3ms（迭代 <10 行营 + <5 围城） |
| 月结 tick（day===1） | ~50ms（当前水平） |
| 一个游戏月总耗时（以 30 天月为例） | 29×3 + 53 ≈ 140ms（当前 50ms，约 2.8x） |
| VeryFast 20天/秒 | 60ms/s 游戏逻辑，远低于 16ms/帧预算 |

---

## 实施顺序与验证

| Step | 内容 | 验证 |
|---|---|---|
| 1 | GameDate+dateUtils+修复字面量 | tsc 通过、vitest 全绿、游戏不变 |
| 2 | TurnManager advanceDay | "结束回合"=该月天数次日结+1次月结，行为不变 |
| 3 | settlement 拆分 daily/monthly | warSystem 日结但因 advanceMonth 每月调N次，总效果接近 |
| 4 | 战争系统日结化 | 行军用 marchSpeed、集结/围城/分数按天计 |
| 5 | UI（日期显示+速度控制） | 玩家可逐日推进或自动快进 |

每一步完成后都应该能 `npx vitest run` 全绿 + 手动测试游戏运行正常。

---

## 关键文件清单

**必改：**
- `src/engine/types.ts` — GameDate 加 day
- `src/engine/dateUtils.ts` — **新建**
- `src/engine/TurnManager.ts` — advanceDay + dailyCallbacks
- `src/engine/settlement.ts` — 拆分 daily/monthly
- `src/engine/systems/warSystem.ts` — 日结化（最大改动）
- `src/engine/military/types.ts` — Campaign 加 marchProgress
- `src/engine/military/marchCalc.ts` — getMusteringTime 返回天数
- `src/App.tsx` — 注册 daily+monthly 回调
- `src/ui/components/TimeControl.tsx` — 日显示+速度控制

**跟随修复（加 day 字段 + 用 dateUtils）：**
- `src/engine/systems/characterSystem.ts`
- `src/engine/systems/reviewSystem.ts`
- `src/engine/npc/NpcContext.ts`
- `src/engine/npc/NpcStore.ts`
- `src/engine/npc/behaviors/reviewBehavior.ts`
- `src/engine/npc/behaviors/negotiateWarBehavior.ts`
- `src/engine/interaction/appointAction.ts`
- `src/engine/interaction/dismissAction.ts`
- `src/engine/interaction/campaignAction.ts`
- `src/engine/official/selectionCalc.ts`
- `src/ui/components/AlertBar.tsx`
- `src/ui/components/MilitaryPanel.tsx`
- `src/ui/components/BottomBar.tsx`
- `src/ui/components/BattleDetailModal.tsx`
- `src/ui/components/TransferPlanFlow.tsx`
- `src/ui/components/ReviewPlanFlow.tsx`
- `src/ui/components/DeclareWarFlow.tsx`
