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
| 地图 | `d3-delaunay` Voronoi 多边形 + SVG clipPath 疆域裁剪 |
| 测试 | `vitest`，**只测纯函数**，不测 Store 状态流转；`npx vitest run` 当前 14 个文件 318 个测试 |
| 构建 | `pnpm build`（tsc -b && vite build），产物纯静态 |
| 开发 | `pnpm dev` |
| 测试命令 | `npx vitest run` |
| 路径别名 | `@` → `src/`，`@engine` → `src/engine/`，`@data` → `src/data/`，`@ui` → `src/ui/` |
| 工作目录 | CWD 为 `D:\桌面\CC`，项目代码在 `wantang/` 子目录 |
| 文档 | `docs/` 目录：GDD-v2.0（权威设计案）、milestones.md（进度）、design/（活跃方案）、archive/（历史文档）、reference/（参考资料） |

---

## 二、目录结构

```
wantang/src/
├── engine/                            # 游戏引擎层（与 UI 完全解耦）
│   ├── types.ts / random.ts / utils.ts / TurnManager.ts / settlement.ts / storage.ts
│   ├── init/loadSampleData.ts         # 开局数据组装
│   ├── character/                     # CharacterStore + 工具 + 生成器 + 继承
│   ├── territory/                     # TerritoryStore + 工具
│   ├── official/                      # 官职：经济/铨选/正统性/地图着色/岗位查询
│   ├── military/                      # MilitaryStore/WarStore + 战斗/行军/围城/结算
│   ├── interaction/                   # 玩家交互 Action（任命/罢免/宣战/集权等）
│   ├── npc/                           # NPC Engine 框架 + 10 个行为模块
│   └── systems/                       # 月结管线各 System（9 个）
├── data/                              # 纯静态数据（JSON + 定义表 + 索引，禁止放逻辑）
├── ui/                                # React UI 层（只读 Store + 调用 interaction）
│   ├── components/                    # GameMap / CampaignPopup / MapPlaceholder 等 ~27 个
│   │   └── base/                      # 基础组件库：Modal / ModalHeader / Button
│   ├── layouts/ / hooks/ / panels/ / stores/
└── __tests__/
    ├── data/                          # 数据完整性（positions / ranks / buildings / traits / map）
    ├── engine/                        # 纯函数（dateUtils / territoryUtils / battleEngine /
    │                                  #         economyCalc / reviewSystem / selectionCalc）
    └── phase*.test.ts                 # 重构安全网（已有 3 个，锁定数据契约和正统性公式）
```

### 测试原则
- **测什么**：纯函数（Calc 模块、dateUtils、territoryUtils、reviewSystem、selectionCalc）和静态数据完整性
- **不测什么**：Store 状态流转、结算管线顺序、NPC 决策（依赖随机 + 完整游戏状态，ROI 低）
- 每个测试必须写**具体期望数值**，禁止只写 `toBeGreaterThan(0)`，确保公式被无意修改时能立刻报警

---

## 三、核心 Store 与索引

各 Store **维护预计算索引**以支持 O(1) 查询，**查询时必须优先使用索引，禁止全量遍历**。

- **CharacterStore**：`characters` Map + `vassalIndex` + `aliveSet` + `refreshIsRuler()`
- **TerritoryStore**：`territories` Map + `postIndex` + `holderIndex` + `controllerIndex` + `expectedLegitimacy` 缓存
- **MilitaryStore**：`armies` / `battalions` Map + `ownerArmyIndex` + `locationArmyIndex` + `syncArmyOwnersByPost()`
- **WarStore**：`wars` / `campaigns` / `sieges` 三个 Map
- **NpcStore**：`playerTasks` 队列 + 旧字段（`TODO(phase6-cleanup)`）

---

## 四、日结/月结双层结算管线

时间系统采用**日结驱动**（现实平年日历，365天/年），各系统按不同频率触发。

入口：`TurnManager.ts` → `settlement.ts`

### 日结管线（每日触发，dailyCallback）
- `warSystem` — 行军（marchSpeed 累积器）/战斗/围城/战争分数
- `NpcEngine`（非月初）— NPC 日结决策（daily 行为每天检测，monthly-slot 行为按哈希槽位+品级分档）

### 月结管线（每月初 day===1 触发，monthlyCallback），严格顺序：
1. `characterSystem` — 健康/死亡/继承（必须最先）
2. `NpcEngine` — NPC 决策（月初在 characterSystem 之后，保证继承先完成）
3. `populationSystem` — 年度人口（仅 month===1）
4. `socialSystem` — 好感/领地漂移/晋升
5. `economySystem` — 经济/破产
6. `militarySystem` — 征兵池/士气/兵变
7. `eraSystem` — 时代进度
8. `buildingSystem` — 建筑施工

### 日期工具
- `dateUtils.ts`：`getDaysInMonth` / `toAbsoluteDay` / `addDays` / `diffDays` / `diffMonths` 等
- 禁止手写 `(y2-y1)*12+(m2-m1)` 日期算术，必须用 `dateUtils`

**规则**：不要在 `settlement.ts` 中直接写业务逻辑，应当新建 System 或 NpcBehavior。

---

## 五、关键架构约定（必须遵守）

### 岗位变动三连
所有修改 `grantsControl` 岗位 `holderId` 的地方，**必须配套**：
1. `syncArmyOwnersByPost(postId, newHolderId)` — 军队跟随岗位转移
2. `refreshIsRuler(collectRulerIds(territories))` — 刷新统治者标记
3. （如适用）`refreshExpectedLegitimacy()` — 正统性缓存

