# CLAUDE.md — 《晚唐风云》项目说明书

> 本文件供 Claude Code 在每次会话开始时读取，以替代对代码库的全局扫描。
> **在开始任何任务之前，请先完整阅读本文件，然后只读取与任务直接相关的文件。**

---

## 一、项目概述

《晚唐风云》是一款以晚唐（约 867 AD）为背景的单机历史策略模拟游戏，灵感来自 CK3，但专注于中国历史特色（官职体系、藩镇割据、兵变、史书叙事）。

- **技术栈**：Vite 8 + React 19 + TypeScript 5.9 + Zustand 5 + TailwindCSS 4
- **存储**：IndexedDB（通过 `idb` 库），无后端，无外部 API 依赖（目前）
- **构建**：`pnpm build`（`tsc -b && vite build`），产物为纯静态文件
- **开发服务器**：`pnpm dev`
- **路径别名**：`@` → `src/`，`@engine` → `src/engine/`，`@data` → `src/data/`，`@ui` → `src/ui/`

---

## 二、目录结构

```
wantang/src/
├── main.tsx                  # 应用入口，挂载 React
├── App.tsx                   # 根组件，负责初始化游戏数据并渲染主界面
├── index.css                 # 全局样式，CSS 变量定义（古风配色）
│
├── engine/                   # 游戏引擎层（核心逻辑，与 UI 完全解耦）
│   ├── types.ts              # 全局共享类型（GameDate, GameEvent, Resource 等）
│   ├── index.ts              # 引擎层统一导出
│   ├── TurnManager.ts        # 回合推进入口，调用 runMonthlySettlement
│   ├── settlement.ts         # 月度结算管线，按优先级依次调用各 System
│   │
│   ├── character/            # 角色子系统
│   │   ├── types.ts          # Character 类型定义（含八维性格 PersonalityVector）
│   │   ├── CharacterStore.ts # Zustand Store，含 vassalIndex、aliveSet 等索引
│   │   ├── characterUtils.ts # 角色工具函数（纯函数）
│   │   └── personalityUtils.ts # 性格计算（calcPersonality, calcMaxActions）
│   │
│   ├── territory/            # 领地子系统
│   │   ├── types.ts          # Territory/Zhou/Dao 类型定义
│   │   └── TerritoryStore.ts # Zustand Store，含 zhouIndex、daoIndex 等索引
│   │
│   ├── official/             # 官职子系统
│   │   ├── types.ts          # Post/Appointment 类型定义
│   │   ├── officialUtils.ts  # 官职工具函数（含 getDynamicTitle 等）
│   │   ├── postQueries.ts    # 岗位查询纯函数
│   │   └── economyCalc.ts    # 月度经济计算（calculateMonthlyLedger）
│   │
│   ├── military/             # 军事子系统
│   │   ├── types.ts          # Army/Battalion 类型定义
│   │   ├── WarStore.ts       # 战争状态 Zustand Store
│   │   └── battleEngine.ts   # 战斗结算纯逻辑
│   │
│   ├── interaction/          # 玩家交互系统（UI 触发的行为）
│   │   ├── types.ts          # Interaction 接口定义
│   │   ├── registry.ts       # 所有 Interaction 的注册表
│   │   ├── index.ts          # 统一导出
│   │   ├── appointAction.ts  # 任命行为
│   │   └── dismissAction.ts  # 罢免行为（及其他 Action 文件）
│   │
│   └── systems/              # 月结管线中的各个独立 System
│       ├── characterSystem.ts  # 角色健康、老化、死亡
│       ├── economySystem.ts    # 经济结算调度
│       ├── militarySystem.ts   # 军队补员、维护
│       ├── warSystem.ts        # 行军、战斗、围城（最复杂的 System）
│       └── socialSystem.ts     # 好感度衰减、关系变化
│
├── data/                     # 静态初始数据（只读，不要在运行时修改这里的文件）
│   ├── index.ts              # 数据层统一导出（含 saveGame, loadGame）
│   ├── storage.ts            # IndexedDB 封装（saves/chronicles/events 三张表）
│   ├── sample.ts             # 游戏初始化数据加载器
│   ├── characters.ts         # 初始角色数据（约 52 个角色）
│   ├── territories.ts        # 初始领地数据（约 74 个领地，含州/道层级）
│   ├── initialArmies.ts      # 初始军队数据（约 43 支军队，378 个营）
│   ├── mapTopology.ts        # 地图拓扑（州之间的邻接关系 ALL_EDGES）
│   ├── traits.ts             # 特质定义
│   └── ...                   # 其他静态数据文件
│
└── ui/                       # UI 层（React 组件，只负责展示和触发交互）
    ├── components/           # 所有 React 组件
    │   ├── GameMap.tsx       # SVG 地图（基于 ZHOU_POSITIONS 静态坐标，viewBox 1600×1000）
    │   ├── LeftPanel.tsx     # 左侧面板
    │   ├── BottomBar.tsx     # 底部信息栏
    │   └── ...               # 其他 UI 组件
    └── ...
```

