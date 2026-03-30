# Phase 4C — 王朝兴衰系统设计方案

## Context

项目处于 Phase 4a+4b 完成后。`Character.resources` 中 `prestige` 和 `legitimacy` 字段已定义且初始值已在 `characters.json` 中设定，但无任何月度增减逻辑。`Era` 枚举（治世/危世/乱世）已存在于 `TurnManager.era`，初始值为 `危世`，但无转换逻辑。战争理由 `CasusBelli` 已包含 `'independence'`，`warCalc.ts` 已按 Era 区分战争代价。

本方案激活这些预留字段，构建**藩镇割据**核心玩法循环：威望/正统性驱动 → NPC 叛乱决策 → 独立战争 → 时代转换 → 反哺叛乱阈值。

---

## 分 Round 实现

### Round 1：威望与正统性月度引擎

**目标**：让 prestige/legitimacy 在月结中产生有意义的增减。

#### 1.1 新建 `engine/dynasty/prestigeCalc.ts`（纯函数）

```ts
export function calcMonthlyPrestige(
  controlledZhouCount: number,
  highestPostRank: number,
  warResults: { won: number; lost: number },  // 本月结束的战争
  era: Era,
): number
```

公式：
- 基础：`+1`
- 领地：`+controlledZhouCount × 0.5`
- 岗位：`+floor(highestPostRank / 5)`（皇帝 rank29 = +5）
- 战胜当月：`+10/次`；战败当月：`-15/次`
- 时代系数：治世 ×1.0 / 危世 ×0.8 / 乱世 ×0.6
- 结果 clamp `[0, 200]`

#### 1.2 新建 `engine/dynasty/legitimacyCalc.ts`（纯函数）

```ts
export function calcMonthlyLegitimacy(
  currentLegitimacy: number,
  isEmperor: boolean,
  era: Era,
): number
```

月度变化（微调）：
- 基础衰减：治世 -0.3 / 危世 -0.5 / 乱世 -0.8
- 皇帝加成：+1.0/月
- clamp `[0, 100]`

**大幅变化来自一次性事件**（在各自触发点直接修改 resources）：

| 事件 | legitimacy 变化 |
|------|-----------------|
| 宗法合法继承 | +30 |
| 绝嗣上交继承 | +10 |
| 皇帝册封（任命） | +15 |
| 武力夺取领地（战争胜利转移） | -15 |
| 篡位成功（Round 4） | -40 |
| 禅让继位（Round 4） | +20 |

#### 1.3 新建 `engine/systems/dynastySystem.ts`

```ts
export function runDynastySystem(date: GameDate): void
```

遍历所有存活 isRuler 角色，batchMutate 写入 prestige/legitimacy。

#### 1.4 修改 `engine/settlement.ts`

在 `socialSystem` 之后插入 `runDynastySystem`（新第5步）。

#### 1.5 修改 `warCalc.ts`

为 `'independence'` 添加明确代价：
- 治世：prestige -30, legitimacy -15
- 危世：prestige -15, legitimacy -5
- 乱世：prestige -5, legitimacy 0

#### 1.6 修改继承管线 `characterSystem.ts`

合法继承时给继承人 `legitimacy += 30`；绝嗣上交时 `+10`。

**文件清单**：

| 操作 | 文件 |
|------|------|
| 新建 | `engine/dynasty/prestigeCalc.ts` |
| 新建 | `engine/dynasty/legitimacyCalc.ts` |
| 新建 | `engine/systems/dynastySystem.ts` |
| 修改 | `engine/settlement.ts` |
| 修改 | `engine/military/warCalc.ts` |
| 修改 | `engine/systems/characterSystem.ts` — 继承 legitimacy 奖励 |

---

### Round 2：时代转换系统

**目标**：Era 根据全局指标自动切换，影响战争代价和后续叛乱阈值。

#### 2.1 新建 `engine/dynasty/eraCalc.ts`（纯函数）

```ts
export interface EraMetrics {
  activeWarCount: number;
  independentRulerRatio: number;  // 无 overlordId 的 isRuler / 总 isRuler
  emperorLegitimacy: number;
  averageRulerLegitimacy: number;
}

export function collectEraMetrics(
  characters: Map<string, Character>,
  wars: Map<string, War>,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): EraMetrics

export function calcEra(metrics: EraMetrics, currentEra: Era): Era
```

**混乱度评分（0-100）**：

```
chaos =
  activeWarCount × 8                       // 每场+8
  + independentRulerRatio × 30             // 独立比例，max+30
  + max(0, 50 - emperorLegitimacy) × 0.4  // 皇帝正统性不足，max+20
  + max(0, 40 - averageLegitimacy) × 0.5  // 平均正统性低，max+20
```

**转换阈值（带滞后防抖动）**：
- 治世 → 危世：chaos ≥ 30
- 危世 → 乱世：chaos ≥ 60
- 乱世 → 危世：chaos < 45
- 危世 → 治世：chaos < 15

#### 2.2 修改 `dynastySystem.ts`

