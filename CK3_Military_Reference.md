# CK3 军事系统参考文档

> 基于 Crusader Kings III 本地游戏文件分析，用于晚唐风云军事系统设计参考。

---

## 一、概念架构

### 1. 双轨兵力体系：征召兵(Levy) vs 常备军(Men-at-Arms)

- **征召兵 (Levy)**
  - 来源：从领地(Holdings)自动产生，数量由领地发展度+建筑决定
  - 基础属性：**攻击10 / 韧性10 / 攻城0 / 追击0 / 掩护0** — 纯炮灰
  - 补充速率：**3%/月**（未征召状态）
  - 维护费：**0.003金/兵/月** — 极低
  - 超额惩罚：每超出领地上限1个领地，征召兵 **-20%**（最多-100%）

- **常备军 (Men-at-Arms)**
  - 来源：花钱招募，挂在角色名下（非领地）
  - 基础编制：**100人/组**，每团最多 **3组**（可通过修正值扩编）
  - 补充速率：**10%/月** — 比征召兵快3倍
  - 维护费双态：
    - **低维护**（未征召/满编）：~1金/团/月
    - **高维护**（征召中/补充中）：~5金/团/月 — **约5倍**
  - 每种MaA有独立的 **damage / toughness / pursuit / screen / siege_value**
  - 50+种类型，分属8大原型

- **设计意图**：征召兵提供**数量纵深**，常备军提供**质量战力**；经济压力迫使玩家在二者间权衡

### 2. 兵种原型与克制

- **8大原型 (Archetype)**

  | 原型 | 定位 | 典型属性倾向 |
  |------|------|-------------|
  | **skirmishers** 散兵 | 廉价前线 | 低伤害，高韧性 |
  | **archers** 弓手 | 远程输出 | 中伤害，低韧性 |
  | **light_cavalry** 轻骑 | 追击/侦查 | 高追击，高掩护 |
  | **heavy_cavalry** 重骑 | 冲击核心 | **极高伤害**，低追击 |
  | **pikemen** 长矛 | 反骑兵 | 中伤害，高韧性 |
  | **heavy_infantry** 重步 | 正面肉搏 | 高伤害，高韧性 |
  | **siege_weapons** 攻城器 | 攻城专精 | 高攻城值，几乎无战斗力 |
  | **horse_archers** 骑射 | 机动骚扰 | 中伤害，高追击+掩护 |

- **克制关系 (Counters)**
  - 定义在每个MaA的 `counters = { target_type = factor }` 字段
  - 例：**长矛 counter 重骑**（factor约2.0 = 对重骑伤害翻倍）
  - 形成**石头剪刀布**式平衡，不存在万能兵种

- **文化变体**
  - 每种文化可定义独特MaA（继承某原型 + 属性偏移 + 独特地形适性）
  - 例：**英格兰长弓手** — 弓手原型，damage 20 / toughness 8，山地加成
  - 例：**法兰西宪兵** — 重骑原型，damage 125 / toughness 40，编制缩小到50人/组
  - 通过 `can_recruit` 触发器限制：需要特定**文化创新(Innovation)** 解锁

### 3. 地形系统

地形对军事有**三重影响**，作用域各不相同：

- **战斗层** — 作用域: 当次战斗
  - `attacker_modifier` / `defender_modifier`：对攻守双方施加不同修正
  - `combat_width`：地形决定战斗宽度（如山地 **×0.5** = 只有一半部队参战）
  - `advantage`：防御方地利加成（如山地 +防御优势）

- **移动层** — 作用域: 行军中的军队
  - `movement_speed`：地形修正行军速度
  - 基础速度 **3单位/天**，撤退 **4.5**，友方领地 **+20%**

- **补给层** — 作用域: 驻留该地形的军队
  - `supply_limit_mult`：地形修正补给上限
  - 贫瘠地形（沙漠、山地）补给上限低 → 大军过境必然饥饿损耗

- **MaA地形适性** — 作用域: 该兵种在该地形的属性偏移
  - 每个MaA可定义 `terrain_bonus = { plains = { damage = +30 }, mountains = { damage = -75 } }`
  - 同一支重骑兵在平原 **伤害+30**，在山地 **伤害-75** — 差距巨大

