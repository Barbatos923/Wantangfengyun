# CK3 计谋系统拆解：系统设计与代码实现

## 1. 文档目的

本文不是为《晚唐风云》设计的新系统，而是专门回答一个问题：

`Crusader Kings III (CK3) 自己是如何完成计谋系统的？`

因此本文聚焦两部分：

- 系统设计：CK3 计谋系统的整体目标、分类、数值、循环与模块边界。
- 代码实现：CK3 游戏文件中，计谋系统分别由哪些脚本目录、定义文件、事件文件、交互文件、修正器文件和 GUI 文件共同实现。

本文基于本机 CK3 安装目录中的真实文件结构进行拆解，但不直接抄录 Paradox 原始源码，而是用结构化说明和等价伪代码重建其实现逻辑。

## 2. 结论先行：CK3 计谋系统的本质

CK3 的计谋系统不是“几种独立玩法”，而是一套统一的行动框架。

它的设计核心是：

- 用一套通用 `Scheme Type` 模板承载几十种计谋。
- 用统一的 `Character Interaction` 作为发起入口。
- 用统一的数值层处理速度、成功率、隐秘度、暴露、代理人和反制。
- 用事件系统承载具体叙事和玩家选择。
- 用 GUI 层把这些运行态组织成“底部栏中的可持续行动”。

所以 CK3 的计谋系统不是“事件堆起来的剧情系统”，而是“模板驱动 + 事件填充”的混合架构。

## 3. CK3 的整体实现架构

从代码和文件组织上看，CK3 的计谋系统可以拆成 8 层：

1. 定义层：计谋类型是什么。
2. 入口层：玩家和 AI 如何发起计谋。
3. 运行态层：计谋实例在运行时维护哪些数据。
4. 数值层：成功、隐秘、阶段长度、成长、预测是怎么计算的。
5. 代理人层：哪些人能加入，加入后提供什么贡献。
6. 反制层：目标一侧如何布置长期防御。
7. 事件层：计谋推进过程中发生什么叙事分支。
8. 表现层：计谋窗口、事件窗口、提示文本和 HUD 展示。

对应的核心文件大致如下：

- 计谋定义
  - `game/common/schemes/scheme_types/*.txt`
  - `game/common/schemes/scheme_types/_schemes.info`
- 角色交互入口
  - `game/common/character_interactions/00_scheme_interactions.txt`
  - `game/common/character_interactions/00_invite_agent_to_scheme.txt`
- 代理人定义
  - `game/common/schemes/agent_types/agent_types.txt`
- 反制定义
  - `game/common/schemes/scheme_countermeasures/00_basic_countermeasures.txt`
- 通用脚本值
  - `game/common/script_values/00_scheme_values.txt`
- 通用修正器
  - `game/common/scripted_modifiers/00_scheme_scripted_modifiers.txt`
- 通用触发器
  - `game/common/scripted_triggers/00_scheme_triggers.txt`
- 通用效果
  - `game/common/scripted_effects/00_scheme_scripted_effects.txt`
- 事件实现
  - `game/events/scheme_events/**`
- GUI
  - `game/gui/window_intrigue_potential_scheme_agent.gui`
  - `game/gui/event_window_widgets/event_window_widget_scheme.gui`
  - `game/gui/event_window_widgets/event_window_widget_scheme_preparations.gui`
  - `game/gui/event_windows/scheme_*.gui`
- 全局 define
  - `game/common/defines/00_defines.txt`

## 4. 计谋系统的核心设计目标

CK3 的计谋系统至少承担了 6 个设计任务：

- 把长期行动从“一次点击结算”变成“持续推进中的政治行动”。
- 给宫廷与人际冲突提供持续叙事空间。
- 让角色能力、特质、关系、资源、顾问、文化、宗教都能影响行动结果。
- 给玩家一种“经营阴谋”的感觉，而不是只看一次随机数。
- 给 AI 提供持续可评估的软性手段，而不只是宣战。
- 给 DLC 和后续扩展留模板化扩展点。

