# CK3 AI 权重设计模式参考（对《晚唐风云》的启示）

通过对十字军之王3（CK3）核心决策文件（特别是 `major_decisions`、`minor_decisions`、`court_decisions` 以及 TGP 中国扩展包）的分析，我们提取了 Paradox 在设计 AI 行为权重（`ai_will_do`）时的核心模式。这些模式对《晚唐风云》Phase 6 的 NPC Engine 权重设计具有极高的参考价值。

## 一、基础架构：Base + Modifiers 模式

CK3 的所有 AI 决策都遵循一个极其标准化的结构：**基础值（Base） + 修正项（Modifiers）**。

### 1. 基础值（Base）的设定哲学

基础值决定了该行为的**默认倾向**。CK3 中常见的基础值设定有三种：

*   **Base = 100**：默认倾向于执行。通常用于"有益无害"的常规操作（如举办宴会、进行朝圣、参加科举）。AI 只要条件允许就会去做，除非被负面修正项压制。
*   **Base = 0**：默认不执行。通常用于"高风险"或"特殊情境"的操作（如自杀、宣战、独立叛乱）。AI 只有在特定条件（如极度贪婪、极度绝望、实力绝对碾压）下，累积了足够的正面修正项才会去执行。
*   **Base = 负数（如 -40）**：强烈抵制。用于极度危险或破坏现状的行为（如撕毁盟约、脱离帝国）。AI 需要极端的刺激才能克服这个负基础值。

**对《晚唐风云》的启示**：
在我们的 `NpcBehavior` 中，`weight` 的初始计算也应遵循此逻辑。例如，`buildBehavior`（建设）的基础权重可以是 50，而 `declareWarBehavior`（宣战）的基础权重应该是 0 甚至负数。

### 2. 修正项（Modifiers）的叠加机制

CK3 使用 `modifier` 块来叠加权重，主要有两种运算方式：

*   **加法（add）**：最常用的方式。例如 `add = 25` 或 `add = -50`。加法的好处是线性可控，多个因素可以平缓地累加。
*   **乘法（factor）**：用于"一票否决"或"绝对放大"。最典型的是 `factor = 0`，这在 CK3 中被大量用于**硬性否决**（例如：如果目标是玩家，或者如果自己是无嗣之君，则绝对不建立分支家族）。

**对《晚唐风云》的启示**：
我们的 `weight` 计算公式应该采用 `Base + Sum(AddModifiers) * Product(FactorModifiers)` 的结构。特别要引入 `factor = 0` 的概念，用于处理"绝对不可能发生"的逻辑边界。

## 二、人格驱动：特质与 AI 值的映射

CK3 的 AI 决策深度绑定了角色的人格。它通过两种方式将人格映射到行为权重：

### 1. 离散特质映射（has_trait）

这是最直接的映射方式。如果角色拥有某个特定特质，直接加减权重。

```text
modifier = {
    add = 30
    has_trait = depressed  # 抑郁特质增加自杀倾向
}
modifier = {
    add = -25
    has_trait = content    # 满足特质减少野心行为
}
```

### 2. 连续 AI 值映射（ai_value_modifier）

CK3 底层有六个核心 AI 连续值（Boldness, Compassion, Greed, Honor, Rationality, Vengefulness, Zeal, Energy），这与《晚唐风云》的八维人格高度一致。CK3 会将这些连续值按比例转化为权重。

```text
ai_value_modifier = {
    ai_greed = 0.35      # 贪婪值每高 1 点，权重增加 0.35
    ai_boldness = 0.35   # 胆识值每高 1 点，权重增加 0.35
}
```

有时也会用阈值判断：

```text
modifier = {
    ai_boldness >= high_positive_ai_value
    add = 45
}
```

**对《晚唐风云》的启示**：
我们的八维人格（0-100）可以直接作为乘数或加数。例如，在 `declareWarBehavior` 中，可以设定 `weight += (boldness - 50) * 0.5`。胆识高于 50 的人更倾向于宣战，低于 50 的人则会扣减权重。

## 三、关系驱动：好感度与实力对比

除了内在人格，外部环境（关系和实力）是决定 AI 行为的另一大支柱。

### 1. 好感度修正（opinion_modifier）

CK3 会直接将目标角色的好感度按比例转化为权重修正。

```text
opinion_modifier = {
    opinion_target = liege
    multiplier = -0.15   # 对领主的好感度每高 1 点，叛乱权重减少 0.15
}
```

### 2. 实力对比修正（compare_modifier）

在涉及对抗的行为（如叛乱、宣战）中，CK3 会比较双方的实力（如兵力、领地大小）。

```text
compare_modifier = {
    value = sub_realm_size
    multiplier = 1       # 自身领地越大，叛乱倾向越高
}
```

**对《晚唐风云》的启示**：
在 `demandFealtyBehavior`（要求效忠）和 `declareWarBehavior`（宣战）中，必须引入 `opinion` 和 `militaryStrength` 的对比。例如，对目标好感度 > 50 时，宣战权重 `factor = 0`（除非有极端的"背信弃义"人格）；己方兵力是对方 2 倍以上时，宣战权重 `add = 50`。

## 四、资源驱动：金钱与威望的考量

在涉及资源消耗的行为（如赏赐、举办活动）中，CK3 的 AI 会严格评估自身的经济状况。

```text
modifier = { # AI's who can give gold are more likely
    add = 50
    gold >= medium_gold_value
    ai_greed < 50
}
```

这个逻辑非常经典：**只有当钱足够多（`gold >= medium`）且人不贪财（`ai_greed < 50`）时，AI 才会乐于花钱**。

**对《晚唐风云》的启示**：
在 `rewardBehavior`（赏赐）和 `buildBehavior`（建设）中，必须加入资金阈值判断。如果国库空虚，即使士气低落，AI 也不会赏赐；如果君主极度贪婪（`greed > 80`），即使国库充盈，他也会拒绝拨款建设。

## 五、总结：构建《晚唐风云》的权重公式

综合 CK3 的设计模式，我们在实现 Phase 6 的 `NpcBehavior` 时，`weight` 的计算应遵循以下标准化模板：

1.  **设定 Base Weight**：根据行为的性质设定初始值（常规行为 50，激进行为 0）。
2.  **计算 Personality Modifiers**：提取相关的八维人格，转化为加减项。
3.  **计算 Resource Modifiers**：检查金钱、兵力等硬性资源，资源不足时 `factor = 0`，资源充裕时 `add` 权重。
4.  **计算 Relational Modifiers**：引入好感度（Opinion）和正统性（Legitimacy）的修正。
5.  **应用 Hard Limits**：对于绝对不应发生的情况（如向盟友宣战），应用 `factor = 0`。

这种结构化的权重设计，将使《晚唐风云》的 NPC 表现出极高的逻辑性和历史沉浸感。
