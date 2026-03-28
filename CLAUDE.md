# CLAUDE.md — 《晚唐风云》项目指南

> 本文件供 Claude Code 在会话开始时读取，避免为小任务而全量扫描代码库。
> **开始任务前先读本文件，再只读取与任务直接相关的文件。**

---

## 一、项目概述

晚唐（约 867 AD）历史策略模拟单机游戏，灵感来自 CK3，聚焦中国历史特色（官职体系、藩镇割据、兵变、史书叙事）。

| 项目 | 值 |
|---|---|
| 技术栈 | Vite 8 + React 19 + TypeScript 5.9 (strict) + Zustand 5 + TailwindCSS 4 |
| 存储 | IndexedDB（`idb` 库），数据库名 `wantang-db`，三张表：saves / chronicles / events |
| 随机数 | `seedrandom` 确定性 RNG，入口 `engine/random.ts`，存档时序列化种子 |
| 构建 | `pnpm build`（tsc -b && vite build），产物纯静态 |
| 开发 | `pnpm dev` |
| 路径别名 | `@` → `src/`，`@engine` → `src/engine/`，`@data` → `src/data/`，`@ui` → `src/ui/` |
| 工作目录 | CWD 为 `D:\桌面\CC`，项目代码在 `wantang/` 子目录 |

---

## 二、目录结构（子目录级）