## 5. 定义层：Scheme Type 是怎么建模的

CK3 对每个计谋采用一份独立定义文件，例如：

- `murder_scheme.txt`
- `sway_scheme.txt`
- `fabricate_hook_scheme.txt`
- `claim_throne_scheme.txt`

所有计谋都遵循 `_schemes.info` 中描述的统一结构。

### 5.1 Scheme Type 主要字段

CK3 中一个计谋类型大体包含这些字段：

- `skill`
  该计谋主要依赖哪项能力，例如 `intrigue`、`diplomacy`、`learning`。
- `category`
  计谋所属大类，例如 `hostile`、`personal`、`political`、`contract`。
- `target_type`
  目标类型，可以是 `character`、`title`、`culture`、`faith` 等。
- `is_secret`
  是否启用隐秘度与暴露机制。
- `is_basic`
  是否是基础计谋。基础计谋通常不使用代理人、机会点和复杂筹备。
- `uses_resistance`
  是否让目标方能力和防守进入阶段速度对抗。
- `allow`
  发起条件。
- `valid`
  运行中有效性条件。每天检查，不满足则计谋失效。
- `base_success_chance`
  起始成功率公式。
- `base_secrecy`
  起始隐秘度公式。
- `speed_per_skill_point`
  发起者技能每点带来的阶段加速。
- `speed_per_target_skill_point`
  目标技能每点带来的阶段阻力。
- `success_chance_growth_per_skill_point`
  每轮完成后成长的成功率。
- `base_progress_goal`
  单阶段基础长度。
- `base_maximum_success`
  未计入代理人前的基础成功率上限。
- `maximum_breaches`
  最多允许多少次暴露裂痕。
- `on_start`
  计谋启动时效果。
- `on_phase_completed`
  阶段完成时效果。
- `on_monthly`
  每月执行的逻辑。
- `on_invalidated`
  计谋失效或中断时逻辑。

### 5.2 基础计谋与复杂计谋

CK3 很聪明地把计谋分成两种模式：

#### 基础计谋

例如：

- `sway`
- `befriend`
- `learn_language`

特点：

- `is_basic = yes`
- 通常 `uses_resistance = no`
- 没有代理人配置
- 没有机会点蓄力
- 周期结束后直接进行一次成功/失败掷骰

#### 复杂计谋

例如：

- `murder`
- `abduct`
- `fabricate_hook`
- `claim_throne`

特点：

- 有隐秘度与月度暴露
- 有代理人槽位
- 有起始代理包
- 有机会点、筹备阶段和关键时刻事件
- 在阶段完成后进入“准备界面”，而不是直接结算

也就是说，CK3 用一套大框架同时兼容了“轻量关系行动”和“重量阴谋行动”。

## 6. 入口层：CK3 如何发起计谋

CK3 中计谋不是直接从计谋文件启动，而是从 `character_interactions` 层发起。

核心文件：

- `game/common/character_interactions/00_scheme_interactions.txt`

例如谋杀计谋的入口：

- `start_murder_interaction`

这个交互定义负责：

- 决定该动作是否显示在互动菜单中。
- 检查 `can_start_scheme`。
- 给玩家展示开局选项。
- 在 `on_accept` 中真正调用 `begin_scheme_with_agents_effect`。

### 6.1 为什么 CK3 用 Interaction 作为入口

因为这样一来，计谋就自动共享了角色互动系统已有的：

- 可见性控制
- 灰显原因提示
- AI 发起判断
- 互动图标和分类
- 玩家点击反馈

这意味着计谋从一开始就不是单独系统，而是角色互动系统的一个长期行动分支。

### 6.2 起始代理包

复杂计谋的一个非常重要设计，是在交互界面里直接提供“起始代理包”。

以谋杀为例，玩家可以在发起时选择：

- 平衡
- 偏成功
- 偏速度
- 偏隐秘

