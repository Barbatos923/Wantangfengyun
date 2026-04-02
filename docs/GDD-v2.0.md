# 《晚唐风云》核心游戏设计案 v2.0

> **版本说明**：本文档在 v1.0 GDD 基础上，整合 v1 开发实践中验证的设计和暴露的架构问题，形成 v2.0。
> **变更原则**：概念层设计（世界观、体验目标、玩法循环）大体不变；**官职系统、经济系统、数据模型**是本次重点重写的部分。

---

## 目录

1. 游戏概述与核心命题 *(不变，见 v1.0 第1-2章)*
2. 核心玩法循环 *(不变，见 v1.0 第3章)*
3. 世界观与历史背景 *(不变，见 v1.0 第4章)*
4. 角色系统 *(微调)*
5. 核心资源 *(不变，见 v1.0 第6章)*
6. **官职系统 (重写)**
7. **领地系统 (重写)**
8. **经济系统 (新增独立章节)**
9. 军事系统 *(不变，见 v1.0 第9章)*
10. 谋略 / 活动 / 派系 / 继承 *(不变，见 v1.0 第10-13章)*
11. AI 史书生成管线 *(不变，见 v1.0 第14章)*
12. **UI 与交互设计 (重写)**
13. **数据模型总览 (新增)**
14. 开发优先级与里程碑 *(更新)*

> 标注"不变"的章节请参阅 `《晚唐风云：起居注与史书》.md`（v1.0 GDD），此处不重复。

---

## 4. 角色系统（微调）

v1.0 第 5 章的设计整体保留，以下为变更点：

### 4.1 移除的字段

| 字段 | 原用途 | v2 处理方式 |
|---|---|---|
| `controlledTerritoryIds` | 记录角色直辖的领地 ID | **删除**。由岗位系统推导（见第 7 章） |
| `official.positions[]` | 存储角色持有的职位列表 | **删除**。由岗位系统推导（见第 6 章） |
| `title` | 写死的头衔字符串 | **删除**。由 getDynamicTitle() 从岗位动态生成 |

### 4.2 新增的字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `centralization` | 1-4 (可选) | 上级对我设定的集权等级。无上级时不存在 |
| `redistributionRate` | 0-100 (可选) | 我对下属的回拨率。见第 8 章经济系统 |

### 4.3 OfficialData 简化

```
OfficialData {
  rankLevel: RankLevel;    // 品位等级 1-29
  virtue: number;          // 贤能积累
  isCivil: boolean;        // 文/武散官（入仕时一次性确定）
  // positions[] 已移除 — 由岗位查询推导
}
```

---

## 6. 官职系统（重写）

### 6.1 核心概念：职位模板与岗位

v1 中"职位"同时承担了"种类定义"和"具体任命"两个角色，导致冲突检测和任命流程复杂度失控。v2 将其拆为两个清晰的概念：

#### 职位模板 (PositionTemplate)

定义一类职位的**种类属性**——名称、品位要求、薪俸、所属机构等。是静态数据，不包含任何运行时状态。

```
PositionTemplate {
  id: string;                    // 'tpl-jiedushi', 'tpl-cishi', 'tpl-zaixiang'...
  name: string;                  // '节度使', '刺史', '宰相'...
  scope: 'central' | 'local';   // 中央 or 地方
  tier?: TerritoryTier;         // 地方职位绑定的领地层级: 'zhou' | 'dao' | 'guo'
  territoryType?: TerritoryType; // 'civil' | 'military'
  institution: Institution;
  minRank: RankLevel;
  salary: { money, grain };
  description: string;
  grantsControl: boolean;        // 是否为主岗位（持有即控制领地）
}
```

#### 岗位 (Post)

一个具体的**坑位**——"关内道节度使"、"长安刺史"、"宰相"各是一个岗位。岗位在领地/机构创建时就存在，不随任命/罢免创建和销毁。

```
Post {
  id: string;                    // 'post-jiedushi-guannei', 'post-cishi-changan'...
  templateId: string;            // 引用 PositionTemplate.id
  territoryId?: string;          // 地方岗位绑定的领地 ID
  holderId: string | null;       // 当前在任者 ID，null = 空缺
  appointedBy?: string;          // 任命者 ID
  appointedDate?: GameDate;      // 任命日期
}
```