```
wantang/src/
├── main.tsx / App.tsx / index.css     # 应用入口与全局样式
│
├── engine/                            # 游戏引擎层（与 UI 完全解耦）
│   ├── types.ts                       # 全局类型：GameDate, GameEvent, Resources, Era 等
│   ├── random.ts                      # 确定性 RNG（initRng/random/randInt/shuffle）
│   ├── utils.ts                       # 共享工具（clamp 等）
│   ├── TurnManager.ts                 # 回合推进入口
│   ├── settlement.ts                  # 月度结算管线（调度各 System + 三年一考触发）
│   │
│   ├── character/                     # 角色子系统
│   │   ├── CharacterStore.ts          # 主 Store + 索引
│   │   ├── characterUtils.ts          # 工具函数
│   │   ├── personalityUtils.ts        # 性格计算
│   │   ├── successionUtils.ts         # 继承纯函数（resolveHeir / findParentAuthority）
│   │   └── types.ts                   # Character 类型
│   │
│   ├── territory/                     # 领地子系统
│   │   ├── TerritoryStore.ts          # 主 Store + 索引
│   │   ├── territoryUtils.ts          # 工具函数
│   │   └── types.ts                   # Territory / Post 类型
│   │
│   ├── official/                      # 官职子系统
│   │   ├── LedgerStore.ts             # 玩家月度收支明细
│   │   ├── economyCalc.ts             # 经济计算纯函数
│   │   ├── selectionCalc.ts           # 铨选纯函数（候选人评分/分级）
│   │   ├── selectionUtils.ts          # 铨选包装（resolveAppointAuthority / resolveLegalAppointer）
│   │   ├── appointValidation.ts       # 任命校验
│   │   ├── postQueries.ts             # 岗位查询（findEmperorId / getPendingVacancies）
│   │   ├── officialUtils.ts           # 官职工具
│   │   └── types.ts                   # PositionTemplate 等类型
│   │
│   ├── military/                      # 军事子系统
│   │   ├── MilitaryStore.ts / WarStore.ts  # 军队 / 战争 Store
│   │   ├── battleEngine.ts            # 战斗计算
│   │   ├── marchCalc.ts / siegeCalc.ts / warCalc.ts / militaryCalc.ts  # 各类军事计算
│   │   └── warSettlement.ts           # 战争结算
│   │
│   ├── interaction/                   # 玩家交互（Interaction 接口 + Action 实现 + registry）
│   │   ├── types.ts                   # Interaction 接口定义
│   │   ├── registry.ts                # 交互注册表
│   │   ├── appointAction.ts           # 任命（含 executeAppoint 统一流程）
│   │   ├── dismissAction.ts           # 罢免
│   │   ├── centralizationAction.ts    # 集权调整（赋税/继承法/辟署权）
│   │   ├── declareWarAction.ts        # 宣战
│   │   ├── demandFealtyAction.ts      # 要求臣服
│   │   └── transferVassalAction.ts    # 转封附庸
│   │
│   ├── npc/                           # NPC 引擎
│   │   ├── NpcEngine.ts               # NPC 行为调度入口
│   │   ├── NpcStore.ts                # NPC 状态（待审批方案等）
│   │   └── behaviors/
│   │       ├── appointBehavior.ts      # NPC 自动铨选（含辟署权域、皇帝缺位补位）
│   │       └── reviewBehavior.ts       # NPC 考课（评分 + 罢免 + 玩家审批）
│   │
│   └── systems/                       # 月结管线各 System
│       ├── characterSystem.ts         # 健康/老化/死亡/继承管线
│       ├── populationSystem.ts        # 年度人口变化
│       ├── socialSystem.ts            # 好感衰减/领地漂移/人才/晋升
│       ├── economySystem.ts           # 经济结算/破产检查
│       ├── militarySystem.ts          # 征兵池/士气训练/兵变
│       ├── warSystem.ts               # 行军/战斗/围城/战争分数
│       ├── buildingSystem.ts          # 建筑施工完成
│       └── reviewSystem.ts            # 考课评分纯函数
│
├── data/                              # 静态初始数据（只读）+ IndexedDB 封装
│   ├── storage.ts                     # IndexedDB 读写（saveGame/loadGame/archiveEvents 等）
│   ├── sample.ts                      # 游戏初始化数据加载器 + 基线设置
│   ├── characterGen.ts                # 随机角色生成器
│   ├── characters.ts / territories.ts / initialArmies.ts  # 初始实体数据
│   ├── institutions.ts                # 制度数据
│   ├── mapTopology.ts / positions.ts  # 地图拓扑与坐标/岗位模板
│   └── traits.ts / ranks.ts / buildings.ts / unitTypes.ts / strategies.ts / registries.ts  # 定义表
│
└── ui/                                # UI 层（React，只负责展示和触发交互）
    ├── components/                    # React 组件（~27 个）
    │   ├── SelectionFlow.tsx          # 铨选审批弹窗
    │   ├── TransferPlanFlow.tsx        # NPC 铨选方案审批（含特旨按钮）
    │   ├── ReviewPlanFlow.tsx          # 考课审批弹窗
    │   ├── CentralizationFlow.tsx      # 集权调整（赋税/继承法/辟署权切换）
    │   ├── GovernmentPanel.tsx         # 百官图（岗位 + 继承法 + 辟署权标签）
    │   ├── OfficialPanel.tsx           # 官署面板（含指定继承人交互）
    │   └── ...                         # 其他 UI 组件
    ├── layouts/                       # 布局组件（GameLayout）
    ├── hooks/                         # React hooks
    ├── panels/                        # 面板组件
    └── stores/                        # UI 状态 Store（panelStore 等）
```

---

## 三、核心 Store 与索引

各 Store **维护预计算索引**以支持 O(1) 查询，**查询时必须优先使用索引，禁止全量遍历**。

### CharacterStore（`engine/character/CharacterStore.ts`）
- `characters: Map<id, Character>` — 主数据
- `vassalIndex: Map<overlordId, Set<vassalId>>` — 附庸查询
- `aliveSet: Set<id>` — 存活角色
- 关键方法：`getCharacter()`, `getPlayer()`, `getVassalsByOverlord()`, `batchMutate(mutator)`, `killCharacter()`

### TerritoryStore（`engine/territory/TerritoryStore.ts`）
- `territories: Map<id, Territory>` — 主数据
- `postIndex: Map<postId, Post>` — 岗位查询
- `holderIndex: Map<holderId, postId[]>` — 按持有者查岗位
- `controllerIndex: Map<controllerId, Set<territoryId>>` — 按控制者查领地
- `centralPosts: Post[]` — 中央职位（注意：皇帝岗位不在此数组中，见下方说明）

