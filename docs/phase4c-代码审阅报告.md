# Phase 4C 代码审阅报告

> 审阅日期：2026-04-01 | 审阅范围：commit `c9579e5`（Phase 4 + 4C 王朝兴衰部分）

---

## 总体评价

Phase 4C 的整体实现**质量良好**，核心逻辑清晰，单元测试覆盖了关键路径，83 个测试全部通过。新增的 `legitimacyCalc.ts`、`eraSystem.ts` 模块结构合理，`appointAction.ts` 的正统性刷新集成位置正确。

以下按严重程度分级，列出需要关注的问题。

---

## 一、需要修复的 Bug（高优先级）

### 1.1 品位正统性上限（Cap）数值与设计方案不符

**文件**：`engine/official/legitimacyCalc.ts`，第 31~41 行

**问题**：实现的 Cap 数值与设计方案存在两处偏差：

| 品位 | 设计方案 Cap | 实现 Cap | 差异 |
|------|------------|---------|------|
| 六品（rank 13~16） | **75** | **70** | ❌ 偏低 5 |
| 八品（rank 5~8） | **65** | **50** | ❌ 偏低 15 |
| 九品（rank 1~4） | **60** | **40** | ❌ 偏低 20 |

当前实现中，九品官员的正统性上限仅为 40，而其职位基础正统性（`baseLegitimacy`）为 60。这意味着：**一个九品官员被授予职位后，正统性会被刷新至 60，但随即在下一次月结时被 Cap 强制压回 40**，产生逻辑矛盾。

**根因**：Claude Code 在实现时将 Cap 设计为"每品位递减 5"的等差数列（100→95→90→85→80→70→60→50→40），而设计方案的意图是低品位官员的 Cap 不应低于其职位的 `baseLegitimacy`（最低 60）。

**修复建议**：将 `getRankLegitimacyCap` 中的低品位区间改为：

```typescript
if (rankLevel >= 13) return 75;  // 六品：75（原 70）
if (rankLevel >= 9)  return 65;  // 七品：65（原 60）
if (rankLevel >= 5)  return 60;  // 八品：60（原 50）
return 60;                        // 九品：60（原 40）
```

同时需要同步更新 `phase4c-legitimacy.test.ts` 中对应的断言。

---

### 1.2 危世衰减速率与设计方案不符

**文件**：`engine/official/legitimacyCalc.ts`，第 83~88 行

**问题**：危世的月度衰减实现为 `-0.25`（每月），而设计方案约定为 `-0.33`（每 3 个月 -1，即每月约 -0.33）。

从玩家体验角度换算：
- 实现值 `-0.25/月`：皇帝从 95 跌至 60 需要 **140 个月（约 11.7 年）**
- 设计约定 `-0.33/月`：需要 **105 个月（约 8.75 年）**

差距约 3 年，在游戏节奏中属于显著偏差。

**修复建议**：将危世衰减改为 `-1/3`（约 `-0.333`），或改为整数运算——每月检查 `month % 3 === 0` 时执行 `-1`（需在 `socialSystem.ts` 中实现，而非在 `calcEraDecay` 中返回小数）。

---

## 二、架构问题（中优先级）

### 2.1 `calculateBaseOpinion` 纯函数被污染

**文件**：`engine/character/characterUtils.ts`，第 203 行

**问题**：`calculateBaseOpinion(a, b)` 和 `getOpinionBreakdown(a, b)` 是项目架构约定中**必须保持纯函数**的核心计算函数（CLAUDE.md §九）。但 Phase 4C 的实现通过 `import { getLegitimacyOpinion } from '@engine/official/officialUtils'` 引入了一个内部调用 `useTerritoryStore.getState()` 的 Store 依赖函数，使这两个函数变为**不纯函数**。

**影响**：
- 这两个函数无法再被单元测试独立测试（需要 Store 环境）。
- NPC Engine 高频调用 `calculateBaseOpinion`，而 Store 的 `getState()` 在高频调用下有额外开销。
- 违反了项目的核心架构约定，为后续维护埋下隐患。

**修复建议**：恢复纯函数签名，将预期正统性作为参数传入：

```typescript
// characterUtils.ts
export function calculateBaseOpinion(
  a: Character,
  b: Character,
  bExpectedLegitimacy?: number,  // 新增可选参数
): number {
  // ...
  if (bExpectedLegitimacy !== undefined) {
    const result = calcLegitimacyOpinion(b.resources.legitimacy, bExpectedLegitimacy);
    if (result) opinion += result.gapValue + result.absoluteValue;
  }
  // ...
}
```

调用方（`socialSystem.ts`、UI 层）在调用前先通过 `getHighestBaseLegitimacy(getHeldPostsPure(...))` 获取预期值，再传入。

---

### 2.2 `eraSystem.ts` 在月结管线中的执行顺序偏后

**文件**：`engine/settlement.ts`，第 25 行