### 4. 战斗流程：三阶段模型

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  机动阶段    │ →  │  主战阶段    │ →  │  追击阶段    │
│  Maneuver   │    │  Main       │    │  Pursuit    │
│  3天        │    │  持续至一方  │    │  3天        │
│             │    │  崩溃       │    │             │
│ · 选定指挥官 │    │ · damage值  │    │ · pursuit值 │
│ · 计算优势   │    │   决定杀伤  │    │   决定追杀  │
│ · 地形+河流  │    │ · toughness │    │ · screen值  │
│   等加成入场 │    │   决定承受  │    │   决定掩护  │
└─────────────┘    └─────────────┘    └─────────────┘
```

- **伤害流转**
  - 伤害缩放因子：**×0.03**（原始stat → 实际伤害）
  - 主战阶段：软伤亡的 **30%** 转化为硬伤亡（真实死亡）
  - 追击阶段：韧性的 **5%** 额外转化软→硬伤亡
  - 战斗优势(Advantage)的伤害缩放：**×5** — 优势差距极其致命

- **战斗优势(Advantage)来源叠加**

  | 来源 | 作用域 | 数值 |
  |------|--------|------|
  | 防守方过河 | 当次战斗 | **+10** |
  | 防守方海峡 | 当次战斗 | **+30** |
  | 刚登陆(30天内) | 军队状态 | **-30** |
  | 补给不足 | 军队状态 | **-10** |
  | 饥饿状态 | 军队状态 | **-25** |
  | 负债等级1~5 | 角色状态 | **-5 到 -100** |
  | 指挥官军事技能 | 角色属性 | 按技能等级 |

### 5. 骑士与指挥官

- **骑士 (Knight)**
  - 每点武力(Prowess) = **50伤害 + 10韧性**（加入军队战斗力）
  - 骑士名额(knight_limit)由**头衔等级 + 威望**决定
  - 战斗中触发**个人事件**：受伤、致残、死亡、俘虏
  - 受伤概率与**武力值 + 性格特质**相关（勇敢↑受伤概率，怯懦↓）

- **指挥官 (Commander)**
  - 军事技能 → 征召兵补充 +2.5%/点，军队维护 -1%/点，韧性 +1%/点
  - 指挥官特质提供额外战斗优势（如"勇猛"、"战术家"等）
  - 指挥官在战斗中也有受伤/死亡风险 — 影响军队士气

### 6. 补给与损耗

- **补给值**：0–100，全军共享单一数值

- **三档状态**

  | 状态 | 补给值区间 | 损耗 | 战斗惩罚 |
  |------|-----------|------|---------|
  | **充足 FULLY_SUPPLIED** | 60–100 | 0% | 无 |
  | **不足 RUNNING_LOW** | 10–59 | 0% | **-10** 战斗优势 |
  | **饥饿 STARVING** | 0–9 | **5%/检查** | **-25** 战斗优势 |

- **补给恢复与消耗**
  - 低于上限时：**+20/检查** 恢复
  - 超过上限时：**-0.001/兵/检查** 消耗
  - 友方领地：补给上限 **+15%**
  - 附庸领地：补给上限 **+30%**
  - 集结后 **30天** 免补给消耗（集结缓冲期）
  - 海上行军：补给每次检查 **-8**

- **最低补给上限**：**1000兵** — 小军队永远不会饿死

### 7. 战争与战争分数

- **宣战理由 (Casus Belli)**
  - 25+种CB类型：宣称战争、郡征服、圣战、内战、独立战争等
  - 宣战成本按**领地规模**缩放：基础25 + 5/领地（上限75），用虔诚/威望/金钱支付
  - 每种CB定义了**合法目标范围**和**胜利后效果**

- **战争分数 (War Score)** = 三项叠加，-100 ~ +100

  | 分数来源 | 攻方上限 | 守方上限 | 说明 |
  |---------|---------|---------|------|
  | **占领分** | 90 | 90 | 占领战争目标+敌方领地 |
  | **战斗分** | 50 | 100 | 赢得野战（攻方上限更低） |
  | **时间流逝分** | ∞ | ∞ | 0.055/天，攻方无延迟，守方延迟365天 |

  - **攻方战斗分上限50** — 纯靠打仗赢不了战争，必须占领
  - **守方战斗分上限100** — 守方可以纯靠歼灭敌军获胜
  - 战斗分乘数：攻方×40，守方×50（守方胜利更容易累积分数）

- **战争结束**：分数达到阈值 → 强制和约 / 白和 / 投降

### 8. 军事建筑

- **8级递进体系**（Tier 1~8），金钱成本从50到300+递增

- **主要军事建筑类型**

  | 建筑 | 主产出 | 兵种专精 |
  |------|--------|---------|
  | **兵营 Barracks** | 征召兵+一般 | 重步、长矛 |
  | **团营 Regimental Grounds** | 征召兵+优秀 | 全MaA类型维护折扣 |
  | **马厩 Stables** | 征召兵+一般 | 轻骑、重骑 |
  | **牧场 Hillside Grazing** | 征召兵+差 | 骑兵系、骑射 |
  | **哨站 Outposts** | 征召兵+差 | 散兵、弓手（森林/湿地） |
  | **武士堂 Warrior Lodges** | 征召兵+差 | 驻军MaA平加成（山地/丘陵） |

- **防御工事线**
  - 城墙(Curtain Walls)、望楼(Watchtowers)、山寨(Hill Forts)
  - 提供 **fort_level**（影响攻城难度）+ **defender_holding_advantage**（防御战斗加成）
  - 每级降低旅行危险度 -1 到 -3

- **建筑→军事的修正值桥接**
  - 建筑通过 `stationed_{maa_type}_{stat}_mult` 修正值加成**驻扎在该领地的特定兵种**
  - 例：马厩Lv3 → `stationed_light_cavalry_damage_mult = +0.2`（驻扎轻骑伤害+20%）
  - 这些修正值的作用域是 **领地(County)级别**，只对驻扎部队生效

---

## 二、代码层架构

### 1. 声明式数据定义 — 数值与逻辑分离

CK3 的核心设计哲学：**所有游戏实体都是纯数据块(data block)**，逻辑引擎读取数据驱动行为。

- **MaA定义示例**（`common/men_at_arms_types/00_maa_types.txt`）
  ```
  pikemen = {
      type = pikemen                    # 原型归属
      damage = 18                       # 基础攻击
      toughness = 24                    # 基础韧性
      pursuit = 0
      screen = 10
      siege_value = 0

      terrain_bonus = {
          mountains = { damage = 8 }    # 山地额外+8伤害
          hills = { damage = 4 }
      }

      counters = {
          heavy_cavalry = 1             # 克制重骑，factor=1(即双倍)
      }

      buy_cost = { gold = 150 }
      low_maintenance_cost = { gold = 1.0 }
      high_maintenance_cost = { gold = 5.0 }

      stack = 100                       # 每组编制
      ai_quality = { value = culture_ai_weight_pikemen }
  }
  ```

- **关键分离点**
  - **数值层**：damage、toughness、cost 等全部在数据文件中，**不出现在引擎代码里**
  - **结构层**：terrain_bonus、counters 等关系也声明在数据中
  - **逻辑层**：战斗引擎只负责读取这些字段做通用计算（乘法/加法/克制查表）
  - **好处**：改一个兵种的平衡只需改 txt，不碰代码

- **对晚唐风云的启示**
  - 兵种定义应放在 `data/` 目录下的纯数据文件中（类似 `positions.ts` 的模式）
  - 战斗引擎应只依赖接口（`UnitType.damage` 等），不关心具体是哪种兵

### 2. 修正值(Modifier)组合系统 — 三层堆叠

CK3 的修正值系统是整个游戏最核心的架构模式，军事系统大量依赖它。

- **三层修正值体系**

  | 层级 | 命名模式 | 来源 | 示例 |
  |------|---------|------|------|
  | **基础修正** | `advantage`, `damage`, `levy_size` | 直接赋值 | 河流防御 `advantage = 10` |
  | **兵种域修正** | `{unit_type}_{stat}_{add/mult}` | 建筑/文化/特质 | `heavy_cavalry_damage_mult = 0.2` |
  | **地形域修正** | `{terrain}_{effect}_{add/mult}` | 地形定义自动生成 | `plains_advantage = 2` |

- **命名约定即架构**
  - 修正值不是手动注册的——CK3通过 `modifier_definition_formats/` 文件**按命名规则自动生成**
  - `00_unit_definitions.txt` 中每注册一个兵种原型 → 自动产生 `{type}_damage_mult`、`{type}_toughness_add` 等修正值槽位
  - `00_terrain_definitions.txt` 中每注册一个地形 → 自动产生 `{terrain}_advantage`、`{terrain}_supply_limit` 等

- **修正值堆叠公式**
  ```
  最终值 = 基础值 × (1 + Σ所有mult修正) + Σ所有add修正
  ```
  - 先乘后加，mult修正之间**线性叠加**（不是乘法链）
  - 来源可以是：角色特质 + 建筑 + 地形 + 文化创新 + 临时状态，全部走同一套堆叠

- **修正值元数据**（`modifier_definition_formats/`）
  ```
  heavy_cavalry_damage_mult = {
      prefix = MOD_DAMAGE_PREFIX       # UI显示前缀图标
      decimals = 0                     # 显示精度
      percent = yes                    # 显示为百分比
      color = good                     # 绿色(正面)还是红色(负面)
  }
  ```
  - 元数据只控制**UI展示**，不影响计算逻辑——展示与计算也是分离的

### 3. 触发器(Trigger)门控 — 条件式解锁

CK3 不用状态机管理"什么时候能招募什么兵"，而是用**声明式条件**：

- **招募条件**（`can_recruit` 触发器）
  ```
  can_recruit = {
      culture = {
          has_innovation = innovation_arched_saddle
      }
  }
  ```
  - 只要角色的文化满足条件 → 该MaA类型出现在招募列表
  - 条件可以是：文化创新、政体标志、宗教、特定修正值存在等

- **UI可见性**（`should_show_when_unavailable` 触发器）
  ```
  should_show_when_unavailable = {
      government_allows = subject_men_at_arms
      culture = { has_cultural_era_or_later = culture_era_early_medieval }
  }
  ```
  - 控制"还没解锁但能看到灰显选项"——玩家知道未来能解锁什么

- **对晚唐风云的启示**
  - 兵种解锁可以用类似模式：在兵种定义中声明 `canRecruit: (char) => boolean`
  - 比维护一个"科技树状态机"简单得多，且天然支持多条件组合

### 4. 作用域(Scope)上下文传递

CK3 的事件和修正值不通过参数传递，而是通过**作用域链**：

- **核心作用域**
  - `root` — 事件的主角色
  - `scope:holder` — 当前领地持有者
  - `scope:combat_side` — 战斗中的己方
  - `scope:enemy_side` — 战斗中的敌方
  - `scope:war` — 当前战争对象
  - `scope:attacker` / `scope:defender` — 战争双方

- **作用域链示例**（建筑修正值的条件检查）
  ```
  modifier = {
      add = stationed_maa_bonus
      has_stationed_regiment_of_base_type = skirmishers    # 检查领地驻军
  }
  modifier = {
      add = likes_maa_value
      scope:holder = {                                      # 上溯到领地持有者
          culture = { culture_has_skirmisher_maa = yes }    # 再查文化
      }
  }
  ```

- **设计优势**
  - 不需要函数参数层层传递——任何逻辑都能通过作用域访问到需要的上下文
  - 对晚唐风云而言，类似于在计算函数中通过 store 访问关联实体，而非把所有依赖都传参

### 5. 脚本值(Script Values) — 可复用计算公式

- **定义位置**：`common/script_values/00_combat_values.txt`
- **用途**：把重复出现的数值计算抽成命名公式，在触发器/修正值/事件中引用

- **示例**
  ```
  culture_ai_weight_pikemen = {
      value = 1.0
      if = {
          limit = { has_innovation = innovation_pike_columns }
          add = 0.5
      }
  }
  ```
  - MaA定义中引用：`ai_quality = { value = culture_ai_weight_pikemen }`
  - 一处修改 → 所有引用自动更新

- **与硬编码常量的区别**
  - CK3的 `defines/` 存放引擎级常量（如伤害缩放0.03）——**不可被脚本覆盖**
  - `script_values/` 存放设计级公式——**可被mod覆盖** + 支持条件分支
  - 两层分离：引擎物理规则 vs 游戏设计调参

### 6. 建筑→军事的修正值桥接

建筑如何影响军事，是CK3修正值系统的典型应用：

- **桥接路径**
  ```
  建筑(Building)
    → 产出修正值(Modifier): stationed_pikemen_damage_mult = 0.15
      → 作用域: 该领地(County)
        → 生效对象: 驻扎在该领地的长矛兵团
  ```

- **条件组合模式**（`scripted_modifiers/00_building_modifiers.txt`）
  - 先检查**驻军是否包含目标兵种** (`has_stationed_regiment_of_base_type`)
  - 再检查**持有者文化是否偏好该兵种** (`culture_has_skirmisher_maa`)
  - 两个条件都满足 → 叠加额外加成

- **AI决策辅助**
  - 每个建筑定义了 `ai_value` 脚本值，考虑当前驻军组成来评估建造优先级
  - AI不是硬编码"在马场旁造马厩"，而是动态计算"造这个建筑对当前军队组成的收益是多少"

### 7. 战斗事件生命周期

CK3 的战斗不是纯数值计算——在关键节点挂载**叙事事件**：

- **事件挂载点**

  | 阶段 | 事件类型 | 典型内容 |
  |------|---------|---------|
  | 战斗开始 | `combat_events` | 宣布交战 |
  | 主战每轮 | `commander_phase_events` | 指挥官受伤/展现特质 |
  | 主战每轮 | `knight_phase_events` | 骑士决斗/俘虏/阵亡 |
  | 战斗结束 | `combat_events` | 俘虏处理、"不败将军"追踪 |
  | 战争结束 | `war_events` | 和约签订、领地转让 |

- **事件触发机制**
  - 基于**概率 + 条件**：`trigger = { prowess >= 12 }` + `weight = { base = 10 }`
  - 不是每场战斗都触发——低概率高影响，制造叙事惊喜
  - 事件结果可以反向影响战斗（如指挥官阵亡 → 士气崩溃）

- **对晚唐风云的启示**
  - 战斗不应只是数字对撞——在关键节点插入事件可以大幅提升叙事感
  - 可以复用现有的 interaction/event 系统架构

---

## 三、可借鉴模式摘要

> 简要对照 CK3 模式与晚唐风云现有架构的映射关系，供后续设计参考。

| CK3 模式 | CK3 实现 | 晚唐风云现有对应 | 借鉴方向 |
|----------|---------|----------------|---------|
| **数据驱动实体** | MaA定义在txt数据文件，引擎通用计算 | `data/positions.ts` 定义职位模板 | 兵种定义放 `data/unitTypes.ts`，战斗引擎只读接口 |
| **预创建槽位** | Title/Holding 预创建，不动态增删 | Post 预创建、永不删除 | 军队槽位(Regiment)可预创建挂在领地上，招募=填充 |
| **Map + Index** | 内部hash表 + 多维索引 | `TerritoryStore` 的 postIndex/holderIndex/controllerIndex | `MilitaryStore` 用 Map + ownerIndex + territoryIndex |
| **修正值堆叠** | 三层modifier，命名约定自动注册 | 暂无统一modifier系统 | 可引入轻量 modifier 系统：`{ source, target, stat, type: 'add'\|'mult', value }` |
| **条件式解锁** | `can_recruit` 触发器 | `appointValidation.ts` 的任命校验 | 兵种招募条件用同样的 `canRecruit(char, territory)` 模式 |
| **双态维护费** | 未征召低维护 / 征召中高维护 | 经济系统已有 `militaryMaintenance` 占位 | 直接复用：驻守=低维护，行军/战斗=高维护 |
| **战争分数抽象** | 占领+战斗+时间三维分数 | 暂无 | 避免"歼灭才能赢"——占领目标领地应是主要胜利条件 |
| **战斗事件挂载** | 战斗各阶段触发叙事事件 | interaction registry 模式 | 战斗各阶段用类似 registry 挂载事件回调 |
| **纯函数查询** | script_values 可复用公式 | `postQueries.ts` 纯函数 | 战斗计算也用纯函数：`calcDamage(attacker, defender, terrain)` |
| **补给经济约束** | 补给三档 + 领地友好度 | 领地已有 control/development 属性 | 补给上限可绑定领地 development，友好度绑定 control |
