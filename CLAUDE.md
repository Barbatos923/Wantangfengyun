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
│   ├── settlement.ts                  # 月度结算管线（调度各 System）
│   │
│   ├── character/                     # 角色子系统（CharacterStore + 工具函数 + 性格计算）
│   ├── territory/                     # 领地子系统（TerritoryStore + 工具函数）
│   ├── official/                      # 官职子系统（岗位查询 + 经济计算 + LedgerStore）
│   ├── military/                      # 军事子系统（MilitaryStore + WarStore + 战斗/行军/围城计算）
│   ├── interaction/                   # 玩家交互（Interaction 接口 + 各 Action 实现 + registry）
│   └── systems/                       # 月结管线各 System（见下方"月度结算"节）
│
├── data/                              # 静态初始数据（只读）+ IndexedDB 封装
│   ├── storage.ts                     # IndexedDB 读写（saveGame/loadGame/archiveEvents 等）
│   ├── sample.ts                      # 游戏初始化数据加载器
│   ├── characters.ts / territories.ts / initialArmies.ts  # 初始实体数据
│   ├── mapTopology.ts / positions.ts  # 地图拓扑与坐标
│   └── traits.ts / ranks.ts / buildings.ts / unitTypes.ts / strategies.ts / registries.ts  # 定义表
│
└── ui/                                # UI 层（React，只负责展示和触发交互）
    ├── components/                    # 所有 React 组件（~23 个）
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
- `centralPosts: Post[]` — 中央职位

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

---

## 四、月度结算管线

入口：`TurnManager.ts` → `settlement.ts`，按以下**严格顺序**执行：

| 顺序 | System 文件 | 职责 |
|------|-------------|------|
| 1 | `characterSystem.ts` | 健康/老化/死亡/压力/成长（必须最先，死亡影响后续所有系统） |
| 2 | `populationSystem.ts` | 年度人口变化 |
| 3 | `socialSystem.ts` | 好感衰减/领地漂移/人才/晋升 |
| 4 | `economySystem.ts` | 经济结算/破产检查 |
| 5 | `militarySystem.ts` | 征兵池/士气训练/兵变 |
| 6 | `warSystem.ts` | 行军/战斗/围城/战争分数 |
| 7 | `buildingSystem.ts` | 建筑施工完成 |

**规则**：不要在 `settlement.ts` 中直接写业务逻辑，应当新建 System 文件。

---

## 五、交互系统

- 定义在 `engine/interaction/`，每个行为实现 `Interaction` 接口：
  ```typescript
  interface Interaction {
    id: string; name: string; icon: string;
    canShow: (player: Character, target: Character) => boolean;
    paramType: 'none' | 'appoint' | 'dismiss' | 'centralization' | 'declareWar';
  }
  ```
- 所有行为在 `registry.ts` 注册
- **`canShow()` 必须是廉价纯布尔判断**，禁止调用 `getState()` 或数组遍历（未来 NPC Engine 会高频调用）

---

## 六、核心架构约定（必须遵守）

### 批量写入
- 月结等批量操作**必须使用 `batchMutate`**，禁止循环中多次 `setState`

### 纯函数分离
- `engine/` 下的计算函数（`economyCalc.ts`、`battleEngine.ts` 等）必须是**纯函数**，不得内部调用 `getState()`
- 所有 `getState()` 调用在 System 层或 Store action 中完成，结果以参数传入

### ID 生成
- **必须使用 `crypto.randomUUID()`**，禁止模块级自增计数器（读档后会 ID 冲突）

### 岗位模型（Post）
- 职位必须用 Post 岗位模型，不能用模板 + 运行时绑定
- `Army.postId` 是真相源，`ownerId` 是缓存，用 `syncArmyOwnersByPost` 同步

---

## 七、禁止事项

- **不要引入新 npm 依赖**（除非用户明确授权）
- **不要修改 `data/` 下的静态数据文件**（除非任务明确要求）
- **不要在 `ui/` 组件中写游戏逻辑**（UI 只读 Store + 调用 interaction registry）
- **不要循环调用 `setState`**（必须用 `batchMutate`）

---

## 八、当前开发阶段

项目处于 **Phase 3~4**。核心游戏循环（月结算、战争、经济、官职任免）已实现。

### 尚未完成
- 存档/读档 UI 界面（底层 `storage.ts` 已实现）
- NPC Engine（NPC 目前不会主动行动）
- AI 史书（GameEvent → 大模型生成史书文本）
- 继承系统（Phase 4 设计已产出）
- 谋略/派系系统（Phase 6）

### 已知待修复
1. `WarStore.ts` 模块级自增 ID → 需替换为 `crypto.randomUUID()`
2. `dismissAction.ts` 等交互文件混入核心逻辑 → 需下沉到领域层

---

## 九、数据规模

| 实体 | 当前 | 目标 |
|------|------|------|
| 角色 | ~52 | 300~500 |
| 州 | ~74 | — |
| 军队 | ~43 | — |
| 营 | ~378 | 随角色增长 |