### MilitaryStore（`engine/military/MilitaryStore.ts`）
- `armies: Map<id, Army>`, `battalions: Map<id, Battalion>` — 主数据
- `armyBattalionIndex: Map<armyId, Set<battalionId>>`
- `ownerArmyIndex: Map<ownerId, Set<armyId>>`
- `locationArmyIndex: Map<territoryId, Set<armyId>>`
- 关键方法：`syncArmyOwnersByPost()`, `batchMutateBattalions(mutator)`

### WarStore（`engine/military/WarStore.ts`）
- `wars / campaigns / sieges` 三个 Map
- **已知问题**：使用模块级自增计数器生成 ID（`_warIdCounter` 等），读档后会 ID 冲突，待替换为 `crypto.randomUUID()`

### LedgerStore（`engine/official/LedgerStore.ts`）
- 存储玩家每月财务收支明细，供 UI 展示

### NpcStore（`engine/npc/NpcStore.ts`）
- 存储待审批的铨选方案（`pendingTransferPlan`）和考课方案（`pendingReviewPlan`）

---

## 四、月度结算管线

入口：`TurnManager.ts` → `settlement.ts`，按以下**严格顺序**执行：

| 顺序 | System 文件 | 职责 |
|------|-------------|------|
| 1 | `characterSystem.ts` | 健康/老化/死亡/继承管线（必须最先，死亡影响后续所有系统） |
| 2 | `populationSystem.ts` | 年度人口变化 |
| 3 | `socialSystem.ts` | 好感衰减/领地漂移/人才/晋升 |
| 4 | `economySystem.ts` | 经济结算/破产检查 |
| 5 | `militarySystem.ts` | 征兵池/士气训练/兵变 |
| 6 | `warSystem.ts` | 行军/战斗/围城/战争分数 |
| 7 | `buildingSystem.ts` | 建筑施工完成 |

结算后额外触发：
- **NPC 引擎**：`runNpcEngine(date)` — NPC 自动铨选等行为
- **三年一考**：`year % 3 === 0 && month === 1` 时触发 `runReview(date)`

**规则**：不要在 `settlement.ts` 中直接写业务逻辑，应当新建 System 文件。

---

## 五、交互系统

- 定义在 `engine/interaction/`，每个行为实现 `Interaction` 接口：
  ```typescript
  interface Interaction {
    id: string; name: string; icon: string;
    canShow: (player: Character, target: Character) => boolean;
    paramType: 'none' | 'appoint' | 'dismiss' | 'centralization' | 'declareWar' | 'transferVassal';
  }
  ```
- 所有行为在 `registry.ts` 注册，UI 层通过 `InteractionMenu` 统一渲染
- **`canShow()` 必须是廉价纯布尔判断**，禁止调用 `getState()` 或数组遍历（NPC Engine 会高频调用）
- 交互操作从**角色入口触发**（点角色 → 弹出交互菜单）

---

## 六、官职与铨选系统

### 岗位模型（Post）
- 每个岗位预创建在领地上，`holderId` 即真相。任命 = 设 `holderId`，罢免 = 清 `holderId`
- Post 关键字段：`successionLaw`（clan/bureaucratic）、`hasAppointRight`、`reviewBaseline`
- **职位必须用 Post 岗位模型，不能用模板 + 运行时绑定**

### 军队绑定
- `Army.postId` 是真相源，`ownerId` 是缓存
- 岗位变动调用 `syncArmyOwnersByPost(postId, newHolderId)`

### 皇帝查找
- 皇帝岗位在 `tianxia` 领地的 posts 中，**不在 `centralPosts` 数组里**
- 查找皇帝必须用 `findEmperorId(territories, centralPosts)`（`engine/official/postQueries.ts`）
- 禁止用 `centralPosts.find(p => p.templateId === 'pos-emperor')`