**关键设计决策**：
- **冲突检测变为一行**：`post.holderId !== null` → 已有人在任，自然排除
- **岗位预创建**：每个道创建时就有节度使/观察使岗位 + N 个幕府岗位，无需运行时生成
- **角色持有的职位通过查询获得**：遍历所有岗位找 `holderId === charId`

### 6.2 品位体系

与 v1.0 完全一致（29 级文武散官 + 贤能积累自动晋升），不再重复。

### 6.3 职位模板清单

#### 中央职位模板

与 v1.0 第 7 章的中央职位表一致。每个模板对应**1 个全局岗位**。

#### 地方职位模板

| 模板 ID | 名称 | 层级 | 类型 | grantsControl | 说明 |
|---|---|---|---|---|---|
| tpl-jiedushi | 节度使 | dao | military | **true** | 道级军事主官 |
| tpl-guancha-shi | 观察使 | dao | civil | **true** | 道级民事主官 |
| tpl-wang | 王 | guo | military | **true** | 国级军事主官 |
| tpl-xingtai-shangshu | 行台尚书令 | guo | civil | **true** | 国级民事主官 |
| tpl-cishi | 刺史 | zhou | civil | **true** | 州级民事主官 |
| tpl-fangyu-shi | 防御使 | zhou | military | **true** | 州级军事主官 |
| tpl-panguan | 节度判官 | dao | — | false | 幕府行政总管 |
| tpl-zhangshiji | 掌书记 | dao | — | false | 幕府机要秘书 |
| tpl-tuiguan | 节度推官 | dao | — | false | 幕府司法 |
| tpl-xunguan | 节度巡官 | dao | — | false | 幕府巡查 |
| tpl-duyuhou | 都虞候 | dao | — | false | 军法长官 |
| tpl-bingmashi | 兵马使 | dao | — | false | 统兵将领 |
| tpl-duzhibingmashi | 都知兵马使 | dao | — | false | 最高统兵 |
| tpl-sima | 司马 | zhou | — | false | 州级副手（闲职） |
| tpl-zhangshi | 长史 | zhou | — | false | 州级副手 |
| tpl-lushibcanjun | 录事参军 | zhou | — | false | 州府实务 |

### 6.4 岗位的创建规则

每个领地在初始化时自动生成一套岗位：

**州级领地 (zhou)**：
- 1 个主岗位：民事州 → 刺史，军事州 → 防御使
- 1 个副岗位：录事参军

**道级领地 (dao)**：
- 1 个主岗位：民事道 → 观察使，军事道 → 节度使
- 2 个副岗位：掌书记、都知兵马使

**国级领地 (guo)**：
- 1 个主岗位：军事国 → 王，民事国 → 行台尚书令

**中央**（不在领地上，独立存储）：
- 每个中央职位模板 → 1 个岗位

### 6.5 任命权规则（已经被继承机制覆盖）

不再使用 `canAppoint[]` 硬编码列表。改为基于层级关系的规则：

```
1. 中央岗位：只有皇帝（或有对应任命权的高级官员）可任命
2. 地方主岗位 (grantsControl=true)：当前持有者可以转让给他人
3. 地方副岗位：该领地主岗位的持有者可任命
```

**示例**：
- 皇帝持有关内道观察使 → 皇帝可以把它任命给别人
- 李克用持有河东道节度使 → 李克用可以任命河东道的判官、掌书记等
- 长安刺史是皇帝 → 皇帝可以任命长安的司马、长史、录事参军

### 6.6 任命/罢免统一流程（已经被继承机制覆盖）

**任命**：
```
1. 找到目标岗位（post）
2. 检查：岗位空缺？被任命者品位足够？任命者有权？
3. 设 post.holderId = appointeeId
4. 设 post.appointedBy = appointerId
5. 确保效忠关系
```

**罢免**：
```
1. 找到目标岗位（post）
2. 清 post.holderId = null
3. 如果是主岗位(grantsControl)，罢免者自动接管（holderId = dismisserId）
```

**零特殊分支**：无论刺史、节度使还是王，走完全相同的代码路径。领地控制权的变更是 `holderId` 变化的自然结果（查询推导），不需要额外操作。

---

## 7. 领地系统（重写）

### 7.1 领地层级

与 v1.0 一致：州 (zhou) → 道 (dao) → 国 (guo)

### 7.2 领地类型

与 v1.0 一致：民事 (civil) / 军事 (military)

### 7.3 领地数据结构

