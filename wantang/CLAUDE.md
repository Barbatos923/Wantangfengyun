# CLAUDE.md — 《晚唐风云》项目说明书

> 本文件供 Claude Code 在每次会话开始时读取，以替代对代码库的全局扫描。
> **在开始任何任务之前，请先完整阅读本文件，然后只读取与任务直接相关的文件。如需了解某个目录的具体文件列表，请按需 `ls` 查看，不要主动扫描整个代码库。**

---

## 一、工作目录与项目结构

- **项目代码位于 `wantang/` 子目录**，所有源码在 `wantang/src/` 下。
- 路径别名：`@` → `src/`，`@engine` → `src/engine/`，`@data` → `src/data/`，`@ui` → `src/ui/`

---

## 二、技术栈

- **框架**：Vite 8 + React 19 + TypeScript 5.9 + Zustand 5 + TailwindCSS 4
- **存储**：IndexedDB（通过 `idb` 库），无后端，无外部 API 依赖（目前）
- **随机数**：`seedrandom`（用于确定性随机，封装在 `src/engine/random.ts`）
- **构建**：`pnpm build`（`tsc -b && vite build`），产物为纯静态文件
- **开发服务器**：`pnpm dev`

---

## 三、目录结构（子目录级别）

```
wantang/src/
├── main.tsx / App.tsx / index.css   # 应用入口与全局样式
│
├── engine/                   # 游戏引擎层（核心逻辑，与 UI 完全解耦）
│   ├── types.ts              # 全局共享类型（GameDate, GameEvent, Resource 等）
│   ├── TurnManager.ts        # 回合推进入口
│   ├── settlement.ts         # 月度结算管线，按优先级依次调用各 System
│   ├── random.ts             # 确定性随机数封装（基于 seedrandom）
│   ├── utils.ts              # 通用工具函数
│   │
│   ├── character/            # 角色子系统（类型、Store、工具函数、性格计算）
│   ├── territory/            # 领地子系统（类型、Store、工具函数）
│   ├── official/             # 官职子系统（类型、Store、经济计算、任命校验、岗位查询）
│   ├── military/             # 军事子系统（类型、Store、战斗/行军/围城/战争计算）
│   ├── interaction/          # 玩家交互系统（行为注册表及各 Action 实现）
│   └── systems/              # 月结管线中的各独立 System（经济、军事、战争、角色、社会、建筑、人口等）
│
├── data/                     # 静态初始数据（只读）
│   ├── storage.ts            # IndexedDB 封装（saves/chronicles/events 三张表）
│   ├── sample.ts             # 游戏初始化数据加载器
│   ├── mapTopology.ts        # 地图拓扑（州之间的邻接关系 ALL_EDGES）
│   └── ...                   # 角色、领地、军队、建筑、职位、阶级、策略等静态数据
│
└── ui/                       # UI 层（React 组件，只负责展示和触发交互）
    ├── components/           # 通用与功能组件（含 GameMap.tsx SVG 地图）
    ├── panels/               # 面板类组件
    ├── layouts/              # 布局组件
    ├── hooks/                # 自定义 React Hooks
    └── stores/               # UI 层专属的轻量状态（非游戏引擎状态）
```

---

## 四、核心架构约定（必须遵守）

**状态管理**：所有游戏状态存储在 Zustand Store 中，分布在各子系统目录下。批量状态写入必须使用 `batchMutate`，禁止在循环中多次调用 `setState`。Store 中维护了多个预计算索引（`vassalIndex`、`aliveSet`、`ownerArmyIndex` 等），查询时优先使用这些索引，禁止对全量数据进行线性遍历。

**纯函数与副作用分离**：`src/engine/` 下的计算函数（如 `economyCalc.ts`、`battleEngine.ts`）应当是纯函数，接受数据参数，返回计算结果，**不得在内部调用 `getState()`**。所有 `getState()` 调用应当在 System 层或 Store 的 action 中进行，计算结果以参数形式传入纯函数。

**ID 生成**：所有新生成的实体 ID 必须使用 `crypto.randomUUID()`，禁止使用模块级自增计数器（如 `let _counter = 1`），因为后者在读取存档后会重置并产生 ID 冲突。

**月度结算管线**：月结入口为 `TurnManager.ts` → `settlement.ts`。`settlement.ts` 按优先级依次调用 `src/engine/systems/` 下的各 System，不要在 `settlement.ts` 中直接写业务逻辑，应当新建 System 文件。

**交互系统**：`canShow()` 方法必须是廉价的纯布尔判断，禁止在其中调用 `getState()` 或进行数组遍历（未来 NPC Engine 会对每个 NPC 的每个行为高频调用此方法）。

---

## 五、当前开发阶段与已知待办

**当前阶段**：Phase 3~4 测试阶段。核心游戏循环（月结算、战争、经济、官职任免）已实现。以下功能尚未完成：存档/读档的 UI 界面（底层 `storage.ts` 已实现）、NPC Engine（所有 NPC 目前是木桩）、AI 史书功能、继承系统（Phase 4）、谋略/派系系统（Phase 6）。

**已知架构问题（待修复，详见 `Wantangfengyun_Claude_Code_Instructions.md`）**：
1. `WarStore.ts` 中存在模块级自增 ID（`_warIdCounter`、`_campaignIdCounter`、`_siegeIdCounter`），需替换为 `crypto.randomUUID()`。
2. `dismissAction.ts` 等交互文件中混入了核心业务逻辑，需下沉到领域层。

---

## 六、游戏数据规模（当前）

当前初始数据约为：角色 ~52 人、领地（州）~74 个、军队 ~43 支、营 ~378 个。未来规划角色大幅增加（目标 300~500 人），营数量也会相应增加。

---

## 七、禁止事项

- 不要引入新的 npm 依赖，除非明确获得用户授权。
- 不要修改 `src/data/` 下的静态数据文件，除非任务明确要求修改初始数据。
- 不要在 `src/ui/` 的组件中直接写游戏逻辑，UI 层只负责读取 Store 状态和调用 `interaction/registry.ts` 中注册的行为。
- 不要在循环中多次调用 `setState`，必须使用 `batchMutate`。