**问题**：`runEraSystem` 目前排在第 8 位（战争系统之后），而 `warSettlement.ts` 中的 `addCollapseProgress(10)` 是在战争结算时**同步调用**的，并非通过 `runEraSystem` 触发。这意味着：

- 战争结算（`warSystem` 第 7 步）调用 `addCollapseProgress` → 直接修改 Store
- `runEraSystem`（第 8 步）再次读取 `collapseProgress` 并检查是否触发时代切换

这个顺序实际上是**正确的**（战争先触发进度，Era System 再检查切换），但当前 `eraSystem.ts` 中没有注释说明这一依赖关系，容易引起误解。

**建议**：在 `settlement.ts` 和 `eraSystem.ts` 中各添加一行注释，说明 `runEraSystem` 必须在 `runWarSystem` 之后执行的原因。

---

### 2.3 `eraSystem.ts` 缺少乱世→危世的恢复路径

**文件**：`engine/systems/eraSystem.ts`

**问题**：当前 `runEraSystem` 只实现了**衰退方向**（治世→危世→乱世），完全没有实现**恢复方向**（乱世→危世→治世）的进度条逻辑。`stabilityProgress` 字段虽然存在于 `TurnManager` 中，但从未被任何代码写入（始终为 0）。

这意味着游戏一旦进入乱世，**永远无法恢复**，这与设计方案中"进度条双向驱动"的意图不符。

**建议**：这是已知的"骨架版"限制，建议在 `eraSystem.ts` 的文件头注释中明确标注：

```typescript
// TODO Phase 4C-2：实现 stabilityProgress 的增长逻辑（任务完成驱动），
// 以及乱世→危世、危世→治世的恢复切换。
```

---

## 三、数值设计偏差（低优先级，可讨论）

### 3.1 新增了"绝对值好感修正"（`absoluteValue`）

**文件**：`engine/official/legitimacyCalc.ts`，第 73~77 行

**问题**：实现中新增了一个在设计方案中**未曾讨论**的修正项：
- 正统性 ≥ 90 → 全局好感 **+10**（"天命所归"）
- 正统性 ≤ 30 → 全局好感 **-20**（"名器尽失"）

这个设计本身合理，但与"差值传导"叠加后，极端情况下的好感惩罚可达 **-70**（差值 -50 + 绝对值 -20），远超设计方案中最严重的 -50。

**建议**：确认这是有意为之的设计扩展，并在设计文档中补充说明。如果是有意的，建议将 `absoluteValue` 的触发条件和数值也纳入单元测试的边界值验证。

---

### 3.2 `legitimacyCalc.ts` 混入了非正统性相关函数

**文件**：`engine/official/legitimacyCalc.ts`，第 93~110 行

**问题**：`calcRankMismatchPenalty`（品位不足铨选惩罚）和 `canAffordWarCost`（宣战资源校验）与正统性系统没有直接关系，被放入 `legitimacyCalc.ts` 中导致模块职责不清晰。

**建议**：
- `calcRankMismatchPenalty` 应移至 `selectionCalc.ts`（铨选计算）
- `canAffordWarCost` 应移至 `warCalc.ts`（战争计算）

---

## 四、代码质量亮点（值得保留）

以下是实现中值得肯定的设计决策：

**`getHighestBaseLegitimacy` 的多岗位取最高值逻辑**：正确处理了一个角色同时持有多个岗位（如节度使兼任刺史）的情况，取最高预期值而非最低，符合"名器叠加"的历史逻辑。

**`appointAction.ts` 步骤 5 的实现**：正统性刷新在设置岗位（步骤 1）之后、读取最新岗位列表（`getHeldPostsPure`）时，能正确包含刚刚授予的新岗位，逻辑严密。

**`warSettlement.ts` 的单向耦合**：`warSettlement` 调用 `eraSystem.addCollapseProgress` 而非反向依赖，耦合方向正确，符合"业务层调用系统层"的原则。

**单元测试的独立性**：`phase4c-legitimacy.test.ts` 完全测试纯函数，不依赖 Store，可以在任何环境下稳定运行。

---

## 五、建议优先级汇总

| 优先级 | 问题 | 涉及文件 |
|--------|------|---------|
| **P0 必修** | 品位 Cap 数值错误（九品/八品/六品） | `legitimacyCalc.ts` + 测试 |
| **P0 必修** | 危世衰减速率偏慢（-0.25 vs -0.33） | `legitimacyCalc.ts` + 测试 |
| **P1 建议** | `calculateBaseOpinion` 纯函数污染 | `characterUtils.ts` |
| **P1 建议** | `eraSystem` 缺少恢复路径的 TODO 注释 | `eraSystem.ts` |
| **P2 可选** | `legitimacyCalc.ts` 职责过宽 | `legitimacyCalc.ts` → `selectionCalc.ts` / `warCalc.ts` |
| **P2 可选** | `absoluteValue` 设计补充到文档 | 设计文档 |
| **P2 可选** | `settlement.ts` 执行顺序依赖注释 | `settlement.ts` + `eraSystem.ts` |