```
Territory {
  // 基础
  id, name, tier, territoryType

  // 层级
  parentId?, childIds[]

  // 法理归属
  dejureControllerId: string

  // ★ 实际控制人由主岗位推导，不再存储
  // ★ 岗位列表存储在领地上
  posts: Post[]

  // 产出相关 (仅 zhou)
  basePopulation, moneyRatio, grainRatio
  control, development, populace

  // 建筑 (仅 zhou)
  buildings: BuildingSlot[]
  constructions: Construction[]
  garrison: number
}
```

### 7.4 实际控制人的推导

```
// 领地的实际控制者 = 主岗位 (grantsControl) 的 holderId
getActualController(territory) → string | null

// 角色直辖的所有州 = 所有州中主岗位 holderId === charId 的
getControlledZhou(charId) → Territory[]

// 角色持有的所有岗位 = 所有领地的 posts 中 holderId === charId 的
getHeldPosts(charId) → Post[]
```

### 7.5 领地属性与建筑

与 v1 实现一致：
- 控制度/发展度/民心 三属性，每月漂移
- 11 种建筑，4-6 槽位，施工队列
- 数值已放大 100 倍（建筑成本/收益/粮储）

---

## 8. 经济系统（新增独立章节）

> 概念层设计沿用 `经济系统重构方案.md`，本章从代码实现角度重新组织。

### 8.1 领地产出

**仅州级领地有产出**。公式：

```
K = 0.9
总产出 = basePopulation × K × (development/100) × (control/100) × (1 + admin×0.02)
钱 = 总产出 × moneyRatio / (moneyRatio + grainRatio) + 建筑加成
粮 = 总产出 × grainRatio / (moneyRatio + grainRatio) + 建筑加成
```

产出数量级为**万级**（贴近历史量感）。

### 8.2 领地类型的确定

由角色在该领地持有的主岗位的 `templateId` 推导：

- 持有"刺史"岗位 → civil
- 持有"防御使"岗位 → military
- 持有"节度使"岗位 → military
- 持有"观察使"岗位 → civil

### 8.3 集权等级与上缴率

集权等级存储在下属角色上（`character.centralization`），由上级设定。

上缴率由 **集权等级 × 领地类型** 查表：

| 集权等级 | military | civil |
|---|---|---|
| 1（放任） | 10% | 40% |
| 2（一般） | 20% | 60% |
| 3（严控） | 35% | 80% |
| 4（压榨） | 50% | 95% |

### 8.4 回拨机制

存储在上级角色上（`character.redistributionRate`，0-100%）。

```
1. 每个下属按上缴率上缴
2. 上级汇总所有收到的贡赋
3. 按 redistributionRate × 各下属贡献占比，自动退还
4. 剩余归上级
```

### 8.5 俸禄

- **无地职位**（中央京官、幕府幕僚）：品位薪 + 职位薪，百贯级别
- **有地职位**（刺史、节度使等）：收入主要来自领地留存和回拨，俸禄是小头
- 上级支付下属俸禄时检查余额，不足则好感度下降

### 8.6 月度结算流程

```
1. 计算所有州的产出
2. 构建领主层级树（基于 overlordId）
3. 自底向上：每层按集权×类型上缴
4. 自顶向下：每层按回拨率×贡献比退还
5. 支付无地职位俸禄
6. 应用资源变动
7. 破产检查（阈值 -50000）
```

### 8.7 数值参考

| 州 | basePopulation | moneyRatio | grainRatio | 月钱(满属性) | 月粮(满属性) |
|---|---|---|---|---|---|
| 扬州 | 150,000 | 5 | 6.2 | ~50,000 | ~62,000 |
| 长安 | 120,000 | 3 | 4 | ~30,000 | ~40,000 |
| 成都 | 100,000 | 4 | 5 | ~28,000 | ~35,000 |
| 洛阳 | 80,000 | 2 | 3 | ~16,000 | ~24,000 |
| 太原 | 60,000 | 2 | 5 | ~10,000 | ~25,000 |

---

## 12. UI 与交互设计（重写）

### 12.1 主界面布局

与 v1.0 第 15 章一致。

### 12.2 交互系统架构

沿用 v1 验证成功的 **Interaction 注册表** 模式：

```
Interaction {
  id: string;
  name: string;
  icon: string;
  canShow(player, target): boolean;
  paramType: string;  // 决定后续 UI flow
}
```

**从角色入口触发**：点击角色 → 交互菜单 → 选择操作。不在 Tab 里加操作按钮。

