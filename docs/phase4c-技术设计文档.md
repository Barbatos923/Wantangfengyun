# Phase 4C — 王朝兴衰机制：技术设计文档

> 版本：v1.0 | 日期：2026-03-31

---

## 一、总体架构

Phase 4C 在现有系统之上叠加三个相互关联的子系统：

```
官职系统（品位/职位）
       ↓ 授职刷新 / 品位上限
正统性（legitimacy）
       ↓ 差值传导
好感度（opinion）
       ↓ 离心倾向
时代状态机（Era）
       ↓ 衰减速率
正统性（循环）
```

**核心原则**：正统性是唯一的传导介质。时代通过影响正统性衰减速率来间接影响好感度，好感度崩溃再反过来推动时代向乱世演进。

---

## 二、数据结构变更

### 2.1 `data/ranks.ts` — 新增 `legitimacyCap`

在 `RankDef` 接口和 `ALL_RANKS` 数据中新增 `legitimacyCap: number` 字段。

| 品位 level | 品位名称 | `legitimacyCap` |
|-----------|---------|----------------|
| 1~4 | 九品 | 60 |
| 5~8 | 八品 | 65 |
| 9~12 | 七品 | 70 |
| 13~16 | 六品 | 75 |
| 17~20 | 五品 | 80 |
| 21~24 | 四品 | 85 |
| 25~26 | 三品 | 90 |
| 27~28 | 二品 | 95 |
| 29 | 一品 | 100 |

### 2.2 `data/positions.ts` — 新增 `baseLegitimacy`

在 `PositionTemplate` 接口中新增 `baseLegitimacy: number` 字段（可选，默认 0）。

**分档规则**（直接在数据中硬编码，无需运行时计算）：
- `pos-emperor`：**95**
- `minRank >= 17`（五品及以上）的所有职位：**80**
- `minRank <= 16`（六品及以下）的所有职位：**60**

### 2.3 `engine/official/types.ts` — 接口同步

`PositionTemplate` 接口新增 `baseLegitimacy?: number`。
`RankDef` 接口新增 `legitimacyCap: number`。

### 2.4 `engine/types.ts` — 新增 `EraProgress`

新增时代进度条数据结构（存储在 `TurnManager` 中）：

```typescript
/** 时代进度条 — 任务驱动型状态机的核心数据 */
export interface EraProgress {
  /** 当前时代 */
  era: Era;

  /**
   * 当前时代的"稳定进度"（0~100）。
   * 危世中：达到 100 → 升为治世；跌至 0 → 降为乱世。
   * 治世中：跌至 0 → 降为危世。
   * 乱世中：达到 100 → 升为危世。
   */
  stabilityProgress: number;

  /**
   * 当前时代的"崩溃进度"（0~100）。
   * 危世中：达到 100 → 降为乱世。
   * 治世中：达到 100 → 降为危世。
   * 乱世中：无崩溃进度（已在底部）。
   */
  collapseProgress: number;
}
```

**设计意图**：进度条机制（而非单一数值）防止玩家在时代边界来回横跳。进度条的增减由**任务完成/失败**驱动，具体任务清单留待后续 Phase 4C-2 填充。

---

## 三、新增模块：`engine/official/legitimacyUtils.ts`

这是正统性系统的核心纯函数库。

```typescript
/**
 * 获取职位的正统性基准值（预期值）。
 * 授职时：若当前正统性 < 基准值，则刷新至基准值。
 * 好感度计算时：用作"预期正统性"。
 */
export function getPositionBaseLegitimacy(tpl: PositionTemplate): number

/**
 * 获取品位的正统性上限。
 * 角色的正统性不得超过其当前品位的上限。
 */
export function getRankLegitimacyCap(rankLevel: number): number

/**
 * 获取角色当前最高职位的正统性预期值。
 * 若角色无任何职位，返回 0。
 */
export function getCharacterExpectedLegitimacy(
  charId: string,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): number

/**
 * 计算正统性差值对好感度的修正量（静态计算项）。
 * 观察者 A 对被观察者 B 的好感度修正，取决于 B 的正统性与预期值的差。
 *
 * 差值 D = B.legitimacy - expectedLegitimacy(B)
 * D >= +10  → +10（德高望重）
 * 0 <= D < +10 → 0（名副其实）
 * -10 <= D < 0 → -5（略显不足）
 * -20 <= D < -10 → -15（人心浮动）
 * -30 <= D < -20 → -30（离心离德）
 * D < -30 → -50（众叛亲离）
 */
export function calcLegitimacyOpinionModifier(
  targetLegitimacy: number,
  expectedLegitimacy: number,
): number

/**
 * 计算当前时代下的正统性月度衰减量（负数或零）。
 * 治世：0
 * 危世：-1（每 3 个月执行，即每月 -0.33）
 * 乱世：-1（每月执行）
 *
 * 实现时通过 date.month % 3 === 0 来控制危世的执行频率。
 */
export function calcMonthlyLegitimacyDecay(era: Era, month: number): number

/**
 * 将正统性 clamp 到 [0, cap] 区间。
 */
export function clampLegitimacy(value: number, cap: number): number
```

---

## 四、变更模块：`engine/character/characterUtils.ts`

在 `calculateBaseOpinion(a, b)` 和 `getOpinionBreakdown(a, b)` 中新增正统性修正项。

由于这两个函数是纯函数，需要新增参数传入 B 的预期正统性：

```typescript
// 修改后的签名
export function calculateBaseOpinion(
  a: Character,
  b: Character,
  bExpectedLegitimacy?: number,  // 新增可选参数，默认 0（无职位）
): number

export function getOpinionBreakdown(
  a: Character,
  b: Character,
  bExpectedLegitimacy?: number,
): OpinionBreakdownEntry[]
```

