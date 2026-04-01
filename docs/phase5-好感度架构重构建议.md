# 好感度系统架构重构建议

> 背景：本文档是在 Phase 4C 代码审阅后，针对 `calculateBaseOpinion` 纯函数污染问题以及 Phase 6 NPC Engine 性能隐患所提出的架构改进方案。建议在 Phase 6 开始前完成本次重构。

---

## 一、问题溯源

### 1.1 历史演变

Phase 4C 实现正统性好感时，经历了以下演变：

1. **第一版**：将正统性好感作为月结事件写入 `relationships` 数组（持久化）。
   - **问题**：正统性变化后，好感度 Debuff 要等到下个月才能显示，体验不符合预期。

2. **第二版（当前实现）**：将正统性好感改为在 `calculateBaseOpinion` 内部实时计算，内部调用 `getLegitimacyOpinion(b)`，后者调用 `useTerritoryStore.getState()`。
   - **问题**：`calculateBaseOpinion` 原本是纯函数，现在隐式依赖了 Store，破坏了可测试性，且调用方无法感知这一副作用。

### 1.2 根本原因

这两版方案都是在用错误的工具解决正确的问题。

好感度由两类因素构成，它们的性质截然不同：

| 因素类型 | 特征 | 正确存储位置 |
|---------|------|------------|
| **历史累积项**（授职、战争、背叛等） | 持久，有衰减，有历史记录 | `Character.relationships` 数组 |
| **实时修正项**（正统性、特质匹配等） | 实时，无历史，随状态变化立即生效 | 不存储，每次计算时传入 |

正统性好感属于**实时修正项**，和特质好感、全局修正是同一类东西——它不应该被写入 `relationships`，也不应该在函数内部偷偷查 Store，而应该由**调用方显式提供所需的上下文参数**。

---

## 二、Phase 6 的性能隐患

当前实现在 Phase 6 NPC Engine 中会面临严重的性能问题。

NPC 决策逻辑将出现以下类型的查询：

- "找出所有对我好感度 > 50 的角色"（全量扫描）
- "找出我的下属中好感度最低的那个"（全量扫描 + 排序）
- "如果某人对我的好感度 < -30，考虑叛乱"（每月对每个 NPC 执行）

以游戏规模估算（100 个活跃角色），每月 NPC 决策阶段可能产生约 **1000 次** `calculateBaseOpinion` 调用。当前实现中，每次调用内部都会通过 `getLegitimacyOpinion` 遍历领地查岗位，实际复杂度接近 **O(N × M × T)**（角色数 × 查询对数 × 领地数），会成为明显的月结瓶颈。

---

## 三、建议方案：预期正统性缓存表

### 3.1 核心思路

在 `TerritoryStore`（或独立的 `LegitimacyStore`）中，增加一个轻量级缓存字段：

```typescript
// 新增字段：每个角色当前的"预期正统性"
expectedLegitimacy: Map<string, number>
```

这张表记录每个角色当前持有的所有岗位中，`baseLegitimacy` 的最高值（即正统性预期值）。查询时 O(1)，彻底消除 Phase 6 的性能隐患。

### 3.2 维护时机

缓存表需要在以下时机更新：

| 时机 | 触发原因 | 操作 |
|------|---------|------|
| `appointAction` 执行后 | 角色获得或失去岗位 | 更新被任命者和被替换者的预期值 |
| `runSocialSystem` 月结时 | 兜底全量刷新（防止遗漏） | 遍历所有存活角色，重算预期值 |
| 角色死亡时 | 角色失去所有岗位 | 将该角色的预期值设为 `null` 或删除 |

### 3.3 `calculateBaseOpinion` 恢复纯函数

```typescript
// characterUtils.ts — 恢复为纯函数，增加可选参数
export function calculateBaseOpinion(
  a: Character,
  b: Character,
  bExpectedLeg: number | null,  // B 的预期正统性，null 表示 B 无官职
): number {
  // ...原有特质、全局修正、relationships 累积逻辑...

  // 正统性好感：实时修正项
  if (bExpectedLeg !== null) {
    const legitimacyOpinion = calcLegitimacyOpinion(b.resources.legitimacy, bExpectedLeg);
    if (legitimacyOpinion) {
      opinion += legitimacyOpinion.gapValue + legitimacyOpinion.absoluteValue;
    }
  }

  return clamp(opinion, -100, 100);
}
```

### 3.4 调用方改造

**UI 层**（`CharacterPanel.tsx`、`OpinionPopup.tsx`）：

```typescript
// 从缓存取预期值，一行代码
const expectedLeg = useTerritoryStore(s => s.expectedLegitimacy.get(char.id) ?? null);
const opinion = calculateBaseOpinion(a, char, expectedLeg);
```

**交互层**（`demandFealtyAction.ts`）：

```typescript
const terrStore = useTerritoryStore.getState();
const bExpectedLeg = terrStore.expectedLegitimacy.get(targetId) ?? null;
const opinion = calculateBaseOpinion(target, player, bExpectedLeg);
```

**NPC Engine**（Phase 6，高频调用）：

```typescript
// 月结前已更新缓存，NPC 决策时直接取，O(1)
const bExpectedLeg = terrStore.expectedLegitimacy.get(bId) ?? null;
const opinion = calculateBaseOpinion(a, b, bExpectedLeg);
```

---

## 四、改动范围汇总

| 文件 | 改动内容 |
|------|---------|
| `engine/territory/TerritoryStore.ts` | 新增 `expectedLegitimacy: Map<string, number>` 字段及 `setExpectedLegitimacy(charId, value)` 方法 |
| `engine/official/legitimacyCalc.ts` | 新增纯函数 `calcExpectedLegitimacy(charId, territories, centralPosts): number \| null` |
| `engine/interaction/appointAction.ts` | 授职后调用 `setExpectedLegitimacy` 更新被任命者和被替换者 |
| `engine/systems/socialSystem.ts` | 月结时批量重算并更新 `expectedLegitimacy` 缓存 |
| `engine/character/characterUtils.ts` | `calculateBaseOpinion` 增加 `bExpectedLeg: number \| null` 参数，移除内部 Store 调用 |
| `engine/official/officialUtils.ts` | 删除 `getLegitimacyOpinion(b)` 中的 Store 调用，改为纯函数接受参数 |
| `ui/components/CharacterPanel.tsx` | 从 Store 取缓存值后传入 `calculateBaseOpinion` |
| `ui/components/OpinionPopup.tsx` | 同上 |
| `engine/interaction/demandFealtyAction.ts` | 从 Store 取缓存值后传入 `calculateBaseOpinion` |

---

## 五、不建议的方案

**方案 A：将好感度最终值完全持久化**（如在 `Character` 上加 `opinionMap: Map<string, number>`）

- 好感度是 O(N²) 量级的数据，全量存储内存压力大。
- 正统性、特质等实时项变化时，需要同步更新所有相关好感度，维护成本极高。

**方案 B：保持现状（接受纯函数污染）**

- 短期可行，但 Phase 6 NPC Engine 高频调用时会暴露性能问题。
- 单元测试需要 Mock Store，测试隔离性差。

---

## 六、建议执行顺序

1. 在 `TerritoryStore` 中新增 `expectedLegitimacy` 字段（5 分钟）
2. 实现 `calcExpectedLegitimacy` 纯函数（10 分钟）
3. 在 `appointAction` 和 `socialSystem` 中维护缓存（15 分钟）
4. 修改 `calculateBaseOpinion` 函数签名，移除 Store 依赖（10 分钟）
5. 更新所有调用方（15 分钟）
6. 更新相关单元测试（10 分钟）

**预计总工时：约 1 小时。**