### 12.3 任命流程（简化为一步）

v1 的两步流程（选职位 → 选领地）改为**一步**：

```
1. 点击目标角色 → ⚡ → "任命"
2. 直接展示所有空缺岗位：
   - 遍历玩家控制的领地的 posts
   - 筛选 holderId === null 且被任命者品位足够的
   - 每项显示 "{领地名}{职位名}"（如"关内道节度使"、"长安司马"）
3. 点击岗位 → 执行任命 → 完成
```

无冲突检测逻辑（空缺岗位 = 没人在任 = 不需要检测）。

### 12.4 罢免流程

```
1. 点击目标角色 → ⚡ → "罢免"
2. 列出目标角色持有的、由玩家任命的岗位
3. 选择岗位 → 确认 → 执行罢免
```

### 12.5 调整集权

```
点击属下角色 → ⚡ → "调整集权" → 4 级选择器 → 确认
```

### 12.6 调整回拨率

```
领地管理 → 体制 Tab → 回拨率 +/- 按钮（每次 10%，范围 0-100%）
```

---

## 13. 数据模型总览（新增）

### 核心实体关系

```
Character
  ├── abilities, traits, health, stress
  ├── resources { money, grain, prestige, legitimacy }
  ├── overlordId → Character (效忠关系)
  ├── centralization (上级对我的集权)
  ├── redistributionRate (我对下属的回拨率)
  └── official { rankLevel, virtue, isCivil }

Territory
  ├── tier: zhou | dao | guo
  ├── territoryType: civil | military
  ├── parentId → Territory, childIds → Territory[]
  ├── dejureControllerId → Character
  ├── posts: Post[] ← 岗位列表
  └── (zhou only) basePopulation, moneyRatio, grainRatio, control, development, populace, buildings

Post
  ├── templateId → PositionTemplate
  ├── territoryId → Territory (地方岗位)
  ├── holderId → Character | null
  └── appointedBy → Character

PositionTemplate (静态数据)
  ├── scope: central | local
  ├── tier?: zhou | dao | guo
  ├── territoryType?: civil | military
  ├── grantsControl: boolean
  └── salary, minRank, institution, description
```

### 关键查询函数

```
getActualController(territory) → 领地主岗位的 holderId
getControlledZhou(charId) → 角色直辖的所有州
getHeldPosts(charId) → 角色持有的所有岗位
getVassals(charId) → 所有 overlordId === charId 的角色
getDynamicTitle(charId) → 从岗位推导的头衔
```

### Store 职责划分

| Store | 职责 |
|---|---|
| CharacterStore | 角色 CRUD、资源变动、品位晋升、特质管理 |
| TerritoryStore | 领地 CRUD、**岗位管理（任命/罢免/查询）**、建筑施工 |
| TurnManager | 回合推进、月结算调度 |
| LedgerStore | 玩家月度收支缓存 |
| panelStore | UI 面板状态管理 |

**岗位操作全部在 TerritoryStore 中**，CharacterStore 不再有 appointPosition / removePosition。

---

## 13.5 借鉴 CK3 的架构模式（新增）

> 通过研究 CK3 本地游戏文件（`game/common/`），提炼出以下可直接采用的架构模式。

### A. Title 系统 → 我们的 Post 系统

CK3 的 Title 是持久实体（barony → county → duchy → kingdom → empire），有 holder，可空缺。我们的 Post 已经对齐这个模式。

**可进一步借鉴的点**：
- **法理漂移（De Jure Drift）**：CK3 中，长期控制某个公国下的伯爵领，该伯爵领会"漂移"到新公国的法理下。我们可以在未来加入：长期控制某道下的州，该州法理归属可变。暂不实现，但数据模型预留 `dejureControllerId` 即可。
- **Capital 属性**：CK3 每个 Title 有 capital 引用下级 Title。我们的道可以指定一个"治州"（`capitalZhouId`），作为节度使驻地。

### B. 交互系统：三段式校验

CK3 每个 character_interaction 分为三段：

| 阶段 | CK3 字段 | 我们的对应 | 作用 |
|---|---|---|---|
| 可见性 | `is_shown` | `canShow()` | 交互是否出现在菜单中 |
| 有效性 | `is_valid_showing_failures_only` | **新增 `getFailureReason()`** | 出现但灰显，tooltip 显示原因 |
| 执行 | `on_accept` | `execute()` | 实际执行效果 |

