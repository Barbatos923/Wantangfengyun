# Phase 4C — 王朝兴衰机制：系统设计与代码实现方案

> 版本：v1.0 | 日期：2026-03-31
> 本文档供 Claude Code 在后续实现阶段作为核心参考。

---

## 第一部分：系统设计

### 1. 核心设计理念：“唯器与名，不可以假人”

在《晚唐风云》中，**正统性（Legitimacy）**不再是一个空洞的数值或仅靠仪式获取的资源。天朝的正统性深深植根于其复杂的**官职本位体系**中。正统性代表了“名器”，是国家机器对个人地位的背书。

正统性是一种**极难获取、极易流失、且至关重要**的战略资源。它与角色的品位、职位、爵位、勋阶深度绑定，形成一套严密的逻辑闭环。

### 2. 正统性的生成机制（与官职系统挂钩）

正统性的数值框架（0~100）由以下四个维度共同构建：

#### 2.1 品位（Rank）：决定正统性的“上限”
品位代表了角色在官僚体系中的绝对阶级，决定了其正统性的**最大上限（Cap）**。
*   **九品**（level 1~4）：上限 60
*   **八品**（level 5~8）：上限 65
*   **七品**（level 9~12）：上限 70
*   **六品**（level 13~16）：上限 75
*   **五品**（level 17~20）：上限 80
*   **四品**（level 21~24）：上限 85
*   **三品**（level 25~26）：上限 90
*   **二品**（level 27~28）：上限 95
*   **一品**（level 29）：上限 100

#### 2.2 职位（Position）：提供正统性的“保底刷新”与“预期值”
职位代表了朝廷授予的实际权力与认可。每个职位都有一个**基础正统性（baseLegitimacy）**。
*   **机制**：当角色**获得该职位时**，如果其当前正统性低于该职位的基础值，则**瞬间刷新（提升）**至该基础值。
*   **分档规则**：
    *   **皇帝**（pos-emperor）：95
    *   **五品及以上职位**（minRank ≥ 17）：80
    *   **六品及以下职位**（minRank ≤ 16）：60

#### 2.3 爵位与勋阶（待建）
*   **爵位（Nobility）**：提供正统性的“月度增益”（如县男 +0.5/月，国公 +2/月）。
*   **勋阶（Honor）**：提供正统性的“一次性爆发”（如获封上柱国 +30）。

### 3. 时代衰减与传导闭环

正统性在不同的时代背景下，其维持成本截然不同。

#### 3.1 时代状态对正统性的影响
*   **治世**：正统性自然流失极慢（每月 0），代表天下承平，名器稳固。
*   **危世**：正统性每月自然流失（每月 -0.33，即每 3 个月 -1）。皇帝什么都不做，约 10 年后正统性跌破 60。
*   **乱世**：正统性加速崩溃（每月 -1）。皇帝什么都不做，约 3 年后正统性跌破 60。

#### 3.2 正统性对好感度的传导（预期差值）
正统性的核心价值在于：它是**影响所有人好感度的通用 Buff/Debuff**。
设 B 的当前正统性为 `L`，B 当前最高职位的预期正统性为 `E`（60、80 或 95），**差值 `D = L - E`**：

| 差值 D | 好感度修正 | 含义 |
|--------|-----------|------|
| D ≥ +10 | **+10** | 德高望重，远超预期，天下归心 |
| 0 ≤ D < +10 | **0** | 名副其实，不功不过 |
| -10 ≤ D < 0 | **-5** | 略显不足，小有微词 |
| -20 ≤ D < -10 | **-15** | 明显不足，人心浮动 |
| -30 ≤ D < -20 | **-30** | 严重不足，离心离德 |
| D < -30 | **-50** | 名器尽失，众叛亲离 |

**传导逻辑闭环**：
危世降临 → 时代 Debuff 导致正统性每月持续流失 → 正统性跌破预期 → 触发全局好感度惩罚 → 封臣离心，拒绝上缴赋税，甚至发动叛乱 → 叛乱和财政危机进一步推动“危世→乱世”的进度条。

### 4. 任务驱动型状态机（骨架）

