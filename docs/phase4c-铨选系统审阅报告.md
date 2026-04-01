# 铨选系统重构代码审阅报告

> 审阅日期：2026-04-01 | 审阅范围：commit `c9579e5`（铨选系统重构部分）

---

## 总体评价

本次铨选系统的重构在**底层引擎（Engine）层面**做得非常出色。将复杂的权限判定、候选人生成逻辑抽离为纯函数（`selectionCalc.ts`），并通过 `selectionUtils.ts` 提供便捷包装，极大提升了代码的可测试性和模块化程度。NPC 行为（`appointBehavior.ts` 和 `reviewBehavior.ts`）对新架构的接入也很规范。

然而，在**UI 表现层（UI Components）**，特别是 `TransferPlanFlow.tsx` 和 `AlertBar.tsx` 中，存在严重的**逻辑重复**和**状态脱节**问题。UI 层没有完全信任并使用 Engine 层计算好的状态，而是自己重新实现了一套平行的规划逻辑。

以下按严重程度分级，列出需要关注的问题。

---

## 一、架构问题（高优先级）

### 1.1 `TransferPlanFlow.tsx` 存在平行的规划逻辑

**文件**：`ui/components/TransferPlanFlow.tsx`

**问题**：`TransferPlanFlow` 是皇帝审批 NPC 调动方案的界面。当玩家在界面中替换某个候选人时，如果新候选人是"升调/平调"（会腾出旧岗位），UI 组件**自己实现了一套连锁填坑逻辑**（第 148~178 行），直接调用 `generateCandidates` 并挑选 `fresh` 候选人补位。

同时，为了支持玩家选择那些"在原方案中被选中，但现在被玩家替换下来"的角色，UI 组件还**自己实现了一套合成候选人的逻辑**（第 106~130 行），手动构造 `CandidateEntry` 并硬编码了评分公式（`virtue * 0.4 + administration * 0.2`）。

**影响**：
- **逻辑重复与分化**：UI 层的连锁填坑逻辑与 `appointBehavior.ts` 中的 `planAppointments` 逻辑平行存在。如果未来修改了 NPC 的填坑偏好或评分公式，必须同时修改 Engine 和 UI 两处，极易产生 Bug。
- **文武判定丢失**：UI 层硬编码了 `administration * 0.2`，丢失了 `selectionCalc.ts` 中根据岗位类型（`territoryType === 'military'`）动态选择军事或行政能力的逻辑。

**修复建议**：
UI 层不应包含任何业务规划逻辑。当玩家在 `TransferPlanFlow` 中修改了某个条目时，UI 应该只记录玩家的**强制锁定选择**，然后将这些锁定选择作为参数传回给 Engine 层的 `planAppointments`，让 Engine 重新计算并返回一份完整的、包含正确连锁的新方案。

---

### 1.2 `AlertBar.tsx` 忽略了 Engine 计算的草稿状态

**文件**：`ui/components/AlertBar.tsx`

**问题**：`NpcEngine.ts` 在月结时已经计算出了玩家需要处理的空缺岗位，并存入了 `NpcStore.getState().playerDraftPostIds`。然而，`AlertBar.tsx` 完全没有读取这个字段，而是**在每次渲染时重新调用** `getPendingVacancies(playerId)`，并自己写了一套逻辑（第 40~57 行）来区分哪些是 `draftPosts`（经办人是自己），哪些是 `directPosts`（经办人不是自己）。

**影响**：
- **性能浪费**：`AlertBar` 随时间推移高频渲染，每次渲染都遍历全图岗位计算权限，开销极大。
- **状态脱节**：Engine 认为玩家需要处理的岗位，与 UI 实际弹出的岗位可能因为逻辑微小差异而不一致。`playerDraftPostIds` 变成了死数据（Dead State）。

