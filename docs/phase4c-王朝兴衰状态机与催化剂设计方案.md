# 《晚唐风云》Phase 4C 王朝兴衰状态机与催化剂设计方案

基于对 CK3 "All Under Heaven" DLC 天朝局势（Dynastic Cycle）源码的深度拆解，结合《晚唐风云》晚唐五代的历史背景，我们对 Phase 4C 的“王朝兴衰”机制进行全面重构。

本方案彻底摒弃了原有的“单轴线性温度计”设计，转而采用**“多分支状态机 + 政治派系驱动 + 独立催化剂触发”**的复合架构。

---

## 一、 核心架构：状态机与国策解耦

CK3 的局势系统证明了将“政策取向”与“稳定状态”强行绑定的缺陷。在《晚唐风云》中，我们将两者解耦：
- **天下大势（状态机）**：客观的政治稳定程度，由“天命值（Mandate）”驱动。
- **朝廷国策（政策选择）**：玩家（扮演皇帝时）的主观施政方向，决定了进入哪种具体的时代形态。

### 1. 阶段图谱（Phase Map）

整个王朝兴衰包含 **1个过渡态** 和 **5个实质时代**，形成一个非线性的有向图：

| 阶段代码 | 时代名称 | 状态分类 | 核心机制特征 |
| :--- | :--- | :--- | :--- |
| `phase_transition` | **天命抉择（过渡态）** | 稳定 | 隐藏的过渡阶段。当乱世结束或危世恢复时进入，皇帝需在此刻选择国策（中兴或拓边）。 |
| `phase_restoration` | **治世·中兴** | 稳定 | 经济产出极高；集权等级上限解锁；可无惩罚收回节度使辟署权；叛乱阈值极高。 |
| `phase_expansion` | **治世·拓边** | 稳定 | 军队维护费降低；对外/对叛镇宣战无威望消耗；武将每月获额外威望；但民心自然流失。 |
| `phase_factionalism` | **危世·党争** | 不稳定 | 中央官员强制站队；罢免同党引发巨大反弹；中央岗位（宰相/尚书）贤能产出减半。 |
| `phase_warlordism` | **危世·藩镇跋扈** | 不稳定 | 地方上缴率强制降至极低；节度使可自由互相宣战兼并；节度使获得事实上的宗法继承权。 |
| `phase_chaos` | **乱世·天下大乱** | 混乱 | “大唐皇帝”沦为虚衔；所有道级节度使实质独立；解锁“争夺天下”宣战理由。 |

### 2. 状态流转逻辑

- **治世 → 危世**：当“天命值”因负面催化剂降至阈值（如 50）以下时，根据当前朝堂上最强的负面派系，跌入“党争”或“藩镇跋扈”。
- **危世 → 乱世**：当“天命值”归零，或触发极端催化剂（如黄巢攻破长安），直接进入“天下大乱”。
- **乱世 → 治世**：乱世的出口**唯一且明确**。只有当某位军阀控制超过半数道级行政区，并举行登基大典（触发 `catalyst_gains_mandate_of_heaven`），才能结束乱世，进入“天命抉择”过渡态。

---

## 二、 派系系统（Movement System）

状态机的流转不再是后台的自动算分，而是由游戏内的实体（NPC与玩家）组成的**政治派系**来驱动。

### 1. 派系分类

| 派系代码 | 派系名称 | 政治诉求 | 推动方向 |
| :--- | :--- | :--- | :--- |
| `pro_hegemon` | **保皇派** | 绝对忠于现任皇帝，维持现状 | 减缓天命值流失 |
| `restoration_mov` | **中兴派** | 主张整顿吏治、削藩集权 | 推动进入“治世·中兴” |
| `expansion_mov` | **拓边派** | 主张开疆拓土、武力威慑 | 推动进入“治世·拓边” |
| `warlord_mov` | **割据派** | 维护藩镇利益，反对中央干涉 | 推动进入“危世·藩镇跋扈” |
| `conservative_mov`| **保守派** | 维护世家大族利益，热衷内斗 | 推动进入“危世·党争” |

### 2. 派系势力（Movement Power）

- 每年年底（月结 Pipeline 中）重新计算各派系的势力值。
- 势力值 = 派系成员的官职权重总和（如宰相权重极高，刺史权重低） + 成员的兵力/财力加成。
- **当权派（Favored Movement）**：势力值最高的派系。当权派的诉求会极大改变催化剂的权重（例如，割据派当权时，任何削藩行为都会产生巨大的负面催化剂）。

