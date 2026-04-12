# CLAUDE.md — 《晚唐风云》项目指南

> **开始任务前先读本文件，再只读取与任务直接相关的文件。**
> 子系统细节见 `docs/reference/`，开发进度见 `docs/milestones.md`。

---

## 一、项目概述

晚唐（约 867 AD）历史策略模拟单机游戏，灵感来自 CK3。

| 项目 | 值 |
|---|---|
| 技术栈 | Vite 8 + React 19 + TypeScript 5.9 (strict) + Zustand 5 + TailwindCSS 4 |
| 存储 | IndexedDB（`idb` 库），`wantang-db`，三张表 |
| 构建 | `pnpm build` / 开发 `pnpm dev` / 测试 `npx vitest run`（20 文件 403 测试） |
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
│   ├── interaction/ # 玩家交互 Action
│   ├── decision/    # 决议系统（称王/称帝/建镇/销毁头衔）
│   ├── scheme/      # 计谋系统（SchemeTypeDef 框架 + 拉拢/离间）
│   ├── chronicle/   # 史书系统（起居注+年史双层 + LLM）
│   ├── npc/         # NPC Engine 框架 + 行为模块
│   └── systems/     # 月结管线各 System
├── data/            # 纯静态数据（JSON + 定义表，禁止放逻辑）
├── ui/              # React UI 层（只读 Store + 调用 interaction）
│   └── components/base/  # Modal / ModalHeader / Button
└── __tests__/       # 纯函数 + 数据完整性测试
```

---

## 三、核心 Store 与索引

各 Store **维护预计算索引**，**查询时必须优先使用索引，禁止全量遍历**。

- **CharacterStore**：`characters` Map + `vassalIndex` + `aliveSet` + `locationIndex` + `refreshIsRuler()`
- **TerritoryStore**：`territories` Map + `postIndex` + `holderIndex` + `controllerIndex` + `expectedLegitimacy` + `policyOpinionCache`
- **MilitaryStore**：`armies` / `battalions` Map + `ownerArmyIndex` + `locationArmyIndex`
- **WarStore**：`wars` / `campaigns` / `sieges` / `alliances` / `truces` 五个 Map
- **SchemeStore**：`schemes` Map + `initiatorIndex` / `targetIndex`（不存档，`initSchemes` 重建）
- **NpcStore**：`playerTasks` 队列

---

## 四、日结/月结结算管线

入口：`TurnManager.ts` → `settlement.ts`（禁止在此写业务逻辑）

**日结**：`warSystem`（行军/战斗/围城） → `runSchemeSystem`（非月初） → `NpcEngine`（非月初）
**月结**（严格顺序）：characterSystem → **runSchemeSystem** → NpcEngine → populationSystem(年) → socialSystem → economySystem → militarySystem → eraSystem → buildingSystem

日期工具用 `dateUtils.ts`，禁止手写日期算术。

---

## 五、关键架构约定（必须遵守）

### 岗位变动原子操作
所有岗位变更**必须通过 `postTransfer.ts` 原子操作**，禁止内联 `updatePost` + 级联。详细清单见 **`docs/reference/post-transfer-table.md`**。

**法理级联禁止吸入外部占领者**：`getTransferableChildren` 递归 `childIds` 时必须过滤"自身已有更高 tier 主岗的占领者"（`getHighestTierRank(holder) > descTier` 则跳过），避免"河东节度使易主时把占领潞州的魏博节度使一起卷成新河东臣属"这类 BUG。`cascadeChildOverlord` 当前不加该过滤（同级效忠场景未来可能用到），`getTransferableChildren` 必须加。

### 治所州联动
道级 `capitalZhouId` 治所州随道主岗联动（任命/罢免/继承/战争/铨选跳过/篡夺前置）。**注意**：`capitalZhouSeat` 不自带 `cascadeSecondaryOverlord`，需调用方手动补充。

**post 政策硬约束**：`successionLaw / designatedHeirId / hasAppointRight / territoryType` 是道主岗属性，治所州只是从属表达，**不是独立政策目标**。
1. **执行层**：`executeToggle{Succession,AppointRight,Type}` 和 `executeDesignateHeir` 只接 `postId`，内部自查 `terr.capitalZhouId` 联动写入治所州主岗。**不得**绕过封装直接对治所州主岗调用 policy 函数。
2. **权威源是道**：联动时强制覆盖治所州字段，不因 holder 不一致跳过——治所州 holder 与道不同步本身就是非法脱绑状态。
3. **入口层**：NPC 候选集（`getVassalPolicyPosts` / `getDemandablePostsFrom*`）必须用 `isCapitalZhouOfDao` 过滤治所州主岗。玩家 UI 保留展示但禁用按钮 + tooltip "由所在道的主岗统一控制"。
4. 新增 post 级政策同样遵守：`executeXxx` 内部加联动 + 候选集加过滤。

### 好感系统双轨制
- **实时计算**：`calculateBaseOpinion` 从状态算（特质/亲属/正统性/政策），`policyOpinionCache` 自维护
- **事件存储**：`addOpinion(decayable: true)` 一次性事件，逐月衰减
- **禁止** `setOpinion` + `decayable: false`

### 层级隔离
- `engine/` **禁止** import `@ui/`，通知玩家用 `storyEventBus.ts`
- `ui/` 不写游戏逻辑，只读 Store + 调用 interaction

### UI 组件规范
弹窗用 `<Modal>` + `<ModalHeader>` + `<Button>`，禁止硬编码颜色/遮罩。

### 纯函数分离
- `engine/` 下 Calc 模块必须是纯函数，不调 `getState()`
- Utils 是包装层，允许读 Store 委派给纯函数

### 自我领主防御
`updateCharacter(X, { overlordId: Y })` 必须确保 `X !== Y`。CharacterStore 有 DEBUG 监测。

### 国库系统（私产/国库分离）
- **国库** 存 `Territory.treasury: {money, grain}`（仅州级）；**私产** 存 `Character.resources.money/grain`
- `Character.capital`（治所州ID）：NPC 自动选（`refreshCapital`），玩家显式迁都（`moveCapitalAction`，360 天 CD）
- **月结路由**：领地产出→该州国库；俸禄→私产；贡奉各州→overlord capital；回拨 capital→臣属 capital；属官俸禄从 capital 扣
- **军费**：`findPath` 找最近友方州国库扣粮；关隘阻断→士气 -10/月；无领地→私产扣
- **一次性花费**：征兵/补员→homeTerritory 国库；赏赐/决议→capital 国库；建设→本州国库
- **无 capital fallback**：统一走 `privateChange`
- **国库运输**（`treasuryTransferAction`）：己方州间即时调拨，不受关隘阻断
- **破产**：总国库 < -50000
- 扣费辅助：`debitTreasury` / `debitCapitalTreasury` / `getCapitalBalance`

### overlord 变动自动重置赋税
CharacterStore 在 `updateCharacter` / `batchMutate` 中检测 overlordId 变化，自动重置 `centralization` 为 `undefined`（等效默认 2 级）。赋税好感双向：臣属→领主（高税=不满）、领主→臣属（高税=满意），无地臣属（`isRuler === false`）不适用。

### 辟署权与权限
- 独立统治者辟署权：独立战争**成功后**才授予（`ensureAppointRight`），失败则收回 + 宗法改流官；其他触发点：继承 / 乱世转换（**无月结扫描**）
- 独立统治者/皇帝可主动调整自己岗位的继承法和辟署权（RealmPanel / `adjustOwnPolicyBehavior`）
- `grantTerritoryBehavior` 授出前先改后授（clan→bureaucratic + 移除辟署权），优先授出流官/无辟署权州
- 剥夺领地需辟署权；直接任命不需辟署权
- 铨选/考课由 `resolveAppointAuthority` 路由

### 考课罢免
grantsControl 岗位必须用 `executeDismiss(postId, id, { vacateOnly: true })`，三处统一。

### 主权层级 / 上下级判断（皇帝盲点硬约束）
`pos-emperor` 故意不是 `grantsControl`（避免污染 controller / holder / 继承 / 剥夺 / 战争 / policy cache 整套主岗语义），**任何只扫 `grantsControl` 主岗或 `getActualController` 的实现都会把皇帝看成 0 / null**，造成"独立 ruler 无法归附皇帝""法理链上溯到 tianxia 永远匹配不到皇帝"这类静默 BUG。

**统一口径**：
- 角色主权层级用 **`getSovereigntyTier(charId, territories, centralPosts)`**（在 `engine/official/postQueries.ts`）：先 `findEmperorId === charId → 4`，再退化扫 grantsControl。**禁止**在调用处重写 `for terrIds → max(TIER_RANK)` 本地实现。
- 上溯 `parentId` 链遇到 `tier === 'tianxia'` 必须用 `findEmperorId(territories, centralPosts)` 取控制者，不能直接 `getActualController(parent)`。
- 新增外交/制度/继承/主权类交互前，先 grep `getSovereigntyTier` / `findEmperorId`，复用现成函数。

**自检**：写完任何包含"tier 比较 / 上溯 parentId / 检查谁控制谁"的代码后问一句"如果其中一方是皇帝，这段会不会被当成 0 / null？"——答得出"不会"才能合并。

### 即时交互执行层：canShow/canExecute 是快照、execute 必须二次校验
所有玩家可见的非阻塞交互（决议 / 任命 / 罢免 / 剥夺 / 篡夺 / 转移臣属 / 调任 / 宣战 / 召集参战 / 归附 / 逼迫授权 / 征兵 / 赏赐 / 建造 / 调兵草拟-审批 / 国库草拟-审批 …）必须遵守：

1. **`canShow / canExecute / preview / 候选集` 都是 UI 快照**，可以贵一点没关系
2. **`execute()` 扣资源/写状态前必须重跑**：资格（`canXxxPure` / 候选集）+ 资源（`getCapitalBalance` / 州库）+ 关键世界状态（称帝查 `era` 和 `findEmperorId` 防双皇帝；停战；现成战争防重；控制权；候选 holder 是否仍是预期）+ **岗位 / 候选人 / target 的 ID 比对**（参考 `executeReassign(..., expectedTerritorialId)` 入参模式）
3. **任一不过 → 返回失败零写入**。返回契约：原 void → `boolean`（false=stale）；原 Result → 加 `stale?: true`；多状态 → 判别联合（如 `executeReassign: 'success' | 'rebel' | 'stale'`）
4. **UI 层必须区分三态**：成功 / 概率落败 / stale。stale 文案统一"局势已发生变化，xx 未生效"，不能和概率落败混在一起，也不能默认成功就关弹窗
5. 预览/确认弹窗必须订阅 volatile state（territories / characters / currentDate / era），否则弹窗打开期间快照永不刷
6. **NPC 可丢弃返回值**（generate→execute 同 tick 内 stale 概率极低），但 execute 内部批量 entry（TransferPlan / 批量铨选）必须接住每条返回值，失败 `continue`

### StoryEvent 数据化（effectKey + effectData + resolver）
决策型 StoryEvent 的 `onSelect` 闭包是 UI 兜底，**不是真相源**。读档后 storyEvent 队列里的 onSelect 被 strip 再 rehydrate 为空函数，玩家点选项时**只有 `storyEffectResolver` 真正落地**。

- 所有"会写状态"的选项必须同时给 `effectKey: string` + `effectData: serializable` + resolver case
- effectData 必须 plain JSON-serializable（禁函数/类实例/Map/Set），且必须带"提案时快照"（如 `expectedTerritorialId`）供跨日审批做 stale 校验
- 纯通知用 `effectKey: 'noop:notification'`
- 禁止在 `onSelect` 里直接调 `executeXxx` 不给 effectKey——读档后变 no-op
- 新增决策型 StoryEvent 必须同时改 `storyEffectResolver.ts` 加 case，否则就是定时炸弹

### 存档系统
`engine/persistence/` 负责存档。所有存储 I/O 走 `engine/storage.ts:SaveStorageBackend` 接口（当前 `indexedDBBackend`，未来桌面化只换 `currentBackend` 一行），UI / saveManager / serialize **不得直接接触 IndexedDB**。

新增 store 流程：① `saveSchema.ts` 加字段 ② `serialize.ts` 加 snapshot ③ `deserialize.ts` 调 init 或 setState ④ Map/Set 用 `Array.from(.entries())` ⑤ 函数指针必须 strip。

索引（vassalIndex / postIndex 等）一律不存，靠 `initXxx` 重建。RNG 用 stateful seedrandom，`getRngState` / `restoreRng` 保证读档后续 100% 一致。`current` 槽是自动续档（月结 / beforeunload 写），命名存档是独立 `save-{ts}-{rand}` 槽。新游戏必须调 `resetTransientStores`。

### 玩家生命周期 / Game Over
玩家绝嗣死亡时必须**同时**做四件事，少一件就会出现"死人继续当玩家 / Game Over 画面不弹"类边界：
1. `setPlayerId(null)`
2. `dead.isPlayer = false`
3. `useTurnManager.setState({ dynastyExtinct: true, isPaused: true })`
4. 推送"王朝覆灭"事件（供 GameOverScreen 显示）

`dynastyExtinct` 是 TurnManager 持久字段（写进 saveSchema turnState），新游戏 / `resetTransientStores` 必须重置为 false。`deserialize` 必须**无条件**写回 `setPlayerId(save.playerId)`（含 null），不能 `if (save.playerId)` 跳过 null 写入。`GameOverScreen` 挂在 `GameLayout` 末尾，根据 flag 渲染全屏覆盖。

### 调试日志
禁止裸 `console.log`，必须用 `engine/debugLog.ts:debugLog(cat, ...)`，6 个 category：`policy / military / interaction / inheritance / emperor / war`，默认全关。BUG 断言用 `console.error`，fallback 边缘路径用 `console.warn`。DevTools 开启：`window.__DEBUG__.policy = true`。

### 史书 emit 纪律
详见 **`docs/reference/chronicle-system.md`**。要点：
- 政治格局类 interaction / decision / behavior **execute 真正成功后**（stale 校验通过 + 状态已写入）必须调 `emitChronicleEvent({...})`
- **主权变动**（归附 / 称王帝 / 继位 / 王朝覆灭 / 抗命剥夺）→ `EventPriority.Major`；**人事变动**（任命 / 罢免 / 调任 / 剥夺 / …）→ `Normal` + 必须在 `chronicleService.ts:CHRONICLE_TYPE_WHITELIST` 加 type 字串；**高频流水**（铨选 / 考课 / 政策 / 建造）默认不 emit
- 上下层重复 emit 用 `skipChronicleEmit` opt 避免；noop（previousHeirId 未变等）不 emit
- 双层史书（起居注月稿 → 年史年稿）+ 事件驱动上下文卡片引擎，细节在 reference

### 指挥官唯一性
- **兵马使**（`Army.commanderId`）全局唯一：规则在 `commandRules.ts:canAssignArmyCommander`，所有写入点必须校验
- **都统**（`Campaign.commanderId`）全局唯一：`executeSetCampaignCommander` 返回 boolean，UI 必须接住
- **允许兼任**：同一角色可同时是某军兵马使 + 某行营都统，两条轨道互不冲突
- `executeCreateCampaign` 无合法都统时创建失败（不创建半残行营）
- **禁止绕过**：AI（`militaryAI.ts`）必须走 `executeSetCommander`，不得直接 `updateArmy({ commanderId })`

### 角色地理位置
- `Character.locationId?: string` — 当前物理位置（州级 territory ID）
- **解析优先级**（`locationUtils.ts:resolveLocation`）：行营指挥官 → 治所 → 领主治所 → undefined
- **触发源**：① 岗位变动汇聚到 `refreshPostCaches() → refreshLocation()`（无需逐个 interaction 修改）② 军事移动（行军 / 创建 / 解散 / 换帅 / 拦截 / 战败撤退）同步都统 locationId
- 行营解散 → 都统瞬移回治所（v1 不做旅行时间）
- 军队将领（非行营指挥官）不跟随军队——`Army.commanderId` 是行政任命，只有 `Campaign.commanderId` 物理出征
- `locationIndex`（territoryId → Set<charId>）提供 O(1) 查"谁在这个州"
- `updateCharacter` 维护 locationIndex 时用 `'locationId' in patch`（非 `!== undefined`），正确处理显式清除

### 同盟系统
详见 **`docs/reference/alliance-system.md`**。要点：
- `WarStore.alliances`，3 年期（1095 天），每人 ≤ 2 盟；`canEnterAlliance = isRuler && (overlordId == null || hasAppointRightPost)`
- **硬约束**：禁同一效忠链（直接领主 ↔ 直接臣属）结盟；皇帝不特判
- 自动参战**仅**在 `executeDeclareWar` 创建 war 时触发，不在 `joinWar` / `callToArms` 二次联动（避免盟友的盟友连锁）
- 反戈：盟友直属敌方时强制切断 overlord 再参战
- 背盟：`-120 威望 / -80 正统性` + 同盟立断 + 双向好感 `-100/-50`；NPC `declareWarBehavior` 对已同盟目标 `weight -= 1000`
- **死亡清理**：`characterSystem` 末尾清掉死者所有同盟——**不随继承转移**
- `executeProposeAlliance: 'accepted' | 'rejected' | 'stale'`；`executeBreakAlliance: boolean`；stale 必须重跑 `canEnterAlliance`

### 计谋系统
详见 **`docs/reference/scheme-system.md`**。当前 v1.1 含拉拢（basic）+ 离间（complex，支持 AI 自拟方法）。要点：
- 框架：`SchemeTypeDef<TParams>` 泛型，`engine/scheme/types/<id>.ts` 自注册；引擎 / Store / UI 不感知具体类型；**禁 `as string`**，参数走 `parseParams` 运行时校验
- **runSchemeSystem 双挂载**：非月初（warSystem 后、NpcEngine 前）+ 月初（characterSystem 后、NpcEngine 前）
- **mutation 纪律**：禁直接 mutate，一律走 `store.updateScheme / setStatus / removeScheme`
- **快照原则**：`initInstance` 冻结 `spymasterStrategy / methodBonus / initialSuccessRate` 进 `snapshot`
- **候选池禁全表扫**：从 actor 已知关系展开（overlord / vassals / 家庭 / 同僚 / 邻居州）
- **per-(initiator, target, type) CD 365 天**；NPC 走 `NpcContext.hasRecentSchemeOnTarget` 快照，**禁** `useSchemeStore.getState()` 直 poke
- **死亡终止**：不随继承转移（计谋/同盟都是个人契约）
- **AI 方法**（v2）：LLM 返回最终 initial rate（非 bonus），通过 `precomputedRateOverride` 第 4 参绕过基础公式；NPC 完全不接触
- `NpcContext.getPeerNeighbors(charId)`：相邻节度使级以上 rulers lazy 快照，跨 behavior 共享；新增"相邻敌对 rulers"逻辑必须复用
- SAVE_VERSION = 7
- 长测 sim：`SCHEME_SIM=1 npx vitest run scheme-frequency-sim`，调 weight/成功率后用此看效果不要盲调

### NPC 行为设计纪律（硬约束）
- **weight = 概率百分比**：`chance = min(weight, 100) / 100`，weight=10 意味 10% 触发率——**不是 CK3 相对权重排序**
- **CK3 ai_will_do 风格公式**：加法基础惩罚 `{ add: -N }` 压 mean 保 tail（拉拢 -8，离间 -6），**禁**全局 `factor: 0.3` 缩放；乘法修正只凸显"值得出手的结构条件"；`minWeight` 5-10 做硬门槛；能力差距用 `dipDiff × 4` / `stratDiff × 3` 类系数（典型 ±10 差距 ±30-40 百分点）
- **槽位按品级分档**：NpcEngine 的 `isActiveMonth / getSlotDays` 已按 rank 分（王公 2/月、节度使 1/月、刺史 0.5/月、县令 0.33/月）。**禁止**在 behavior 内再按 rank 二次缩放（双重放大）。需按 actor 调速时改门槛（`minWeight / minRank / 资源`），**不要**缩放 weight
- **禁 personality 硬门槛**：`calcPersonality()` clamp `[-1, +1]`，**默认 0**（不是 0.5），单特质贡献 ±0.10-0.20。`if (sociability < 0.4) return null` 会砍 95% NPC。性格只能进 weight 公式的 `personality.x * N` 加分项，不做截断。硬截断用客观状态（rank / 资源 / isRuler / tier）
- **push-task 过期默认**：新增 push-task behavior 必须问"`executeAsNpc` 跑一遍是不是就是想要的过期默认行为？"；否（概率拒绝 / 对玩家不利）→ 在 `NpcEngine.handleExpiredPlayerTasks` 加显式 `else if`
- **草拟-审批范式**：新增草拟-审批类系统前必读 **`docs/reference/draft-approve-pattern.md`**

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

## 六、NPC Engine

行政：铨选/考课/罢免/皇帝调任/宰相调任 | 军事：宣战/动员/补员/征兵/赏赐/调兵草拟/调兵批准/召集参战/干涉战争/退出战争 | 领地：授予/剥夺/转移臣属/要求效忠/归附/逼迫授权/议定进奉 | 外交：提议结盟/解除同盟 | 政策：调税/调职类/调辟署权/调继承法/调回拨率/自身政策调整 | 决议：称王建镇/称帝/篡夺 | 计谋：拉拢/离间 | 其他：建设/和谈

- `playerMode`：`push-task` / `skip` / `auto-execute` / `standing`
- `schedule`：`daily`（默认 push-task）/ `monthly-slot`（哈希槽位 + 品级分档）
- 新增行为：`NpcBehavior` → `registerBehavior()` → 自动调度
- 军事编制 AI 在 `militaryAI.ts`（militarySystem 中调用，跳过玩家）

---

## 七、战争系统

详见 **`docs/reference/war-system.md`**。要点：多方参战、合兵战斗、停战协议、CB 权重平衡、行营 AI、关隘通行。

---

## 八、当前开发阶段

Phase 7（UI 美术 + 地图升级）进行中 40%。详细进度见 `docs/milestones.md`，升级方案见 `docs/reference/ui-upgrade-plan.md`。

### 当前：Phase 7 — UI 美术 + 地图升级
**目标风格**：晚唐舆图 + 官府文书 + 漆木金石，暖黑墨色基调取代冷蓝。
**实施方式**：垂直切片 B（token + 组件同步交付，用实际效果验证方向）。
- ✅ 第一批完成：全局色 token + ResourceBar 书简造型 + Tooltip 组件 + SideMenu SVG 图标
- ✅ 第二批完成：CK3 式底部浮动（PlayerIdentityCard + TimeControl）+ 角色切换移入系统菜单
- ✅ 第三批完成：CharacterPanel CK3 式重构（拆分4文件 + 公共组件 + 全局滚动条）
- ✅ 第三批续：TerritoryPanel CK3 式重构（拆分4文件 + ProgressBar + 道级子州可跳转）
- ✅ 全局表单风格化：Select 自定义下拉（Portal渲染）+ number input 隐藏原生 spinner + 全局 title→Tooltip
- ✅ RealmPanel 细调：领地Tab精简（去收入列）+ 经济Tab字号/颜色统一 + 属下赋税仅显示有地臣属
- ⬜ 后续：其他核心面板跟进 → 流程面板 → 地图数据扩展(100州) → 地图分层重构 → 角色头像

**UI 升级约束**：纹理用 PNG tile、SVG 滤镜限小面积、动画纯 CSS、无新 npm 依赖。SVG 图标统一 viewBox="0 0 24 24" + stroke=currentColor。基础组件在 `ui/components/base/`（Modal / ModalHeader / Button / Tooltip / PanelSection / InfoRow / AvatarBadge / ProgressBar / Select）。图标在 `ui/components/icons/`（ResourceIcons / MenuIcons）。

### 尚未完成（后续系统，优先级降低）
- 更多个人交互 | 谋略精修（更多计谋类型 + AI 自拟方法 v3）
- 活动系统 | 派系系统 | 更多随机事件（优先级后移）
- 旅行系统（`locationId` 从派生值改独立状态 + 旅行时间，活动/侠客前置依赖）
- 生育系统 | 人才自然生成 | 非宗法皇位更替
- 权知机制 | 行营 AI 优化 | 强力 CB

### 测试原则
- **默认测纯函数**（Calc / dateUtils / territoryUtils）
- **不测** UI 渲染快照、NPC 决策权重（行为权重随平衡频繁调整，写死会反过来阻塞重构）
- 允许少量**高价值集成测试**，仅限白名单：
  1. **存档 round-trip 不变量**：serialize → deserialize 后状态等价；含 StoryEvent 在 effectKey resolver 路径下的恢复
  2. **死亡接续不变量**：领袖死亡后战争 `attackerId / defenderId` 应转交给继承人；玩家绝嗣后 `playerId === null && dynastyExtinct === true`
  3. **治所州联动不变量**：4 个 `executeToggleX` 调用后，道主岗与治所州主岗的 `successionLaw / hasAppointRight / territoryType / designatedHeirId` 必须严格相等
  4. **execute 契约**：传入 stale 前提（已换 holder 的 post / 已失效的 post / 已花光的资源）后，对应 `executeXxx` 必须返回 false / stale，且 store 状态零变化
- 集成测试必须写**具体期望数值**，禁 `toBeGreaterThan(0)`
- 拿不准是否在白名单里 → 默认不写，先在 plan 里讨论