月结尾部调用 `collectEraMetrics` + `calcEra`，若变化则：
- `set({ era: newEra })`（需在 TurnManager 添加 `setEra`）
- 发出 Major 事件

#### 2.3 修改 `TurnManager.ts`

添加 `setEra(era: Era): void`。

#### 2.4 修改 `economyCalc.ts`

领地产出乘以时代效率系数：治世 ×1.0 / 危世 ×0.9 / 乱世 ×0.75。

**文件清单**：

| 操作 | 文件 |
|------|------|
| 新建 | `engine/dynasty/eraCalc.ts` |
| 修改 | `engine/systems/dynastySystem.ts` |
| 修改 | `engine/TurnManager.ts` |
| 修改 | `engine/official/economyCalc.ts` |

---

### Round 3：NPC 自主叛乱（藩镇割据核心）

**目标**：节度使基于综合评分自主发起独立战争。

#### 3.1 新建 `engine/dynasty/rebellionCalc.ts`（纯函数）

```ts
export interface RebellionContext {
  prestige: number;
  legitimacy: number;
  personality: Personality;
  totalMilitary: number;
  opinionOfOverlord: number;
  overlordPrestige: number;
  overlordLegitimacy: number;
  overlordTotalMilitary: number;
  era: Era;
  isAtWar: boolean;
  overlordIsAtWar: boolean;
}

export interface RebellionScore {
  total: number;
  breakdown: Record<string, number>;
}

export function calcRebellionScore(ctx: RebellionContext): RebellionScore
export function getRebellionThreshold(era: Era): number
```

**叛乱评分公式**：

```
score =
  + clamp(-opinionOfOverlord × 0.25, -20, 30)     // 好感越低越想反
  + clamp((prestige - overlordPrestige) × 0.15, -10, 20)  // 威望超过领主
  + clamp((50 - overlordLegitimacy) × 0.3, -10, 15)       // 领主正统性低
  + clamp((militaryRatio - 0.35) × 60, -15, 25)   // 兵力优势
  + boldness × 15                                   // 胆识（最大权重）
  + (-honor × 10)                                   // 荣誉抑制
  + greed × 8                                        // 贪婪驱动
  + (overlordIsAtWar ? 10 : 0)                      // 趁虚而入
  + (isAtWar ? -40 : 0)                             // 不两线开战
```

其中 `militaryRatio = totalMilitary / (totalMilitary + overlordTotalMilitary)`。

**阈值**：治世 80 / 危世 55 / 乱世 35

叛乱决策是**确定性的**（超过阈值即叛乱，不掷骰），玩家可通过维护好感、展示兵力来预防。这与兵变的随机性不同，更有战略感。

#### 3.2 新建 `engine/npc/behaviors/rebellionBehavior.ts`

```ts
export function evaluateRebellions(date: GameDate): void
```

流程：
1. 遍历所有有 `overlordId` 的 isRuler NPC（持有 dao 级 grantsControl 岗位）
2. 对每个组装 `RebellionContext`，调用 `calcRebellionScore`
3. 超过阈值：
   - `char.overlordId = undefined`（宣布独立）
   - `declareWar(charId, overlordId, 'independence', controlledTerritoryIds, date)`
   - 扣除 `getWarCost('independence', era)` 的 prestige/legitimacy
   - Major 事件：「XX 宣布脱离 YY 独立！」
   - 对原领主好感 -30（叛乱）

#### 3.3 修改 `NpcEngine.ts`

在铨选逻辑之后调用 `evaluateRebellions(date)`。

**文件清单**：

| 操作 | 文件 |
|------|------|
| 新建 | `engine/dynasty/rebellionCalc.ts` |
| 新建 | `engine/npc/behaviors/rebellionBehavior.ts` |
| 修改 | `engine/npc/NpcEngine.ts` |

---

### Round 4：篡位 / 禅让 + 威望消耗闭环

**目标**：高阶政治交互，完成威望/正统性消耗闭环。

#### 4.1 新建 `engine/dynasty/usurpCalc.ts`（纯函数）

```ts
export function calcUsurpChance(
  playerPrestige: number,
  emperorPrestige: number,
  playerMilitary: number,
  emperorMilitary: number,
  courtSupportRatio: number,  // 好感>0 的中央岗位持有人比例
): { chance: number; breakdown: Record<string, number> }
```

公式：base 30 + 威望差(±15) + 兵力比(±20) + 朝中支持(0~20)，clamp [10, 85]。

#### 4.2 新建 `engine/interaction/usurpAction.ts`

**篡位前置条件** (`canUsurp`)：
1. target 是皇帝
2. player 持有宰相（`pos-zaixiang`）/ 枢密使（`pos-shumi`）/ 左右神策军中尉（`pos-shence-left`/`pos-shence-right`）之一
3. player.prestige ≥ 60
4. player 兵力 > 皇帝兵力
5. player 当前不在战争中

**执行**：
- 成功：
  - 皇帝岗位转给 player
  - 旧皇帝 legitimacy=0, prestige-30
  - 新皇帝 legitimacy-40, prestige+20
  - 全体角色好感 -20（「篡位者」，decayable: true）
  - Major 事件