**修复建议**：
`AlertBar` 应该直接读取 `useNpcStore((s) => s.playerDraftPostIds)` 来决定是否显示"拟定铨选草案"按钮。如果需要区分 `directPosts`，也应该在 `NpcEngine.ts` 中计算好并存入 Store，UI 只负责读取和展示。

---

## 二、业务逻辑问题（中优先级）

### 2.1 辟署权经办人逻辑不符合设计方案

**文件**：`engine/official/selectionCalc.ts`，第 38~59 行

**问题**：在 `resolveAppointAuthority` 中，对于辟署权领地内的岗位，代码直接返回了辟署权持有人（`rightHolder`）作为经办人。

这与晚唐历史设定的设计原则不符。根据设计方案：
> "对于藩镇辖区内的低级官员自动铨选，系统应识别并利用节度使麾下的'节度判官'（pos-panguan）或'录事参军'（pos-lushibcanjun）进行人事管理，而非中央的'吏部'。"

**修复建议**：
在 `resolveAppointAuthority` 中，如果岗位在辟署权领地内：
1. 检查该领地（或其上级道）是否有 `pos-panguan` 或 `pos-lushibcanjun` 且有任职者。
2. 如果有，返回该判官/参军的 ID 作为经办人。
3. 如果没有（空缺），才 fallback 到辟署权持有人本人。

---

### 2.2 平调（Transfer）缺乏"重要度"量化比较

**文件**：`engine/official/selectionCalc.ts`，第 167~179 行

**问题**：在判断候选人层级（`tier`）时，代码仅仅比较了 `currentRank` 和 `effectiveRank`。如果两者相等，就认为是 `transfer`（平调）。

根据设计方案：
> "在比较官职'重要度'以进行平调时，特别是当它们的 'minRank' 相似时，应通过比较具体的数值（如'月俸总和'或'声望加成'）来量化'重要度'，以允许在不同吸引力的职位之间进行调动（例如，从'穷'州调到'富'州）。"

当前逻辑下，从长安刺史调到偏远下州刺史，和从偏远下州调到长安，都被视为无差别的 `transfer`，NPC 在填坑时不会考虑这种"暗降"或"暗升"的意愿差异。

**修复建议**：
在 `selectionCalc.ts` 中引入 `calculateSalaryPure` 或比较所在州的 `basePopulation`，细化 `transfer` 的定义。如果目标岗位的综合收益明显低于当前岗位，应给予评分惩罚，甚至拒绝调动。

---

## 三、代码质量亮点（值得保留）

**底层纯函数拆分**：`selectionCalc.ts` 完全不依赖 Zustand Store，所有外部状态（`territories`, `characters`, `centralPosts`）都通过参数传入。这使得核心铨选逻辑极其容易编写单元测试。

**法理主体与经办人分离**：`resolveAppointAuthority`（经办人，如吏部尚书）和 `resolveLegalAppointer`（法理主体，如皇帝）的拆分非常精准。这完美模拟了古代官僚体制中"吏部拟定名单，皇帝名义授职"的流程，也为辟署权体系下的"判官拟定，节度使授职"提供了统一的抽象。

**`reviewBehavior.ts` 的规范接入**：考课系统在重构后，正确使用了 `resolveAppointAuthority` 和 `resolveLegalAppointer` 来处理因考课不合格导致的降职/罢免，没有重复造轮子，是 Engine 层复用新架构的典范。

---

## 四、建议优先级汇总

| 优先级 | 问题 | 涉及文件 |
|--------|------|---------|
| **P0 必修** | `TransferPlanFlow` 存在平行的规划与评分逻辑 | `TransferPlanFlow.tsx` |
| **P0 必修** | `AlertBar` 忽略 Engine 状态，高频重复计算 | `AlertBar.tsx` |
| **P1 建议** | 辟署权经办人未指向判官/录事参军 | `selectionCalc.ts` |
| **P2 可选** | 平调（Transfer）缺乏基于收益的"重要度"比较 | `selectionCalc.ts` |
