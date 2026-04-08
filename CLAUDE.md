# CLAUDE.md — 《晚唐风云》项目指南

> **开始任务前先读本文件，再只读取与任务直接相关的文件。**
> 详细参考资料见 `docs/reference/`，开发进度见 `docs/milestones.md`。

---

## 一、项目概述

晚唐（约 867 AD）历史策略模拟单机游戏，灵感来自 CK3。

| 项目 | 值 |
|---|---|
| 技术栈 | Vite 8 + React 19 + TypeScript 5.9 (strict) + Zustand 5 + TailwindCSS 4 |
| 存储 | IndexedDB（`idb` 库），`wantang-db`，三张表 |
| 构建 | `pnpm build` / 开发 `pnpm dev` / 测试 `npx vitest run`（16 文件 352 测试） |
| 路径别名 | `@` → `src/`，`@engine` → `src/engine/`，`@data` → `src/data/`，`@ui` → `src/ui/` |
| 随机数 | `seedrandom` 确定性 RNG，入口 `engine/random.ts` |
| 地图 | `d3-delaunay` Voronoi + SVG clipPath |
| 数据规模 | ~160 角色、72 领地、41 军队、366 营 |

---

## 二、目录结构

```
src/
├── engine/          # 游戏引擎（与 UI 解耦）
│   ├── character/   # CharacterStore + 工具 + 生成器 + 继承
│   ├── territory/   # TerritoryStore + 工具
│   ├── official/    # 官职：经济/铨选/正统性/岗位查询/postTransfer原子操作
│   ├── military/    # MilitaryStore/WarStore + 战斗/行军/围城/结算
│   ├── interaction/ # 玩家交互 Action（任命/罢免/宣战/调任/剥夺/篡夺等）
│   ├── decision/    # 决议系统（称王/称帝/建镇/销毁头衔）
│   ├── npc/         # NPC Engine 框架 + 31 个行为模块
│   └── systems/     # 月结管线各 System（9 个）
├── data/            # 纯静态数据（JSON + 定义表，禁止放逻辑）
├── ui/              # React UI 层（只读 Store + 调用 interaction）
│   └── components/base/  # Modal / ModalHeader / Button
└── __tests__/       # 纯函数 + 数据完整性测试
```

---

## 三、核心 Store 与索引

各 Store **维护预计算索引**，**查询时必须优先使用索引，禁止全量遍历**。

- **CharacterStore**：`characters` Map + `vassalIndex` + `aliveSet` + `refreshIsRuler()`
- **TerritoryStore**：`territories` Map + `postIndex` + `holderIndex` + `controllerIndex` + `expectedLegitimacy` + `policyOpinionCache`
- **MilitaryStore**：`armies`/`battalions` Map + `ownerArmyIndex` + `locationArmyIndex`
- **WarStore**：`wars`/`campaigns`/`sieges` 三个 Map
- **NpcStore**：`playerTasks` 队列

---

## 四、日结/月结结算管线

入口：`TurnManager.ts` → `settlement.ts`（禁止在此写业务逻辑）

**日结**：`warSystem`（行军/战斗/围城）→ `NpcEngine`（非月初）
**月结**（严格顺序）：characterSystem → NpcEngine → populationSystem(年) → socialSystem → economySystem → militarySystem → eraSystem → buildingSystem

日期工具用 `dateUtils.ts`，禁止手写日期算术。

---

## 五、关键架构约定（必须遵守）

### 岗位变动原子操作
所有岗位变更**必须通过 `postTransfer.ts` 原子操作**，禁止内联 `updatePost` + 级联。
详细操作清单和各场景调用表见 **`docs/reference/post-transfer-table.md`**。

### 治所州联动
道级 `capitalZhouId` 治所州随道级主岗联动（任命/罢免/继承/战争/铨选跳过/篡夺前置）。
**注意**：`capitalZhouSeat` 不自带 `cascadeSecondaryOverlord`，需调用方手动补充。

### 好感系统双轨制
- **实时计算**：`calculateBaseOpinion` 从状态算出（特质/亲属/正统性/政策），`policyOpinionCache` 自维护
- **事件存储**：`addOpinion(decayable: true)` 一次性事件，逐月衰减
- **禁止** `setOpinion` + `decayable: false`

### 层级隔离
- `engine/` **禁止** import `@ui/`，通知玩家用 `storyEventBus.ts`
- `ui/` 不写游戏逻辑，只读 Store + 调用 interaction

### UI 组件规范
- 弹窗用 `<Modal>` + `<ModalHeader>` + `<Button>`，禁止硬编码颜色/遮罩

### 纯函数分离
- `engine/` 下 Calc 模块必须是纯函数，不调 `getState()`
- Utils 是包装层，允许读 Store 委派给纯函数

### 自我领主防御
`updateCharacter(X, { overlordId: Y })` 必须确保 `X !== Y`。CharacterStore 有 DEBUG 监测。

### 国库系统（私产/国库分离）
- **国库**存 `Territory.treasury: {money, grain}`，仅州级；**私产**存 `Character.resources.money/grain`
- `Character.capital`（治所州ID）：NPC 岗位变动时自动选（`refreshCapital`），玩家显式迁都（`moveCapitalAction`，360天CD）
- **月结收支路由**：领地产出→该州国库；俸禄→私产；贡奉各州→overlord capital；回拨 capital→臣属 capital；属官俸禄从 capital 扣
- **军费**：`findPath` 找最近友方州国库扣粮，关隘阻断→士气-10/月，无领地→私产扣
- **一次性花费**：征兵/补员→homeTerritory 国库；赏赐/决议→capital 国库；建设→本州国库
- **无 capital fallback**：所有依赖 capital 的收支统一 fallback 到私产（`privateChange`）
- **国库运输**（`treasuryTransferAction`）：己方州间即时调拨，不受关隘阻断
- **破产**：总国库（所有州之和）< -50000
- 扣费辅助：`debitTreasury(zhouId, charId, amount)` / `debitCapitalTreasury(charId, amount)` / `getCapitalBalance(charId)`