- 失败：
  - player prestige-30，被免除所有岗位
  - 旧皇帝对 player 好感 -50（decayable: false）
  - Major 事件

#### 4.3 新建 `engine/interaction/abdicateAction.ts`

**禅让前置条件**：
1. player 是皇帝
2. target 持有 rank ≥ 20 的岗位
3. player.prestige ≥ 20

**执行**：
- 皇帝岗位 → target
- 旧皇帝 prestige-20
- 新皇帝 legitimacy+20, prestige+15
- 无负面好感（合法禅让）
- Major 事件

#### 4.4 新建 `engine/npc/behaviors/usurpBehavior.ts`

NPC 权臣篡位决策：
- 候选人：持有宰相/枢密使/神策军中尉的 NPC
- 评分类似叛乱，额外考虑朝中支持度
- 阈值：治世 90（几乎不可能）/ 危世 70 / 乱世 50
- 理性高的 NPC 皇帝在面对兵力劣势时可能选择主动禅让（篡位行为的子分支）

#### 4.5 威望消耗集成

- `demandFealtyAction.ts`：执行时消耗 prestige 10；`calcFealtyChance` 添加威望差因子（±10）
- `warSettlement.ts`：战争胜利时胜者 prestige +15，败者 -10

#### 4.6 交互类型

篡位/禅让都用 `paramType: 'none'`（无额外参数，直接对 target 执行），无需扩展 `InteractionParamType`。

**文件清单**：

| 操作 | 文件 |
|------|------|
| 新建 | `engine/dynasty/usurpCalc.ts` |
| 新建 | `engine/interaction/usurpAction.ts` |
| 新建 | `engine/interaction/abdicateAction.ts` |
| 新建 | `engine/npc/behaviors/usurpBehavior.ts` |
| 修改 | `engine/interaction/demandFealtyAction.ts` |
| 修改 | `engine/military/warSettlement.ts` |
| 修改 | `engine/npc/NpcEngine.ts` — 接入篡位评估 |

---

## 修改后月结顺序

```
1. characterSystem      — 死亡/继承（含 legitimacy 继承奖励）
2. NpcEngine            — 铨选 + 叛乱评估 + 篡位评估
3. populationSystem     — 人口
4. socialSystem         — 好感/贤能/晋升
5. dynastySystem (新)   — 威望/正统性月结 + 时代检查
6. economySystem        — 收支（含时代效率系数）
7. militarySystem       — 征兵/士气/兵变
8. warSystem            — 行军/战斗/围城
9. buildingSystem       — 建筑
```

---

## 关键设计决策

1. **正统性是事件驱动为主 + 月度微衰减**。避免正统性像弹球一样跳动。

2. **叛乱评分是确定性的**（不掷骰）。超过阈值就一定叛乱。玩家可通过维护好感、展示军力来防止，比随机更有战略感。

3. **篡位只对皇帝有效**。节度使之间的权力斗争通过叛乱（独立战争）实现。这符合晚唐历史——藩镇是割据独立，不是篡夺中央。

4. **时代转换有滞后带**（转入阈值 > 转出阈值），避免在临界值附近频繁切换。

5. **Round 1-2 不依赖 Round 3-4**。可以先上线威望/正统性/时代系统，观察数值是否合理后再接入叛乱和篡位。

---

## 全部新建文件清单

```
engine/dynasty/
├── prestigeCalc.ts      — 威望月度计算（纯函数）
├── legitimacyCalc.ts    — 正统性月度计算（纯函数）
├── eraCalc.ts           — 时代转换计算（纯函数）
├── rebellionCalc.ts     — 叛乱评分计算（纯函数）
└── usurpCalc.ts         — 篡位成功率计算（纯函数）

engine/systems/
└── dynastySystem.ts     — 月结：威望/正统性/时代

engine/npc/behaviors/
├── rebellionBehavior.ts — NPC 叛乱决策
└── usurpBehavior.ts     — NPC 篡位决策

engine/interaction/
├── usurpAction.ts       — 篡位交互
└── abdicateAction.ts    — 禅让交互
```

## 全部修改文件清单

```
engine/settlement.ts              — 插入 dynastySystem
engine/TurnManager.ts             — 添加 setEra
engine/systems/characterSystem.ts — 继承 legitimacy 奖励
engine/military/warCalc.ts        — independence 代价
engine/official/economyCalc.ts    — 时代效率系数
engine/npc/NpcEngine.ts           — 接入叛乱/篡位评估
engine/interaction/demandFealtyAction.ts — 威望因子
engine/military/warSettlement.ts  — 战胜/败 prestige 变化
```

---

## 验证计划

每个 Round 完成后：
1. `npx vitest run` 通过现有测试
2. 为新增纯函数写单元测试（`__tests__/dynasty.test.ts`）
3. `pnpm build` 无 TypeScript 错误
4. `pnpm dev` 运行游戏，推进数月观察数值变化