这些选项并不直接改一个概率，而是决定启动时插入哪些 `agent_slot`。这非常关键，因为它让“玩法倾向”变成了系统层配置，而不是 UI 装饰。

## 7. 运行态：CK3 的计谋实例在运行中维护什么

一个正在运行的 CK3 计谋实例，逻辑上至少维护以下状态：

- 所有者 `scheme_owner`
- 目标 `scheme_target_*`
- 计谋类型 `scheme_type`
- 当前进度 `scheme_progress`
- 当前阶段长度 `scheme_phase_duration`
- 当前成功率 `scheme_success_chance`
- 当前隐秘度 `scheme_secrecy`
- 成功率上限 `max_scheme_success_chance`
- 当前 breach 次数
- 是否已暴露
- 机会点 `scheme_agent_charges`
- 代理人槽位及已填充代理人
- 各类临时变量与事件标记

这些状态不是都写在单个文本文件里，而是由引擎原生 scheme 对象 + 脚本值 + scheme modifiers + variables 共同构成。

## 8. 数值层：CK3 是怎样计算计谋的

CK3 的计谋系统不是“单个成功率”，而是至少包含 4 个互相独立的数值维度：

- 阶段推进速度
- 最终成功率
- 成功率上限
- 隐秘度

### 8.1 阶段推进速度

复杂计谋的阶段时长由这些因子共同决定：

- `base_progress_goal`
- 发起者主属性
- 目标主属性
- 发起者间谍总管能力
- 目标间谍总管能力
- 目标头衔等级
- scheme modifiers
- 代理人的速度贡献

CK3 将这一层抽象成“speed vs resistance”的关系。

也就是说：

- 你的速度高，阶段更快完成。
- 目标抗性高，阶段更慢。
- 不是直接加成最终成功率，而是影响你多快进入下一轮筹备或结算。

### 8.2 起始成功率

`base_success_chance` 是一个复合公式块。

它通常会引用：

- 主要能力值
- 特质修正
- 关系修正
- 头衔修正
- 宗教文化修正
- Lifestyle perk 修正
- House / Dynasty 修正
- Countermeasure 修正

每个计谋都能重写自己的成功公式，因此：

- `sway` 强依赖外交和既有好感。
- `murder` 强依赖谋略与敌对环境。
- `claim_throne` 同时依赖学识、谋略与宫廷位置。

### 8.3 成功率上限

CK3 的一个重要平衡点是：

`成功率` 和 `成功率上限` 分离。

例如复杂计谋往往基础上限只有 20~40 左右，然后通过：

- 代理人
- 特定事件结果
- 特定角色和关系
- 计谋修正器

把上限进一步抬高。

这样做的好处是：

- 阴谋不会因为主属性高就轻易 95%。
- 玩家必须经营环境，而不只是堆属性。
- 代理人和筹备阶段真的有意义。

### 8.4 成功率成长

复杂计谋每轮阶段完成后，并不是立刻掷骰，而是：

- 获得一定成功率成长
- 获得机会点
- 进入新的筹备状态
- 触发继续经营的事件或界面

因此 CK3 的复杂计谋更像“持续经营直到你决定执行”，而不是“时间到自动结算”。

### 8.5 隐秘度

`scheme_secrecy` 决定每月被发现的风险。

隐秘度来源包括：

- 基础值 `secrecy_base_value`
- 目标宫廷间谍总管是否在执行 `disrupt_schemes`
- 代理人数目和类型
- 代理人中是否有专门提供 secrecy 的角色
- 反制措施
- 计谋修正器
- 事件结果

CK3 的隐藏逻辑是：

- 复杂计谋的隐秘度会随着代理构成与外部环境动态变化。
- 隐秘度越低，每月越容易出现 breach。
- 暴露不是一次性失败，而是逐步裂解。

### 8.6 Odds Prediction

CK3 在发起计谋时会向玩家展示一个“赔率预测”，但它不是实际成功率，而是一个粗粒度估计。