---

## 三、 催化剂注册表（Catalyst Registry）

参考 CK3 的解耦设计，催化剂只是独立的“标签”。游戏中的具体行为（如战争结算、人事任命）会触发这些标签，而状态机根据当前所处的时代，赋予这些标签不同的天命值增减权重。

### 1. 战争与外交类
- `catalyst_war_won_external`：赢得对外/拓边战争（在拓边时代加分极多，在中兴时代加分平庸）。
- `catalyst_war_lost_defensive`：输掉防御战/领土被占（全时代扣分，危世扣分极重）。
- `catalyst_fanzhen_annexed`：藩镇成功吞并邻镇（在治世触发极重惩罚，在藩镇跋扈时代惩罚较轻）。

### 2. 政治与人事类
- `catalyst_exam_held`：成功举办科举（中兴时代加分极多）。
- `catalyst_exam_skipped_long`：长期停办科举（中兴时代扣分极重）。
- `catalyst_appoint_low_merit_chancellor`：任命低贤能/低声望者为宰相（党争时代极易发生，扣除天命值）。
- `catalyst_revoke_bishu_success`：成功收回藩镇辟署权（中兴派势力大增，天命值增加）。

### 3. 灾害与动乱类
- `catalyst_natural_disaster_major`：发生重大天灾（旱灾/水灾）（固定扣除天命值）。
- `catalyst_peasant_rebellion_unhandled`：农民起义未被及时镇压（危世时极易将状态拖入乱世）。
- `catalyst_mutiny_success`：藩镇牙兵兵变成功，驱逐节度使（极大增加割据派势力，扣除天命值）。

### 4. 阴谋与宗法类
- `catalyst_emperor_murdered`：皇帝被暗杀（瞬间扣除海量天命值，极易导致时代降级）。
- `catalyst_child_emperor_inherits`：幼主继位（扣除天命值，保守派/割据派势力大增）。
- `catalyst_gains_mandate_of_heaven`：**乱世唯一出口**。军阀控制足够领土并称帝。

---

## 四、 数据结构定义（TypeScript）

为了在现有的纯函数引擎架构中实现上述设计，我们需要在 `TurnManager` 或全局 `GameState` 中定义如下数据结构：

```typescript
// 1. 时代枚举
export enum EraPhase {
    TRANSITION = 'phase_transition',
    RESTORATION = 'phase_restoration',
    EXPANSION = 'phase_expansion',
    FACTIONALISM = 'phase_factionalism',
    WARLORDISM = 'phase_warlordism',
    CHAOS = 'phase_chaos'
}

// 2. 派系枚举
export enum MovementType {
    PRO_HEGEMON = 'pro_hegemon',
    RESTORATION = 'restoration_mov',
    EXPANSION = 'expansion_mov',
    WARLORD = 'warlord_mov',
    CONSERVATIVE = 'conservative_mov'
}

// 3. 派系数据结构
export interface MovementData {
    type: MovementType;
    leaderId: string | null; // 派系领袖的角色 ID
    power: number;           // 当前势力值
    memberIds: string[];     // 派系成员 ID 列表
}

// 4. 王朝兴衰全局状态 (挂载在 GameState 中)
export interface DynasticCycleState {
    currentPhase: EraPhase;
    mandateOfHeaven: number; // 天命值，范围 0 - 200
    movements: Record<MovementType, MovementData>;
    favoredMovement: MovementType | null; // 当前当权派
    phaseStartDate: number;  // 当前时代开始的回合/时间
    activeCatalysts: string[]; // 当前回合触发的催化剂记录（用于日志和史书生成）
}
```

### 引擎集成建议
1. **解耦触发**：在 `engine/military/warCalc.ts` 或 `engine/official/appointment.ts` 等业务逻辑中，不直接修改 `mandateOfHeaven`，而是调用类似 `triggerCatalyst(state, 'catalyst_war_won_external')` 的纯函数。
2. **集中结算**：在 `engine/turn/settlement.ts` 的月结/年结流程中，统一处理 `activeCatalysts`，根据 `currentPhase` 和 `favoredMovement` 计算天命值的最终变化，并判断是否需要切换 `currentPhase`。
3. **史书联动**：`activeCatalysts` 列表天然是生成“起居注”和“史书”的绝佳素材，可以直接传递给大模型 Prompt 生成极具历史感的文本。
