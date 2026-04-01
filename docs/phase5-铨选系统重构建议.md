# 铨选系统重构建议

> 写给 Claude Code | 日期：2026-04-01

---

## 背景

在对铨选系统重构代码进行完整审阅后，结合对代码的深度阅读，对此前的审阅报告进行了修正。本文档是修正后的最终建议，请以本文档为准，忽略此前的 `phase4c-铨选系统审阅报告.md`。

---

## 一、立即修复（P1）

### `TransferPlanFlow.tsx` 第 127 行：文武判定硬编码

**问题**：当皇帝在审批界面替换候选人时，为"被释放角色"（原方案中有、当前名单中没有的角色）构造合成候选人条目时，评分公式被硬编码为：

```typescript
score: Math.round(char.official.virtue * 0.4 + char.abilities.administration * 0.2),
```

这丢失了 `selectionCalc.ts` 中根据岗位类型（`territoryType === 'military'`）动态选择军事或行政能力的逻辑。军事岗位的被释放候选人，会被错误地用行政能力评分。

**修复方式**：从 `selectionCalc.ts` 中导出一个辅助函数，或在构造合成候选人时读取岗位模板的 `territoryType`，动态选择 `char.abilities.military` 或 `char.abilities.administration`。

---

## 二、可以删除的死代码（P2）

### `NpcStore.ts` 中的 `playerDraftPostIds` 字段

**问题**：`NpcEngine.ts` 在月结时会计算玩家作为经办人需要处理的空缺岗位，并写入 `NpcStore.playerDraftPostIds`。然而，`AlertBar.tsx` 完全没有读取这个字段，而是自己调用 `getPendingVacancies` 重新计算。两者使用同一套规则，结果应当一致，因此 `playerDraftPostIds` 是一个从未被消费的冗余字段。

**建议**：直接删除 `playerDraftPostIds` 字段及其在 `NpcEngine.ts` 中的写入逻辑。`AlertBar` 的现有实现保持不变。

---

## 三、待讨论的设计决策（Phase 6 前确认）

### 节度使辟署权域内是否应委托判官执行铨选

**背景**：目前 `NpcEngine.ts` 中的 `getNpcActors` 函数，会把所有持有辟署权的节度使/藩王本人加入 NPC 经办人列表，由他们亲自执行 `planAppointments`，处理辖区内所有空缺。

这在功能上没有问题，但存在一个设计层面的问题：节度使亲自处理辖区内每一个录事参军、司马的空缺，在历史感上略显失真。历史上，这类低级幕职的铨选，通常由节度判官（`pos-panguan`）或录事参军（`pos-lushibcanjun`）代为经办，节度使只负责最终点头。

**这个问题不影响当前功能**，但会影响 Phase 6 中 NPC 行为的设计——如果判官是真正的经办人，那么判官的能力、好感度、忠诚度就会影响辖区内的铨选质量，这是一个有趣的游戏机制。

**建议在 Phase 6 开始前确认**：是否要在 `getNpcActors` 中，对辟署权领地内的低品级岗位（`effectiveRank < 17`），优先使用判官/录事参军作为经办人？

---

## 四、不建议现在处理的问题

### `TransferPlanFlow` 的连锁填坑逻辑

此前审阅报告将此列为 P0，经重新评估，这是一个误判。

`TransferPlanFlow` 中的连锁填坑逻辑（当玩家替换候选人后，为腾出的旧岗自动补位），是因为 Engine 层的 `planAppointments` 不支持"锁定部分条目、重新计算其余条目"的增量规划模式，UI 层不得不自己实现。这不是 UI 越权，而是 Engine 接口的空白。

这个问题的根本解法，是在 Phase 6 重新设计规划接口时，为 `planAppointments` 增加一个 `lockedEntries` 参数，支持增量规划。在此之前，`TransferPlanFlow` 的现有实现是合理的临时方案，不建议单独修改。

### 平调（Transfer）的"重要度"比较

目前平调判定只比较品级，不比较岗位的综合收益（月俸、所在州人口等）。这会导致从富州调到穷州和反向调动被视为无差别。

这是一个值得改进的功能点，但不是 Bug，不影响系统正确运行。建议作为 Phase 6 铨选系统优化的一部分，在 NPC 决策逻辑中一并考虑。

---

## 五、更大的架构问题（Phase 6 前置任务）

在深入审阅铨选系统后，发现了一个比上述所有问题都更根本的架构问题，需要在 Phase 6 开始前专门处理。

**当前铨选系统存在两条平行轨道**：

- **轨道 A**：玩家通过 `AppointFlow` 直接调用 `executeAppoint`，绕过所有草稿和审批流程，立即执行任命。
- **轨道 B**：月结时通过 NPC Engine 走完整的"草稿 → 审批 → 执行"流程。

这两条轨道完全独立，没有协调机制。轨道 A 实际上是一个"上帝模式"，让玩家可以随时绕过游戏世界的官僚流程。

这个问题的详细分析和解决方案，请参见 `docs/phase6-铨选架构对齐方案.md`（待撰写）。**建议在开始 Phase 6 的 NPC Engine 实现之前，先完成这份文档的讨论和确认。**