这层值独立定义在 `odds_prediction` 中。

它的作用是：

- 给玩家提供方向感。
- 但不暴露全部真实计算。
- 保留不确定性和戏剧性。

## 9. 代理人层：CK3 如何实现 Agent System

代理人系统是 CK3 复杂计谋最有辨识度的一层。

核心文件：

- `game/common/schemes/agent_types/agent_types.txt`
- `game/common/character_interactions/00_invite_agent_to_scheme.txt`

### 9.1 代理人不是“额外人物”，而是“槽位 + 贡献类型”

CK3 的代理人有不同 `contribution_type`，例如：

- `success_chance`
- `success_chance_max`
- `success_chance_growth`
- `speed`
- `secrecy`

这意味着一个代理人的设计核心不是“是谁”，而是“为当前阴谋解决哪一类问题”。

例如：

- 刺客更擅长提升成功上限。
- 望风者更擅长提升隐秘度。
- 潜入者更擅长提高速度。
- 特定关系型代理人会影响成长或结果事件。

### 9.2 代理人贡献的计算方式

CK3 代理人的能力不是只看一个技能，而是综合：

- 相关属性
- 人格特质
- 与目标关系
- 是否宿敌/亲族/同党
- 某些文化参数
- 某些特殊身份

比如 `agent_assassin` 会在以下条件下特别强：

- 高谋略
- 高武勇
- `sadistic`
- `vengeful` 且目标是宿敌

反过来，如果角色 `compassionate` 或 `honest`，则会显著削弱其作为某些代理人的适配度。

这让代理人系统天然和角色扮演系统耦合，而不是单纯数值雇佣兵。

### 9.3 拉拢代理人的成本模型

CK3 不要求所有代理人都“免费加入”。

`00_invite_agent_to_scheme.txt` 里，拉拢代理人可以通过以下方式：

- 贿赂金钱
- 更大额贿赂
- 送人情钩子
- 用已有钩子强迫
- 花机会点
- 花威望
- 花虔诚
- 给予头衔、合同或政治利益

这意味着 CK3 的代理人系统同时也是一个“社会交易系统”。

## 10. 反制层：CK3 如何实现 Countermeasure System

这是 CK3 计谋系统后期重构中非常关键的一层。

核心文件：

- `game/common/schemes/scheme_countermeasures/00_basic_countermeasures.txt`
- `game/common/scripted_modifiers/00_scheme_scripted_modifiers.txt`

### 10.1 反制的设计目标

反制不是“计谋免疫”，而是“防守方长期部署的环境性修正”。

它用于解决一个老问题：

- 如果复杂计谋只靠主动方经营，那么防守方几乎没有长期策略。
- 加入反制后，目标方宫廷可以主动提高防御环境。

### 10.2 反制参数化的实现方式

CK3 的反制不是写死在每个计谋里，而是通过“参数标记”驱动。

例如反制文件中会声明：

- 针对所有 scheme 的 secrecy bonus
- 针对 calculated / opportunistic / indirect / political 等类别的成功率修正
- 是否属于预防型或攻击型反制

然后计谋在自己的 `on_start` 里设置：

- `apply_countermeasures = calculating`
- 或 `indirect`
- 或其他类别

最后 `scripted_modifiers` 再根据这个类别去匹配目标宫廷当前部署的反制参数，并把修正应用到成功率或隐秘度上。

这是一个非常标准的“标签驱动规则层”实现。

## 11. 事件层：CK3 如何把计谋做成有戏的玩法

计谋系统的事件实现位于：

- `game/events/scheme_events/**`

这里大致分成几类：

- ongoing events
- outcome events
- discovery events
- critical moments
- preparations events
- invalidation / maintenance events

### 11.1 ongoing events

这类事件负责在月度推进中制造局部波动。

例如谋杀计谋的 `murder_ongoing_events.txt` 中，会处理：

