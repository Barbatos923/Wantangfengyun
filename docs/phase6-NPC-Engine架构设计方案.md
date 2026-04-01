# Phase 6: NPC Engine 架构设计方案

> 核心目标：构建一个能让世界"活"起来的底层驱动引擎，同时优雅地解决玩家在不同身份间切换时的介入体验问题。

---

## 一、设计哲学：双层分离架构

在《晚唐风云》中，玩家的角色会不断切换（皇帝、宰相、节度使等）。如果让玩家直接充当"上帝"去调用底层函数，会导致代码逻辑严重分化（"玩家逻辑" vs "NPC 逻辑"）。

因此，NPC Engine 的核心设计哲学是**双层分离**：

1. **底层：世界自动运转层（NPC Engine）**
   - 引擎完全不知道"玩家"的存在。
   - 引擎只负责根据规则，为每个有决策权的角色（Actor）生成"本月待处理事项"（Tasks）。
   - 引擎根据角色的身份（是 NPC 还是 Player），决定这些 Task 是自动执行，还是放入收件箱。

2. **表层：玩家决策窗口层（UI & 交互）**
   - 玩家扮演某个角色时，本质上就是接管了该角色的"收件箱"。
   - 玩家通过 UI 消费这些 Task，完成决策。
   - 玩家换角色，收件箱的内容自然改变，体验无缝切换。

---

## 二、核心数据结构

### 2.1 NpcContext（月结快照）

为了避免在 N×M 的决策循环中高频读取 Store 和重复计算，每月初构建一次全局快照，传给所有行为模块。

```typescript
interface NpcContext {
  date: GameDate;
  era: Era;
  characters: Map<string, Character>;
  territories: Map<string, Territory>;
  centralPosts: Post[];
  
  // 预计算缓存（O(1) 查询）
  personalityCache: Map<string, Personality>;
  expectedLegitimacyCache: Map<string, number>;
  
  // 好感度缓存：Map<observerId, Map<targetId, opinion>>
  // 建议：先做全量预计算，如果未来角色>300出现性能瓶颈，再改为按需懒加载缓存
  opinionCache: Map<string, Map<string, number>>;
}
```

### 2.2 PlayerTask（玩家待处理事项）

统一所有玩家介入点的数据结构，存入 `NpcStore`。

```typescript
interface PlayerTask {
  id: string;          // 唯一标识
  type: 'selection' | 'approval' | 'review' | 'declareWar' | 'keju'; // 任务类型
  actorId: string;     // 任务归属的角色 ID（即玩家当前扮演的角色）
  data: unknown;       // 任务专属数据（如：空缺岗位列表、草稿详情）
  deadline: GameDate;  // 截止日期（超时后 NPC Engine 自动兜底执行）
}

// NpcStore 新增字段
interface NpcStore {
  playerPendingTasks: PlayerTask[];
  addPlayerTasks: (tasks: PlayerTask[]) => void;
  completePlayerTask: (taskId: string) => void;
}
```

---

## 三、NPC 决策循环（核心管线）

`runNpcEngine` 是每月结算的入口，它的职责从"执行铨选"变为"任务分发器"。

### 3.1 引擎执行流程

1. **构建快照**：生成 `NpcContext`。
2. **清理过期任务**：检查 `playerPendingTasks`，超时的任务强制交由 NPC 逻辑兜底执行。
3. **收集决策者**：找出所有活着的、有官职的、或者有特殊权限（如辟署权）的角色。
4. **决策循环**：遍历每个决策者（Actor）：
   - 计算本月最大行动数：`maxActions = calcMaxActions(personality)`（0~3 次）。
   - 遍历所有注册的行为模块（`Behavior`），收集该 Actor 本月想做的所有 Task。
   - 如果 Actor 是 NPC：按权重（`weight`）排序，取前 `maxActions` 个 Task 自动执行。
   - 如果 Actor 是 Player：将收集到的 Task 写入 `playerPendingTasks`，等待玩家处理。

### 3.2 行为模块接口（Behavior Interface）

现有的 `interaction` 需要升级为 `Behavior`，每个行为模块必须实现以下接口：