---

## 三、核心架构约定（必须遵守）

### 状态管理
- 所有游戏状态存储在 Zustand Store 中，分布在各子系统目录下（`CharacterStore`、`TerritoryStore`、`WarStore` 等）。
- **批量状态写入必须使用 `batchMutate`**，禁止在循环中多次调用 `setState`，以避免触发大量 React re-render。
- Store 中维护了多个预计算索引（`vassalIndex`、`aliveSet`、`ownerArmyIndex` 等），**查询时优先使用这些索引，禁止对全量数据进行线性遍历**。

### 纯函数与副作用分离
- `src/engine/` 下的计算函数（如 `economyCalc.ts`、`battleEngine.ts`）应当是**纯函数**，接受数据参数，返回计算结果，**不得在内部调用 `getState()`**。
- 所有 `getState()` 调用应当在 System 层（`src/engine/systems/`）或 Store 的 action 中进行，计算结果以参数形式传入纯函数。

### ID 生成
- **所有新生成的实体 ID 必须使用 `crypto.randomUUID()`**，禁止使用模块级自增计数器（如 `let _counter = 1`），因为后者在读取存档后会重置并产生 ID 冲突。

### 月度结算管线
- 月结入口：`TurnManager.ts` → `settlement.ts`
- `settlement.ts` 按优先级依次调用 `src/engine/systems/` 下的各 System，**不要在 settlement.ts 中直接写业务逻辑**，应当新建 System 文件。

### 交互系统
- 玩家可触发的行为定义在 `src/engine/interaction/` 下，每个行为实现 `Interaction` 接口。
- `canShow()` 方法必须是**廉价的纯布尔判断**，禁止在其中调用 `getState()` 或进行数组遍历（未来 NPC Engine 会对每个 NPC 的每个行为调用此方法）。

---

## 四、当前开发阶段与已知待办

### 当前阶段
项目处于 **Phase 3~4** 测试阶段。核心游戏循环（月结算、战争、经济、官职任免）已实现，但以下功能尚未完成：
- 存档/读档的 **UI 界面**（底层 `storage.ts` 已实现）
- **NPC Engine**（所有 NPC 目前是木桩，不会主动行动）
- **AI 史书**功能（将 GameEvent 通过大模型转写为史书文本）
- 继承系统（Phase 4）
- 谋略/派系系统（Phase 6）

### 已知架构问题（待修复，详见 `Wantangfengyun_Claude_Code_Instructions.md`）
1. `WarStore.ts` 中存在模块级自增 ID，需替换为 `crypto.randomUUID()`。
2. `dismissAction.ts` 等交互文件中混入了核心业务逻辑，需下沉到领域层。
3. `economyCalc.ts` 中存在 O(N²) 嵌套重算，当有官职角色超过 150 人时需优化。

---

## 五、游戏数据规模（当前）

| 实体 | 数量 |
|---|---|
| 角色 | ~52 人 |
| 领地（州） | ~74 个 |
| 军队 | ~43 支 |
| 营 | ~378 个 |

未来规划：角色大幅增加（目标 300~500 人），营数量也会相应增加。

---

## 六、禁止事项

- **不要引入新的 npm 依赖**，除非明确获得用户授权。
- **不要修改 `src/data/` 下的静态数据文件**（`characters.ts`、`territories.ts` 等），除非任务明确要求修改初始数据。
- **不要在 `src/ui/` 的组件中直接写游戏逻辑**，UI 层只负责读取 Store 状态和调用 `interaction/registry.ts` 中注册的行为。
- **不要在单次 `setState` 之外的循环中多次调用 `setState`**，必须使用 `batchMutate`。