- 某个代理人酒后失控
- 是否鼓励代理人继续冒险
- 是稳妥收手还是加速推进
- 会不会因此增加进度、提高暴露、牺牲某个代理人

这类事件的作用是：

- 把静态条形数值打散成动态故事。
- 把数值变化和角色行为绑定起来。
- 让玩家在过程中持续参与，而不是挂机等结果。

### 11.2 critical moments

这类事件负责“复杂计谋阶段完成后的关键抉择”。

对应文件：

- `scheme_critical_moments_events.txt`

这里的逻辑本质上是：

- 你已经经营到一个阶段节点。
- 现在决定要不要执行、再拉人、再花机会点、还是重新洗一轮。

它是 CK3 复杂计谋“准备界面”的事件化实现。

### 11.3 discovery events

对应文件：

- `hostile_scheme_discovery_events.txt`

它负责处理：

- 发现的是代理人，还是主谋。
- 发现后是指控、关押、放人、敲诈，还是继续放线。
- 暴露会不会反向生成新钩子和新仇怨。

也就是说，暴露本身也是一个互动玩法，不只是失败提示框。

## 12. 表现层：CK3 如何把复杂计谋展示出来

相关文件：

- `window_intrigue_potential_scheme_agent.gui`
- `event_window_widget_scheme.gui`
- `event_window_widget_scheme_preparations.gui`
- `scheme_preparations_event.gui`
- `scheme_successful_event.gui`
- `scheme_failed_event.gui`

GUI 层完成这些工作：

- 在互动菜单中展示计谋入口。
- 在底部栏展示当前计谋及其进度。
- 在事件窗口内嵌显示当前 scheme widget。
- 在筹备界面里展示代理槽位和机会点。
- 在成功 / 失败 / 暴露时给出统一视觉反馈。

这层设计说明：

CK3 并没有给计谋单独做一整套完全独立的 UI，而是把计谋深度嵌入角色互动窗口、事件窗口和底部 HUD 中。

## 13. 代表性实现 1：Murder

代表文件：

- `game/common/schemes/scheme_types/murder_scheme.txt`
- `game/events/scheme_events/murder_scheme/*`
- `game/common/character_interactions/00_scheme_interactions.txt`

### 13.1 Murder 的系统特征

- `category = hostile`
- `is_secret = yes`
- `maximum_breaches = 5`
- 复杂计谋，不是 basic scheme
- 使用代理人槽位
- 使用起始机会点
- 使用月度暴露
- 每阶段完成后进入筹备事件

### 13.2 Murder 的运行逻辑

Murder 的完整流程大致是：

1. 从互动菜单发起。
2. 选择起始代理包。
3. `on_start` 设置反制类别为 `calculating`。
4. 给出默认代理槽位。
5. 添加起始机会点。
6. 每月触发：
   - 暴露检查
   - ongoing 事件
7. 阶段完成时：
   - 打开 murder preparations / critical moment
   - 玩家决定继续经营或执行
8. 在执行窗口中掷最终成功。
9. 若失败或暴露，则进入发现 / 拦截 / 揭发后果链。

Murder 是 CK3 最完整展示其复杂计谋框架的案例。

## 14. 代表性实现 2：Sway

代表文件：

- `game/common/schemes/scheme_types/sway_scheme.txt`
- `game/events/scheme_events/sway_scheme/*`

### 14.1 Sway 的系统特征

- `is_basic = yes`
- `uses_resistance = no`
- 无代理人
- 无机会点
- 无复杂筹备
- 阶段一完成就直接 success / failure 掷骰

### 14.2 为什么 Sway 很重要

Sway 展示了 CK3 的另一个系统设计思想：

不是所有长期行动都必须有“复杂筹备 + 代理人”。

通过 basic scheme 模式，CK3 可以非常低成本地扩展大量社交型长期行动，而无需每个都做成谋杀级复杂度。

## 15. 代表性实现 3：Fabricate Hook

代表文件：