```typescript
interface NpcBehavior<TData = unknown> {
  id: string;
  
  // 1. 生成任务（纯函数，无副作用）
  // 返回 null 表示本月不触发此行为
  generateTask: (actor: Character, context: NpcContext) => { data: TData; weight: number } | null;
  
  // 2. NPC 自动执行逻辑
  executeAsNpc: (actor: Character, data: TData, context: NpcContext) => void;
  
  // 3. 玩家超时兜底逻辑（可选，默认调用 executeAsNpc）
  executeFallback?: (actor: Character, data: TData, context: NpcContext) => void;
}
```

---

## 四、意愿权重公式（Weight）

NPC 决定是否做某件事，完全由 `weight` 决定。这是一个纯数据驱动的公式：

**`Weight = 基础权重 × 人格乘数 × 状态乘数 × 关系乘数`**

以"宣战（Declare War）"为例：
- **基础权重**：10（相对较低的基数）
- **人格乘数**：`1.0 + boldness * 0.5 + vengefulness * 0.3 - rationality * 0.2`
- **状态乘数**：如果兵力是目标的 2 倍 → `× 1.5`；如果国库亏空 → `× 0.1`
- **关系乘数**：如果对目标好感 < -50 → `× 2.0`

如果最终 `Weight <= 0`，则该行为本月不触发。

---

## 五、以"铨选系统"为例的重构推演

按照新架构，现有的铨选系统将发生以下变化：

### 1. 行为模块拆分（`appointBehavior.ts`）

- **`generateTask`**：调用现有的 `getPendingVacancies`，如果列表不为空，返回 `{ data: vacancies, weight: 100 }`（铨选是高优行政任务）。
- **`executeAsNpc`**：调用现有的 `planAppointments` 生成草稿。如果是皇帝，直接 `executeTransferPlan`；如果是臣子，生成一个 `approval` 类型的 Task 塞给皇帝。

### 2. 玩家体验流程

- **玩家是吏部尚书**：月结时，Engine 发现吏部尚书是玩家，于是把 `selection` Task 塞进 `playerPendingTasks`。玩家在 `AlertBar` 看到提示，点击打开 `SelectionFlow`，选完人后点击"呈报"，UI 调用 `completePlayerTask`，并生成一个 `approval` Task 塞给皇帝。
- **玩家是皇帝**：月结时，Engine 发现有臣子呈报的草稿，生成 `approval` Task 塞进 `playerPendingTasks`。玩家在 `AlertBar` 看到提示，点击打开 `TransferPlanFlow`，修改或批准，UI 直接调用 `executeTransferPlan`。

### 3. 解决"两条轨道割裂"问题

现有的 `AppointFlow`（玩家随时随地直接任命）应该被**废弃或改造**。
玩家想要主动任命某人，必须通过消费 `selection` Task 来完成。如果玩家觉得本月空缺没填满，可以主动消耗一次"行动点数"生成一个临时的 `selection` Task。这样，玩家的行为就完全纳入了引擎的规则框架内。

---

## 六、实施路径建议

这个架构改动较大，建议分三步走，保持系统始终可运行：

**Step 1：基础设施建设（不影响现有逻辑）**
- 实现 `NpcContext` 的构建逻辑（含好感度缓存）。
- 在 `NpcStore` 中引入 `playerPendingTasks` 队列。

**Step 2：行为模块接口升级**
- 定义 `NpcBehavior` 接口。
- 将现有的 `appointBehavior` 和 `reviewBehavior` 适配到新接口。
- 重写 `runNpcEngine`，实现"生成任务 → 路由（NPC执行/玩家进队列）"的管线。

**Step 3：UI 层对接与清理**
- 改造 `AlertBar`，使其纯粹读取 `playerPendingTasks`。
- 清理旧的 `draftPlan`、`playerDraftPostIds` 等专用状态。
- 补充任务超时兜底机制（Deadline）。

---

## 七、待确认的设计细节

在开始编码前，需要确认一个游戏节奏问题：**任务超时机制**。

如果玩家一直不处理收件箱里的任务，世界会怎样？
- **建议方案**：给每个 Task 设定 `deadline`（如 3 个月）。超过 3 个月玩家未处理，NPC Engine 会在下一次月结时，强制调用该行为的 `executeFallback`（通常等同于 NPC 自动执行逻辑）来兜底。
- **好处**：防止玩家"占着茅坑不拉屎"导致世界停转，同时给玩家一定的缓冲期。