**v2 建议**：在 Interaction 接口中新增 `getFailureReason`，返回 null（可执行）或 string（灰显原因）。这样菜单能同时显示"可用"和"不可用但可见"的交互，体验更好。

```
Interaction {
  id, name, icon
  canShow(actor, target): boolean         // 是否出现
  getFailureReason(actor, target): string | null  // 出现但不可执行的原因
  paramType: string
}
```

### C. Modifier 堆叠系统

CK3 的所有数值 = 基础值 + 一堆 modifier 叠加。modifier 分两种：
- **加法型** (`monthly_prestige = 5`)：直接累加
- **乘法型** (`domain_tax_mult = 0.02`)：各自 +1 后连乘

**v2 建议**：当前产出公式是硬编码的，Phase 2 暂时够用。但从 Phase 3（军事维持费）开始，修正来源会变多（特质、建筑、法律、事件 buff）。建议 Phase 3 时引入通用 Modifier 系统：

```
Modifier {
  id: string;              // 'trait-just-populace', 'building-academy-dev'
  source: string;          // 来源标识
  target: ModifierTarget;  // 影响的属性
  type: 'add' | 'mult';   // 加法 or 乘法
  value: number;
}

// 计算最终值
function applyModifiers(base: number, modifiers: Modifier[]): number {
  let addTotal = 0;
  let multTotal = 1;
  for (const m of modifiers) {
    if (m.type === 'add') addTotal += m.value;
    else multTotal *= (1 + m.value);
  }
  return (base + addTotal) * multTotal;
}
```

Phase 2 暂不实现，但架构上预留接口——产出函数接受 `modifiers` 参数而非硬编码系数。

### D. 建筑的三级修正作用域

CK3 建筑效果分三层：
- `province_modifier`：只影响本省
- `county_modifier`：影响整个伯爵领
- `character_modifier`：影响持有人

**我们的对应**：
- `territory_modifier`：影响本州（产出、控制度、发展度等）
- `holder_modifier`：影响控制者（压力减少、名望加成等）

当前建筑已隐式区分了这两类（如寺庙的 `populacePerMonth` 是 territory 级，`stressReduction` 是 holder 级），v2 可以显式标注。

### E. 法律系统：累积式等级

CK3 的法律用 `cumulative = yes` 表示：3 级集权 = 1 级效果 + 2 级效果 + 3 级效果。

我们的集权等级目前只影响上缴率（查表），未来如果加入更多效果（如 v1 GDD 中的"禁止下属宣战"、"可剥夺头衔"），可以用类似的累积模式：

```
集权 1：基础上缴率
集权 2：+可剥夺下属岗位
集权 3：+下属禁止内部宣战
集权 4：+可指定继承人
```

每级包含前一级的所有效果。

### F. AI 决策：基础分 + modifier 加权

CK3 的 `ai_accept` / `ai_will_do` 用 `base + modifier[]` 的模式决定 AI 行为权重。每个 modifier 有 trigger 条件和加分值。

这个模式非常适合我们未来的 NPC 决策（Phase 6）。暂时不需要实现，但设计上预留。

---

## 14. 开发优先级与里程碑（更新）

总体阶段划分与 v1.0 一致（Phase 0-8），但 Phase 2 的交付物需要反映新的数据模型：

### Phase 2 更新后的交付物

| 交付物 | 说明 |
|---|---|
| PositionTemplate 数据 | 全部职位模板定义（静态数据） |
| Post 系统 | 岗位 CRUD + 领地上的 posts 数组管理 |
| 任命/罢免系统 | 统一流程函数 appointToPost / dismissFromPost |
| 任命权规则 | canAppointTo 基于层级关系判定 |
| 贤能与品位 | 贤能积累 + 自动晋升（沿用 v1） |
| 经济结算 | 产出 + 上缴 + 回拨 + 俸禄 + 破产 |
| 交互系统 | 任命（一步流程）、罢免、调整集权、调整回拨率 |
| UI 面板 | ResourceBar、CharacterPanel、RealmPanel、GovernmentPanel、OfficialPanel |

### Phase 2 里程碑验收

> **玩家以皇帝身份开局。点击属下 → 任命 → 看到所有空缺岗位（如"关内道节度使"）→ 一步任命。领地管理面板显示万级经济数据。推进数月，上缴、回拨、俸禄正常结算。调整集权等级和回拨率后，经济数据相应变化。**