时代切换不再是单轴线性温度计，而是基于**进度条**的任务驱动型状态机。
*   **稳定进度（stabilityProgress）**：0~100。达到 100 时，时代向好的一面切换（乱世→危世，危世→治世）。
*   **崩溃进度（collapseProgress）**：0~100。达到 100 时，时代向坏的一面切换（治世→危世，危世→乱世）。
*   进度条的增减由具体的**任务完成/失败**（如平定叛乱、财政破产）驱动（具体诱因留待后续实现）。

---

## 第二部分：代码实现设计

### 1. 数据结构扩展

#### 1.1 `data/ranks.ts` & `engine/official/types.ts`
*   在 `RankDef` 接口中新增 `legitimacyCap: number`。
*   在 `ALL_RANKS` 数组中，根据上述品位分档规则，为每个品位硬编码 `legitimacyCap`。

#### 1.2 `data/positions.ts` & `engine/official/types.ts`
*   在 `PositionTemplate` 接口中新增可选字段 `baseLegitimacy?: number`。
*   在 `ALL_POSITIONS` 数组中，根据分档规则（皇帝 95，minRank≥17 为 80，其他 60）硬编码 `baseLegitimacy`。

#### 1.3 `engine/types.ts`
*   新增 `EraProgress` 接口：
    ```typescript
    export interface EraProgress {
      era: Era;
      stabilityProgress: number;
      collapseProgress: number;
    }
    ```

### 2. 新增核心纯函数库：`engine/official/legitimacyUtils.ts`

实现以下纯函数：
*   `getPositionBaseLegitimacy(tpl: PositionTemplate): number`
*   `getRankLegitimacyCap(rankLevel: number): number`
*   `getCharacterExpectedLegitimacy(charId: string, territories: Map<string, Territory>, centralPosts: Post[]): number`
*   `calcLegitimacyOpinionModifier(targetLegitimacy: number, expectedLegitimacy: number): number` （实现上述分段函数）
*   `calcMonthlyLegitimacyDecay(era: Era, month: number): number` （实现治世 0，危世每 3 个月 -1，乱世每月 -1）
*   `clampLegitimacy(value: number, cap: number): number`

### 3. 现有模块改造

#### 3.1 `engine/character/characterUtils.ts`
*   修改 `calculateBaseOpinion` 和 `getOpinionBreakdown`，新增可选参数 `bExpectedLegitimacy?: number`。
*   在函数内部，如果 `bExpectedLegitimacy` 存在且大于 0，调用 `calcLegitimacyOpinionModifier` 计算正统性修正项，并累加到总好感度中。

#### 3.2 `engine/systems/socialSystem.ts`
*   在 `runSocialSystem` 中，调用 `calcMonthlyLegitimacyDecay` 获取当前时代的衰减量。
*   如果衰减量不为 0，在 `charStore.batchMutate` 中遍历所有存活角色，扣除正统性，并使用 `clampLegitimacy` 确保不超过其品位上限。

#### 3.3 `engine/interaction/appointAction.ts`
*   在 `executeAppoint` 函数中，在好感修正（步骤 4）之后，新增**正统性刷新**逻辑。
*   获取被任命职位的 `baseLegitimacy`，如果被任命者当前正统性低于该值，则通过 `charStore.addResources` 将其提升至该值（受限于品位上限）。

#### 3.4 `engine/TurnManager.ts`
*   在 Store 状态中新增 `eraProgress: EraProgress`，初始值为 `{ era: Era.WeiShi, stabilityProgress: 0, collapseProgress: 0 }`。
*   新增 action：`setEra(era: Era)`、`setEraProgress(progress: EraProgress)`、`addEraProgress(delta: { stability?: number; collapse?: number })`。

#### 3.5 新增 `engine/systems/eraSystem.ts`
*   实现 `runEraSystem(date: GameDate)`，每月检查 `eraProgress`。
*   如果 `stabilityProgress >= 100` 或 `collapseProgress >= 100`，触发时代切换，并重置进度条。
*   在 `engine/settlement.ts` 中，将 `runEraSystem` 加入月结管线，置于 `runSocialSystem` 之后。

### 4. 后续工作（不在本次实现范围内）
*   爵位和勋阶系统的具体实现。
*   时代进度条的具体任务诱因（如财政破产触发 `addEraProgress({ collapse: 20 })`）。
*   UI 层的时代状态显示和正统性进度条展示。