- `game/common/schemes/scheme_types/fabricate_hook_scheme.txt`
- `game/events/scheme_events/fabricate_hook_scheme/*`

### 15.1 Fabricate Hook 的系统特征

- `category = hostile`
- `is_secret = yes`
- 使用代理人
- 使用月度暴露
- 反制类别是 `indirect`

这非常值得注意，因为它说明 CK3 并不是简单把所有 hostile scheme 都塞进同一套防守逻辑，而是进一步按子类型区分：

- calculating
- opportunistic
- indirect
- political

然后再分别吃不同 countermeasure。

这就是 CK3 计谋系统“可扩展而不散架”的关键之一。

## 16. CK3 计谋系统的等价伪代码实现

下面的伪代码不是 Paradox 原始脚本，而是根据其真实文件结构重建出来的“等价实现逻辑”。

### 16.1 发起计谋

```ts
function startScheme(interaction, owner, target, selectedStarterPackage) {
  if (!canStartScheme(interaction.schemeType, owner, target)) {
    return fail('invalid');
  }

  const scheme = createSchemeInstance({
    type: interaction.schemeType,
    owner,
    target,
    progress: 0,
    breaches: 0,
    exposed: false,
  });

  applySchemeOnStart(scheme);
  applyStarterAgentPackage(scheme, selectedStarterPackage);
  addStartingOpportunities(scheme);
  registerScheme(scheme);

  return scheme;
}
```

### 16.2 每月推进

```ts
function tickSchemeMonthly(scheme) {
  if (!scheme.isValid()) {
    scheme.invalidate();
    return;
  }

  if (scheme.isSecret) {
    runMonthlyDiscoveryCheck(scheme);
  }

  fireOngoingEventPool(scheme);
  addProgressFromSpeedVsResistance(scheme);

  if (scheme.progress >= scheme.phaseDuration) {
    scheme.progress = 0;
    scheme.completePhase();
  }
}
```

### 16.3 阶段完成

```ts
function completeSchemePhase(scheme) {
  scheme.successChance += calcGrowthFromSkillAndModifiers(scheme);
  scheme.successChance = clamp(scheme.successChance, scheme.minSuccess, scheme.maxSuccess);

  if (scheme.isBasic) {
    rollImmediateOutcome(scheme);
    return;
  }

  scheme.agentCharges += scheme.phasesPerAgentCharge;
  openPreparationOrCriticalMomentEvent(scheme);
}
```

### 16.4 月度暴露检查

```ts
function runMonthlyDiscoveryCheck(scheme) {
  if (scheme.discoveryGraceMonths > 0) {
    scheme.discoveryGraceMonths -= 1;
    return;
  }

  const chance = calcMonthlyDiscoveryChance(scheme.secrecy, scheme.targetCourtDefense);
  if (!roll(chance)) {
    return;
  }

  const discovery = pickDiscoveryTarget(scheme);
  if (discovery.type === 'agent') {
    exposeAgent(scheme, discovery.agent);
  } else {
    exposeSchemeOwner(scheme);
  }

  scheme.breaches += 1;
  if (scheme.breaches >= scheme.maximumBreaches) {
    forceEndScheme(scheme);
  }
}
```

### 16.5 代理人邀请

```ts
function inviteAgentToScheme(scheme, candidate, method) {
  const acceptance = calcAgentJoinChance(scheme, candidate, method);
  if (!roll(acceptance)) {
    payInviteCost(method);
    return false;
  }

  payInviteCost(method);
  addAgentToScheme(scheme, candidate);
  return true;
}
```

### 16.6 反制应用

```ts
function applyCountermeasureAdjustments(scheme) {
  const category = scheme.countermeasureCategory;
  const targetCourt = scheme.target.getCourt();
  const activeCountermeasures = targetCourt.getCountermeasures();

  for (const countermeasure of activeCountermeasures) {
    if (!countermeasure.appliesTo(category)) {
      continue;
    }

    scheme.successChance += countermeasure.successModifier;
    scheme.secrecy += countermeasure.secrecyModifier;
  }
}
```

