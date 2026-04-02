# Phase 6 NPC Engine 代码审阅报告

**审阅日期**：2026-04-02
**审阅对象**：Phase 6 NPC Engine 核心架构及行为模块实现（Commit `4cbe8d3`）
**审阅人**：Manus AI

## 一、总体评价

本次提交完成了 Phase 6 NPC Engine 的核心架构搭建，成功引入了基于 `NpcContext` 的统一决策循环，并实现了 `declareWar`、`mobilize`、`recruit`、`reward`、`build`、`demandFealty`、`negotiateWar` 等 7 个核心行为模块。测试套件（82 个用例）全部通过，说明基础逻辑未被破坏。

架构设计上，`NpcEngine.ts` 成功实现了 `forced` 任务与 `voluntary` 任务的分离，并正确引入了 `maxActions` 限制。`warCalc.ts` 中的纯函数计算逻辑清晰，高度还原了 CK3 的 `Base + Modifiers` 权重设计模式。

然而，在具体行为模块的实现中，发现了几处**破坏纯函数原则**和**状态读取不同步**的架构级隐患，需要及时修正。

## 二、架构级问题（P0 / P1）

### 1. 行为模块破坏 `NpcContext` 纯净性（P0）

**问题描述**：
在设计中，`generateTask` 应该是一个纯函数，仅依赖传入的 `actor` 和 `NpcContext` 快照进行评估。但在多个新行为模块中，直接调用了 `useStore.getState()` 读取实时状态，破坏了快照一致性，且增加了性能开销。

**涉及文件**：
*   `mobilizeBehavior.ts`：`getUnmobilizedWars` 直接读取 `useWarStore.getState().campaigns`。
*   `recruitBehavior.ts`：`getMilitaryStatus` 直接读取 `useMilitaryStore.getState()`。
*   `rewardBehavior.ts`：`findLowestMoraleArmy` 直接读取 `useMilitaryStore.getState()`。

**修复建议**：
必须将这些状态加入 `NpcContext` 快照中。
1.  在 `NpcContext` 接口中增加 `campaigns`、`armies`、`battalions` 等快照字段。
2.  在 `buildNpcContext` 中一次性读取并缓存这些数据。
3.  修改上述行为模块，使其仅从 `ctx` 中读取数据。

### 2. 连续执行时的资源状态不同步（P1）

**问题描述**：
在 `recruitBehavior.ts` 的 `executeAsNpc` 中，NPC 可能会连续补员多个营（最多 3 个）。代码在循环中检查 `actor.resources.money < 50` 来决定是否继续补员。但是，`actor` 对象是来自 `NpcContext` 的**快照**，其 `resources.money` 在循环过程中**不会更新**。这会导致 NPC 在资金不足时仍然连续触发补员，造成国库透支。

```typescript
// recruitBehavior.ts
for (const bat of sorted) {
  if (count >= 3) break;
  if (actor.resources.money < 50) break; // 这里的 actor.resources.money 是死数据
  executeReplenish(bat.battalionId, bat.territoryId, bat.deficit);
  count++;
}
```

**修复建议**：
在 `executeAsNpc` 这种产生副作用的函数中，如果需要连续判断资源，必须实时读取 Store 中的最新状态：
```typescript
const currentMoney = useCharacterStore.getState().characters.get(actor.id)?.resources.money ?? 0;
if (currentMoney < 50) break;
```

## 三、逻辑与平衡性问题（P2）

### 1. 军事动员（mobilizeBehavior）的行军目标缺失

**问题描述**：
`mobilizeBehavior` 在 `executeAsNpc` 中调用 `executeCreateCampaign` 时，没有设定行军目标（`targetId`），而是依赖 `warSystem` 的 AI 自动寻找目标。这会导致行营在创建当月处于 `idle` 状态，浪费一个月的时间。

**修复建议**：
在 `mobilizeBehavior` 中，应该根据攻守方身份，直接计算出一个初始的 `targetId` 并传入 `executeCreateCampaign`。

### 2. 赏赐行为（rewardBehavior）的预算计算过于粗暴

**问题描述**：
`rewardBehavior` 的预算计算逻辑为：如果资金 < 10万，则全部花光；如果 > 10万，则花 10万 + 超出部分的 5%。这会导致 NPC 极度容易破产，一旦士气低落就会把国库掏空。

**修复建议**：
引入更合理的预算上限，例如最多只花费当前国库的 20%，或者根据需要提升的士气缺口精确计算所需资金。

### 3. 和谈行为（negotiateWarBehavior）未考虑月收入

**问题描述**：
在计算和谈意愿时，`calcPeaceProposalWeight` 接收了 `monthlyIncome` 参数，但在 `negotiateWarBehavior` 中硬编码传入了 `0`。这使得经济压力对和谈的驱动力大打折扣。

**修复建议**：
通过 `useTerritoryStore` 或 `NpcContext` 计算角色的实际月收入并传入。

## 四、总结与下一步行动

当前代码已经搭建起了非常坚实的 NPC 行为框架，只需解决上述状态读取的纯净性问题，即可达到极高的稳定性。

**建议 Claude Code 的下一步行动**：
1.  **重构 NpcContext**：将 `armies`、`battalions`、`campaigns` 加入快照，并清理所有行为模块中的 `useStore.getState()` 调用（`executeAsNpc` 除外）。
2.  **修复资源透支 Bug**：在 `recruitBehavior` 和 `buildBehavior` 的执行逻辑中，改用实时状态检查资金。
3.  **优化赏赐逻辑**：调整 `rewardBehavior` 的资金消耗公式，避免 NPC 破产。