当前已在 4 处配套：`appointAction` / `dismissAction` / `characterSystem`（继承）/ `warSettlement`

### 私兵继承
- `postId: null` 的军队不受 `syncArmyOwnersByPost` 管理
- owner 死亡时：有继承人 → 转给 primaryHeir；绝嗣 → disbandArmy 解散

### 皇帝查找
- 皇帝岗位在 `tianxia` 领地上，**不在 `centralPosts` 数组里**
- 必须用 `findEmperorId(territories, centralPosts)`

### 铨选语义
- 候选人池效忠链指向**法理主体**，不指向经办人
- `executeDismiss` 的 `dismisserId` 传**法理主体**，不传经办人

### 纯函数分离
- `engine/` 下的 Calc 模块必须是**纯函数**，不得调用 `getState()`
- Utils 文件是便捷包装层，允许读 Store 后委派给纯函数

### UI 组件规范
- 新建弹窗/流程组件**必须使用** `base/` 基础组件：`<Modal>`、`<ModalHeader>`、`<Button>`
- `Modal` size：`sm`=max-w-sm / `md`=max-w-md / `lg`=max-w-lg / `xl`=max-w-4xl
- `Button` variant：`default`（默认）/ `primary`（金色确认）/ `danger`（红色警告）/ `ghost`（无边框）/ `icon`（圆形图标）
- 颜色、字号、圆角、阴影均通过 `index.css` 的 CSS 变量控制，**禁止在组件内硬编码颜色值**
- 新弹窗禁止直接写 `fixed inset-0 bg-black/50` 遮罩，统一用 `<Modal>`

### 其他规则
- 批量操作**必须用 `batchMutate`**，禁止循环 `setState`
- ID 生成**必须用 `crypto.randomUUID()`**，禁止自增计数器
- `data/` 只存纯数据和索引，不放逻辑
- `ui/` 不写游戏逻辑，只读 Store + 调用 interaction
- `canShow()` 必须是廉价纯布尔判断
- 不引入新 npm 依赖（除非用户授权）

---

## 六、NPC Engine（已日结化）

- 9 个行为模块：铨选 / 考课 / 宣战 / 要求效忠 / 动员 / 补员 / 赏赐 / 建设 / 和谈
- `playerMode`：`push-task`（行政职责）/ `skip`（自愿行为）/ `auto-execute`
- `schedule`：`daily`（每天检测，默认 push-task）/ `monthly-slot`（按槽位，默认 skip/auto-execute）
- `weight` = 百分比概率，`forced` = 强制执行（forced 每天检测，日历型需自带 day===1 守卫）
- `maxActions` = `clamp(0, 3, round(1 + energy × 4))`，品级<9 上限 1
- **哈希槽位调度**：`hash(actorId + ':' + behaviorId) % 28 + 1` 决定月内执行日
- **品级分档频率**：王公(25+) 2次/月，节度使(17-24) 1次/月，刺史(12-16) 1次/2月，县令(0-11) 1次/3月
- 新增行为：实现 `NpcBehavior` → `registerBehavior()` → 自动调度，默认从 playerMode 推断 schedule

---

## 七、战争系统要点

- **宣战理由**：武力兼并（危世仅辟署权持有者可用，治世不可见）/ 法理宣称 / 独立
- **独立战争**：宣战即脱离效忠，败北恢复
- **关隘通行**：己方/臣属控制或己方占领 → 通行；被敌方占领 → 阻隔（即使原控制者是己方）
- **行营 AI**：寻路→行军→围城→推进→撤退→重新出击，玩家行营跳过 AI
- **战斗触发**：同一州的同战争敌对行营自动交战，无战争关系不交战
- **对向行军拦截**：后置交叉检测（行军结算之后），仅当甲从 X→Y、乙从 Y→X **同一天互换位置**时触发，相遇在防守方原始位置；速度不一致时由常规战斗检测接手（`warSystem.ts`）
- **地图行军 UI**：CK3 风格，在地图上点击选目的地，金色虚线显示路径

---

## 八、当前开发阶段

**NPC Engine 日结化已完成。** 核心循环、继承、铨选、考课、正统性、NPC Engine（9 个行为）、战争系统均已实现并可自主运转。时间系统全面日结（CK3 风格）：战争按日推进，NPC 决策按哈希槽位+品级分档分散到月内不同天，其余系统保持月结。时间控制 UI 采用 CK3 风格（日期+播放键+三档毛边色块，空格暂停，+/-加减速）。

### 尚未完成
- 存档/读档 UI（底层已实现）
- AI 史书（GameEvent → 大模型生成史书文本）
- 生育系统（宗法继承长期运转基础）
- 人才自然生成（进士及第/举孝廉）
- 非宗法皇位更替（禅让/篡位/权臣拥立）
- 权知机制
- 谋略/派系系统
- NPC 事件通知 UI（宣战/效忠变化推送）
- 地图增强：选中领主高亮、封臣名标签、效忠链箭头
- 行营AI目标选择优化（都统性格+攻守态势）
- 强力CB（一次宣战多个领地）
- NPC Engine 旧 UI 兼容层清理（`TODO(phase6-cleanup)`）

---

## 九、数据规模

| 实体 | 当前 |
|------|------|
| 角色 | ~160（79 史实 + ~80 随机生成） |
| 领地 | 72（1 天下 + 5 国 + 17 道 + 49 州） |
| 军队 | 41 |
| 营 | 366 |

军事经济基准：1 牙兵 = 2 斛粮/月