### 铨选流程
- `resolveAppointAuthority(post)` → 经办人（吏部/判官/皇帝/辟署权持有人）
- `resolveLegalAppointer(authority, post)` → 法理主体（皇帝/辟署权持有人）
- 候选人池效忠链指向**法理主体**，不指向经办人
- `executeDismiss(postId, dismisserId)` 的 `dismisserId` 传**法理主体**，不传经办人
- 辟署权保护：`isBlockedByAppointRight` 沿效忠链检查，朝廷不可调走辟署权域内人员

### 三年一考
- 每三年正月触发，有地官员评分公式：人口增长×0.4 + 贤能增长×0.3 + 岗位匹配×0.3；中央和地方副职评分公式：贤能增长×0.5 + 岗位匹配×0.5
- 任期不满三年时，增长指标按 `36/实际月数` 归一化（短任期者不吃亏）
- 下等罢免，玩家管辖范围需通过 `ReviewPlanFlow` 审批
- 考课评分纯函数在 `engine/systems/reviewSystem.ts`，行为逻辑在 `npc/behaviors/reviewBehavior.ts`

### 继承系统
- 宗法继承：`resolveHeir()`，绝嗣上交 `findParentAuthority()`
- 辟署权拦截：`findAppointRightHolder()`（沿 parentId 全链查找）
- 死亡继承管线在 `characterSystem.ts`
- 好感继承：死者好感×0.5 → "先辈余泽"
- 玩家死亡 → playerId 切换 / 王朝覆灭事件

---

## 七、核心架构约定（必须遵守）

### 批量写入
- 月结等批量操作**必须使用 `batchMutate`**，禁止循环中多次 `setState`

### 纯函数分离
- `engine/` 下的计算函数（`economyCalc.ts`、`battleEngine.ts`、`selectionCalc.ts`、`reviewSystem.ts` 等）必须是**纯函数**，不得内部调用 `getState()`
- 所有 `getState()` 调用在 System 层、behaviors 或 Store action 中完成，结果以参数传入

### ID 生成
- **必须使用 `crypto.randomUUID()`**，禁止模块级自增计数器（读档后会 ID 冲突）

---

## 八、禁止事项

- **不要引入新 npm 依赖**（除非用户明确授权）
- **不要修改 `data/` 下的静态数据文件**（除非任务明确要求）
- **不要在 `ui/` 组件中写游戏逻辑**（UI 只读 Store + 调用 interaction registry）
- **不要循环调用 `setState`**（必须用 `batchMutate`）

---

## 九、当前开发阶段

项目处于 **Phase 4（已完成 4a + 4b）**。核心游戏循环、继承系统、铨选系统、考课系统均已实现。

### 已完成（Phase 4a/4b）
- 继承法 + 辟署权（宗法继承、绝嗣上交、辟署权拦截）
- 流官铨选（分级任命权、候选人三层分级、连锁铨选、辟署权域自动铨选）
- 三年一考（考课评分 + 审批 + 任期归一化）
- 继承交互（指定继承人、治所联动、继承法/辟署权切换）
- NPC 引擎基础（自动铨选 + 考课行为）
- 角色生成器（characterGen.ts，~100 随机角色 + 闲散人才池）
- 百官图、集权调整 UI

### 尚未完成
- 存档/读档 UI 界面（底层 `storage.ts` 已实现）
- AI 史书（GameEvent → 大模型生成史书文本）
- 生育系统（宗法继承长期运转的基础）
- 人才自然生成（"进士及第"/"举孝廉"机制）
- 非宗法皇位更替（禅让/篡位/权臣拥立）
- 正统性系统、权知机制
- 谋略/派系系统（Phase 6）

### 已知待修复
1. `WarStore.ts` 模块级自增 ID → 需替换为 `crypto.randomUUID()`

---

## 十、数据规模

| 实体 | 当前 | 目标 |
|------|------|------|
| 角色 | ~160（52 史实 + ~100 随机生成 + 闲散） | 300~500 |
| 州 | ~74 | — |
| 军队 | ~43 | — |
| 营 | ~378 | 随角色增长 |

### 军事经济基准
- 1 牙兵 = 2 斛粮/月
- 长安 ~2万、洛阳 ~1万、太原 ~1万、成都 ~1.8万、扬州 ~3万（以粮产自养上限）