在函数体中，在"事件累积好感度"之后、`clamp` 之前，新增：

```typescript
// 正统性修正（静态计算项）
if (bExpectedLegitimacy !== undefined && bExpectedLegitimacy > 0) {
  opinion += calcLegitimacyOpinionModifier(b.resources.legitimacy, bExpectedLegitimacy);
}
```

**调用方变更**：所有调用 `calculateBaseOpinion` 的地方（主要是 UI 层的 `CharacterPanel.tsx`）需要额外传入 `bExpectedLegitimacy`。可通过 `getCharacterExpectedLegitimacy()` 获取。

---

## 五、变更模块：`engine/systems/socialSystem.ts`

在月结的 `runSocialSystem` 中，新增正统性月度衰减步骤：

```typescript
// 在好感度衰减之后，新增正统性衰减步骤
const era = useTurnManager.getState().era;
const decay = calcMonthlyLegitimacyDecay(era, date.month);

if (decay !== 0) {
  charStore.batchMutate((chars) => {
    for (const char of chars.values()) {
      if (!char.alive) continue;
      const cap = getRankLegitimacyCap(char.official?.rankLevel ?? 1);
      const newLeg = clampLegitimacy(char.resources.legitimacy + decay, cap);
      if (newLeg !== char.resources.legitimacy) {
        chars.set(char.id, {
          ...char,
          resources: { ...char.resources, legitimacy: newLeg },
        });
      }
    }
  });
}
```

---

## 六、变更模块：`engine/interaction/appointAction.ts`

在 `executeAppoint` 的步骤 4（好感修正）之后，新增步骤 4.5（正统性刷新）：

```typescript
// 4.5 正统性刷新：若被任命者当前正统性 < 职位基准值，刷新至基准值
if (post) {
  const tpl = positionMap.get(post.templateId);
  if (tpl) {
    const baseLeg = getPositionBaseLegitimacy(tpl);
    const appointee = charStore.getCharacter(appointeeId);
    if (appointee && baseLeg > 0 && appointee.resources.legitimacy < baseLeg) {
      const cap = getRankLegitimacyCap(appointee.official?.rankLevel ?? 1);
      const newLeg = clampLegitimacy(baseLeg, cap);
      charStore.addResources(appointeeId, { legitimacy: newLeg - appointee.resources.legitimacy });
    }
  }
}
```

---

## 七、新增模块：`engine/systems/eraSystem.ts`

时代状态机的月结 System（骨架版，具体任务诱因留待后续填充）：

```typescript
/**
 * 时代状态机 System（骨架版）
 * 每月执行，检查进度条是否触发时代切换。
 * 具体的进度条增减逻辑（任务完成/失败）由外部调用 addEraProgress() 触发。
 */
export function runEraSystem(_date: GameDate): void {
  const { eraProgress, setEraProgress, setEra } = useTurnManager.getState();
  const { stabilityProgress, collapseProgress, era } = eraProgress;

  switch (era) {
    case Era.WeiShi:
      if (stabilityProgress >= 100) {
        setEra(Era.ZhiShi);
        setEraProgress({ era: Era.ZhiShi, stabilityProgress: 50, collapseProgress: 0 });
      } else if (collapseProgress >= 100) {
        setEra(Era.LuanShi);
        setEraProgress({ era: Era.LuanShi, stabilityProgress: 0, collapseProgress: 0 });
      }
      break;
    case Era.ZhiShi:
      if (collapseProgress >= 100) {
        setEra(Era.WeiShi);
        setEraProgress({ era: Era.WeiShi, stabilityProgress: 50, collapseProgress: 0 });
      }
      break;
    case Era.LuanShi:
      if (stabilityProgress >= 100) {
        setEra(Era.WeiShi);
        setEraProgress({ era: Era.WeiShi, stabilityProgress: 0, collapseProgress: 50 });
      }
      break;
  }
}
```

---

## 八、变更模块：`engine/TurnManager.ts`

新增 `eraProgress` 状态和相关 action：

```typescript
// 新增状态
eraProgress: EraProgress;

// 新增 action
setEra: (era: Era) => void;
setEraProgress: (progress: EraProgress) => void;
addEraProgress: (delta: { stability?: number; collapse?: number }) => void;
```

初始值：
```typescript
eraProgress: {
  era: Era.WeiShi,
  stabilityProgress: 0,
  collapseProgress: 0,
}
```

---

## 九、`settlement.ts` 变更

在月结管线中新增 `runEraSystem`，置于 `runSocialSystem` 之后：

```
1. characterSystem
2. npcEngine
3. populationSystem
4. socialSystem        ← 正统性衰减在此执行
5. eraSystem           ← 新增：时代状态机检查
6. economySystem
7. militarySystem
8. warSystem
9. buildingSystem
```

---

## 十、实现顺序

1. **数据层**：`ranks.ts` + `positions.ts` + `official/types.ts` 新增字段
2. **纯函数库**：新建 `engine/official/legitimacyUtils.ts`
3. **好感度传导**：修改 `characterUtils.ts` 的 `calculateBaseOpinion`
4. **月度衰减**：修改 `socialSystem.ts`
5. **状态机骨架**：新建 `engine/systems/eraSystem.ts` + 修改 `TurnManager.ts`
6. **授职刷新**：修改 `appointAction.ts`
7. **单元测试**：`src/__tests__/phase4c-legitimacy.test.ts`
8. **推送 GitHub**

---

## 十一、暂不实现（留待后续）

- 爵位月供（每月正统性增益）
- 勋阶一次性奖励
- 时代进度条的具体任务诱因（任务完成/失败触发 `addEraProgress`）
- UI：时代状态显示、正统性进度条