### overlord 变动自动重置赋税
CharacterStore 在 `updateCharacter` 和 `batchMutate` 中检测 overlordId 变化，自动重置 `centralization` 为 `undefined`（等效默认2级）。赋税好感双向：臣属→领主（高税=不满）、领主→臣属（高税=满意），无地臣属（`isRuler === false`）不适用。

### 辟署权与权限
- 独立统治者辟署权：独立战争**成功后**才授予（`ensureAppointRight`），失败则收回（`revokeAppointRight`）+宗法改流官；其他触发点：继承/乱世转换（**无月结扫描**）
- 独立统治者/皇帝可主动调整自己岗位的继承法和辟署权（玩家通过 RealmPanel 体制Tab，NPC 通过 `adjustOwnPolicyBehavior`）
- `grantTerritoryBehavior` 授出前先改后授（clan→bureaucratic + 移除辟署权），优先授出流官/无辟署权州
- 剥夺领地需辟署权；直接任命不需辟署权
- 铨选/考课由辟署权路由（`resolveAppointAuthority`）

### 考课罢免
grantsControl 岗位必须用 `executeDismiss(postId, id, { vacateOnly: true })`，三处统一。

### 其他规则
- 批量操作用 `batchMutate`，禁止循环 `setState`
- ID 用 `crypto.randomUUID()`
- `data/` 只存数据；`canShow()` 必须廉价
- 不引入新 npm 依赖（除非用户授权）
- 皇帝用 `findEmperorId(territories, centralPosts)` 查找（不在 centralPosts 里）
- 铨选 `dismisserId` 传法理主体，不传经办人
- `canGrantTerritory` 禁止授出治所州；`grantTerritoryBehavior` 超额先授州，治所州卡死则兜底授道
- `canUsurpPost` 禁止篡夺自己势力内的臣属（应走剥夺/调任）
- NPC `revokeBehavior` 排除治所州和道级岗位（剥夺后无法授出）
- `transferVassalBehavior` receiver 岗位模板品级（minRank）严格高于 vassal（非个人 rankLevel）

---

## 六、NPC Engine（31 个行为，已日结化）

行政：铨选/考课/罢免/皇帝调任/宰相调任 | 军事：宣战/动员/补员/征兵/赏赐/调兵草拟/调兵批准/召集参战/干涉战争/退出战争 | 领地：授予/剥夺/转移臣属/要求效忠/归附/逼迫授权/议定进奉 | 政策：调税/调职类/调辟署权/调继承法/调回拨率/自身政策调整 | 决议：称王建镇/称帝/篡夺 | 其他：建设/和谈

- `playerMode`：`push-task` / `skip` / `auto-execute` / `standing`
- `schedule`：`daily`（默认 push-task）/ `monthly-slot`（哈希槽位+品级分档）
- 新增行为：`NpcBehavior` → `registerBehavior()` → 自动调度
- 军事编制 AI（`militaryAI.ts`，militarySystem 中调用，跳过玩家）
- **push-task 过期默认行为**：新增 push-task behavior 时必须问"executeAsNpc 跑一遍是不是就是我想要的过期默认行为？"。是 → 通用 fallback 自动处理；否（NPC 路径含概率拒绝/条件性拒绝/会做对玩家不利的决定）→ 必须在 `NpcEngine.handleExpiredPlayerTasks` 加显式 `else if` 分支，明确"超时不管时玩家希望发生什么"，禁止让 NPC 替玩家做决定
- **草拟-审批双 behavior 范式**：新增"草拟人产出方案 → 审批人决定执行"类系统时，先读 **`docs/reference/draft-approve-pattern.md`**。要点：Submission 结构必须带 drafterId；三层 in-flight 锁（CD + buffer + playerTask）；urgency 分档 forced；玩家草拟入口走独立 React UI 而非 PlayerTask（避免 standing 模式 bug）；驳回 CD 在 drafter 维度而非 ruler。当前实现：treasuryDraftBehavior + treasuryApproveBehavior

---

## 七、战争系统

详见 **`docs/reference/war-system.md`**。要点：多方参战、合兵战斗、停战协议、CB 权重平衡、行营 AI、关隘通行。

---

## 八、当前开发阶段

Phase 6（谋略+派系+事件）95%。详细进度见 `docs/milestones.md`。

### 尚未完成（当前优先）
- NPC 国库调度 behavior（treasuryLogisticsBehavior）
- 迁都/国库运输 UI 面板

### 尚未完成（后续系统）
- 更多个人交互 | 谋略系统 | 活动系统 | 派系系统 | 更多随机事件
- 存档/读档 UI | AI 史书 | 生育系统 | 人才自然生成 | 非宗法皇位更替
- 权知机制 | 地图增强 | 行营AI优化 | 强力CB

### 测试原则
- **测纯函数**（Calc/dateUtils/territoryUtils），**不测** Store 流转/NPC 决策
- 必须写**具体期望数值**，禁止 `toBeGreaterThan(0)`