## 17. CK3 计谋系统真正高明的地方

从设计和实现角度看，CK3 这套系统有 5 个特别高明的点：

### 17.1 统一模板化

无论是拉拢、交友、谋杀、绑架、夺位，最终都能落回同一 Scheme Type 架构。

### 17.2 复杂度分级

通过 `is_basic` 把轻量和重量计谋统一在一套系统下，避免要么全轻、要么全重。

### 17.3 成功与速度分离

你可以快，但不一定稳；你可以慢，但最后更有把握。这比单一成功率模型更耐玩。

### 17.4 暴露是中间状态，不是终点

暴露可能只是代理人暴露、部分暴露、主谋暴露，之后仍然会有后续博弈。

### 17.5 计谋系统和角色系统深度耦合

特质、关系、文化、宗教、perks、dynasty、court positions、council task 全都能进入计谋公式。这让计谋成为角色扮演系统的自然延伸，而不是独立小游戏。

## 18. 对 CK3 代码实现的最终归纳

如果把 CK3 计谋系统压缩成一句实现层面的总结，可以这样说：

`CK3 通过 character_interaction 发起 scheme 实例，通过 scheme_type 文件定义生命周期和数值规则，通过 script_values / scripted_modifiers / scripted_effects 统一处理公式，通过 events 承载叙事分支，通过 GUI 把运行态表现出来。`

再进一步压缩，可以概括为：

`它不是“用事件做出的计谋系统”，而是“用模板和数值引擎驱动、再由事件补充表现的长期行动系统”。`

## 19. 本文对应的 CK3 关键文件索引

### 19.1 计谋定义

- `game/common/schemes/scheme_types/_schemes.info`
- `game/common/schemes/scheme_types/murder_scheme.txt`
- `game/common/schemes/scheme_types/sway_scheme.txt`
- `game/common/schemes/scheme_types/fabricate_hook_scheme.txt`
- `game/common/schemes/scheme_types/claim_throne_scheme.txt`

### 19.2 入口交互

- `game/common/character_interactions/00_scheme_interactions.txt`
- `game/common/character_interactions/00_invite_agent_to_scheme.txt`

### 19.3 代理人与反制

- `game/common/schemes/agent_types/agent_types.txt`
- `game/common/schemes/scheme_countermeasures/00_basic_countermeasures.txt`

### 19.4 通用公式层

- `game/common/script_values/00_scheme_values.txt`
- `game/common/scripted_modifiers/00_scheme_scripted_modifiers.txt`
- `game/common/scripted_triggers/00_scheme_triggers.txt`
- `game/common/scripted_effects/00_scheme_scripted_effects.txt`

### 19.5 事件层

- `game/events/scheme_events/scheme_critical_moments_events.txt`
- `game/events/scheme_events/hostile_scheme_discovery_events.txt`
- `game/events/scheme_events/murder_scheme/*`
- `game/events/scheme_events/sway_scheme/*`
- `game/events/scheme_events/fabricate_hook_scheme/*`

### 19.6 GUI 层

- `game/gui/window_intrigue_potential_scheme_agent.gui`
- `game/gui/event_window_widgets/event_window_widget_scheme.gui`
- `game/gui/event_window_widgets/event_window_widget_scheme_preparations.gui`
- `game/gui/event_windows/scheme_preparations_event.gui`
- `game/gui/event_windows/scheme_successful_event.gui`
- `game/gui/event_windows/scheme_failed_event.gui`

## 20. 使用说明

如果后续要继续沿着本文做两类工作，可以分别这样接：

- 如果要为《晚唐风云》借鉴 CK3：
  继续从本文第 5、8、9、10、16 节抽模板和实现框架。
- 如果要进一步深挖 CK3 某个具体计谋：
  优先顺着“入口交互文件 -> 计谋类型文件 -> 对应事件目录 -> 通用脚本值/效果”四段链路读下去。

