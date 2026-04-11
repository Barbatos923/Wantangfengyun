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
| 构建 | `pnpm build` / 开发 `pnpm dev` / 测试 `npx vitest run`（19 文件 384 测试） |
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
│   ├── npc/         # NPC Engine 框架 + 33 个行为模块
│   └── systems/     # 月结管线各 System（9 个）
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

**法理级联禁止吸入外部占领者**：`getTransferableChildren` 等递归 `childIds` 找"法理下级主岗持有人"的逻辑，必须过滤掉**自身已有更高 tier 主岗的占领者**（如魏博节度使武力兼并潞州后仍是 dao 级 ruler）。判定：`getHighestTierRank(holder) > descTier` 则跳过。否则会出现"河东节度使易主时，把占领潞州的魏博节度使一起卷成新河东的臣属"这类经典边缘 BUG。`cascadeChildOverlord` 当前不加该过滤（同级效忠场景未来可能用到），但 `getTransferableChildren` 必须加。

### 治所州联动
道级 `capitalZhouId` 治所州随道级主岗联动（任命/罢免/继承/战争/铨选跳过/篡夺前置）。
**注意**：`capitalZhouSeat` 不自带 `cascadeSecondaryOverlord`，需调用方手动补充。

**post 政策联动（硬约束）**：`successionLaw / designatedHeirId / hasAppointRight / territoryType` 这四个字段是道主岗的属性，治所州主岗只是它的从属表达，**不是独立政策目标**。规则：
1. **执行层**：`executeToggleSuccession / executeToggleAppointRight / executeToggleType / executeDesignateHeir` 四个函数只接 `postId`，内部自查 `terr.capitalZhouId` 联动写入治所州主岗。调用方不传任何 capital 信息，**不得**绕过封装直接对治所州主岗调用 policy 修改函数。
2. **权威源是道**：联动时按道为权威源**强制覆盖**治所州主岗的字段，不因 holder 不一致跳过——治所州 holder 与道主岗不同步本身就是非法脱绑状态。
3. **入口层**：所有 NPC 候选集（`getVassalPolicyPosts` / `getDemandablePostsFrom*`）必须过滤治所州主岗（用 `isCapitalZhouOfDao(territoryId, territories)` 在 `npc/policyCalc.ts`）。玩家 UI 可以保留治所州主岗一行展示，但必须禁用按钮 + tooltip 写明"由所在道的主岗统一控制"。
4. 新增 post 级政策时同样遵循此规则——给 `executeXxx` 内部加治所州联动，给所有候选集加 `isCapitalZhouOfDao` 过滤。

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

### 主权层级 / 上下级判断（皇帝盲点硬约束）
**所有涉及"谁比谁层级高 / 谁是谁的法理上级"的判断，必须考虑皇帝身份**。`pos-emperor` 故意不是 `grantsControl`（避免污染 controller / holder / 继承 / 剥夺 / 战争 / policy cache 整套主岗语义），因此**任何只扫 `grantsControl` 主岗或 `getActualController` 的实现都会把皇帝看成 0 / null**，造成"独立 dao ruler 永远看不到归附皇帝入口""法理链上溯到 tianxia 永远匹配不到皇帝"这类静默 BUG。

**统一口径**：
- "角色主权层级"用 `getSovereigntyTier(charId, territories, centralPosts)`（在 `engine/official/postQueries.ts`），它会先 `findEmperorId === charId → 4`，再退化扫 grantsControl。**禁止**在调用处重新写 `for terrIds → max(TIER_RANK[t.tier])` 这种本地实现。
- "某领地的实际统治者"在向上走 `parentId` 链时，**遇到 `tier === 'tianxia'` 必须用 `findEmperorId(territories, centralPosts)` 取控制者**，不能直接用 `getActualController(parent)`。
- 新增外交 / 制度 / 继承 / 主权类交互前，先 grep `getSovereigntyTier` / `findEmperorId`，复用现成函数。**坚决不要**在新文件里再造一套"皇帝特判临时逻辑"。

**自检清单**：写完任何包含"tier 比较 / 上溯 parentId / 检查谁控制谁 / 谁是谁的领主"的代码后，问一句"如果其中一方是皇帝，这段会不会把它当成 0 / null？" —— 答得出"不会"才能合并。

历史踩坑：归附交互 `canShow` / `canPledgeAllegiancePure` / `isDejureVassalOf` 三处都中过这个雷，独立节度使无法归附皇帝、也不被判定为皇帝的法理附庸，2026-04 全部用 `getSovereigntyTier` + tianxia 分支特判修复。

### 即时交互执行层：canShow/canExecute 是快照、execute 必须二次校验
**所有玩家可见的非阻塞交互（决议 / 任命 / 罢免 / 剥夺 / 篡夺 / 转移臣属 / 调任 / 宣战 / 召集参战 / 干涉战争 / 要求效忠 / 归附 / 议定进奉 / 逼迫授权 / 征兵 / 赏赐 / 补员 / 建造 / 调兵草拟-审批 / 国库草拟-审批 …）必须严格遵守这条纪律**，否则会出现"弹窗资格旧的、execute 又不兜底→透支扣资源/凭空写状态/把旧弹窗作用到新上任的人"类 BUG。

1. **`canShow / canExecute / preview / 候选集` 都是 UI 快照**：给面板/弹窗显示按钮可用态用，可以贵一点没关系。
2. **`execute()` 在真正扣资源/写状态前必须重跑当前合法性**：
   - 资格（重新调对应的 `canXxxPure` / 候选集查询）
   - 资源（`getCapitalBalance` / `actor.resources.prestige` / 州库余额）
   - 关键世界状态（如称帝要查 `era` 和 `findEmperorId` 防双皇帝；停战；现成战争防重；领地控制权 `controllerIndex`；候选 holder 是否仍是预期的人）
   - **岗位 / 候选人 / target 的 ID 比对**：弹窗打开时看到的目标 holder 是 A，确认时若 `post.holderId !== expectedA`，必须 stale，不能把旧弹窗作用到新上任的 B（参考 `executeReassign(..., expectedTerritorialId)` 的入参模式）
3. **任一不过 → 立刻返回失败，不写任何状态**。返回契约：
   - 原本无返回值的 → 改 `boolean`，false = stale
   - 原本返回结构化 Result 的（带概率/breakdown）→ 加 optional `stale?: true` 字段
   - 多状态的 → 用判别联合，如 `executeReassign: 'success' | 'rebel' | 'stale'`、`executeRevoke: 'success' | 'rebel' | 'stale'`
4. **UI 层必须接住返回值并区分三态**：成功 / 概率落败 / stale。stale 文案统一"局势已发生变化，xx 未生效"，**不能**和概率落败混在一起，也**不能**默认成功就关弹窗（典型反例：以前 `executeRevoke` 在 post 失效时返回 true，UI 显示"剥夺成功"但世界状态没动）。
5. **预览/确认弹窗必须订阅 volatile state**（territories/characters/currentDate/era），否则弹窗打开期间资格快照永远不刷。
6. **NPC 行为可以丢弃返回值**——它们一般在 generate→execute 同 tick 内调用，stale 概率极低；丢弃等同"NPC 没做成"，自然向前推进。但如果 execute 内部执行多个 entry（如批量铨选 / TransferPlan），**必须**接住每条返回值，失败 `continue`，不要把后续的 `autoTransferChildrenAfterAppoint` 等连锁动作作用到从未生效的任命上。

历史踩坑：决议系统的 `executeCreateEmperor` 不查现任皇帝差点造双皇帝；`executeRevoke` 在 post 失效时返回 true 误显成功；`executeReassign` 不带 expectedTerritorialId 把旧弹窗作用到新上任的人；NPC 调用 `executeAppoint` 后无脑跑 `autoTransferChildrenAfterAppoint`。2026-04 这一轮把 18+ 个 execute 全部按这条纪律收口。

### StoryEvent 数据化（effectKey + effectData + resolver）
**决策型 StoryEvent 的 `onSelect` 闭包是 UI 兜底，不是真相源**。所有"会写状态"的 StoryEvent 选项必须同时给出 `effectKey: string` + `effectData: serializable` + `storyEffectResolver` 里对应的 case 分支。理由：

1. **存档恢复**：闭包不能 JSON 序列化。读档后 storyEvent 队列里的 onSelect 是 strip 掉再 rehydrate 的空函数，玩家点选项时**只有 resolver 会真正落地**。
2. **审批流的延迟语义**：宰相提案 / 调任审批等场景，提案与玩家点击之间可能跨多日 + 跨存档；`effectData` 必须把"提案时的快照"全部带上（如 `expectedTerritorialId`），让 resolver 落地时能做 stale 校验。
3. **纯通知 vs 真决策**：纯通知的 StoryEvent（如"知悉"型选项）用 `effectKey: 'noop:notification'`；真决策才走完整 effectKey/effectData。

**禁止**：
- 在 `onSelect` 里直接调 `executeXxx` 而**不**给 effectKey —— 读档后该选项变成 no-op。
- effectData 里塞函数 / 类实例 / Map / Set —— 必须 plain JSON-serializable。
- effectData 只带 ID 不带快照 —— 跨日审批必须把"提案时看到的目标 holder"等关键状态固化进去。

新增决策型 StoryEvent 必须同时改 `storyEffectResolver.ts` 加 case，否则就是定时炸弹。

### 存档系统
`engine/persistence/` 模块负责存档。**核心约定**：所有存储 I/O 必须走 `engine/storage.ts` 的 `SaveStorageBackend` 接口（当前 `indexedDBBackend`，未来桌面化只换 `currentBackend` 一行），UI/saveManager/serialize 不得直接接触 IndexedDB。新增 store 时必须：1）在 `saveSchema.ts` 加字段；2）`serialize.ts` 加 snapshot；3）`deserialize.ts` 调对应 init 或 setState；4）若有 Map/Set 用 `Array.from(.entries())` 序列化；5）函数指针必须 strip。索引（vassalIndex/postIndex 等）一律不存，靠 `initXxx` 重建。RNG 用 stateful seedrandom，`getRngState`/`restoreRng` 保证读档后续走向 100% 一致。`current` 槽是自动续档（月结/beforeunload 写），命名存档是独立 `save-{ts}-{rand}` 槽。新游戏必须调 `resetTransientStores` 重置非 loadSampleData 管辖的 store（TurnManager/War/Npc/Ledger/StoryEventBus）。

### 玩家生命周期 / Game Over
玩家角色绝嗣死亡时（`characterSystem` 死亡处理走"无 primaryHeir"分支）必须**同时**做四件事，少一件就会出现"死人继续当玩家 / UI 围着死人转 / Game Over 画面不弹"类边界：
1. `setPlayerId(null)`
2. `dead.isPlayer = false`
3. `useTurnManager.setState({ dynastyExtinct: true, isPaused: true })`
4. 推送"王朝覆灭"事件（带描述，供 GameOverScreen 显示）

`dynastyExtinct` 是 TurnManager 持久字段，写进 saveSchema turnState，新游戏 / `resetTransientStores` 必须重置为 false。`deserialize` 必须**无条件**写回 `setPlayerId(save.playerId)`（含 null），不能因为 `if (save.playerId)` 跳过 null 写入——否则旧 store 残留的 playerId 会和新档的 dynastyExtinct 冲突。`GameOverScreen` 挂在 `GameLayout` 末尾，根据 `dynastyExtinct` flag 渲染全屏覆盖。

### 调试日志
新增 NPC 行为/交互骰子/军编/继承等"调试时有用、平时是噪音"的日志，**禁止裸 `console.log`**，必须用 `engine/debugLog.ts` 的 `debugLog(cat, ...)`，6 个 category：`policy` / `military` / `interaction` / `inheritance` / `emperor` / `war`，默认全关。BUG 断言用 `console.error`，fallback 边缘路径用 `console.warn`，可直接写。DevTools 开启：`window.__DEBUG__.policy = true`。

### 史书 emit 纪律
任何会改变政治格局的 interaction / decision / NPC behavior，**execute 真正成功后(stale 校验通过且状态已写入)必须调 `emitChronicleEvent({...})` 推送 GameEvent**(在 `engine/chronicle/emitChronicleEvent.ts`，封装了 id/date/priority 样板)。priority 分级：
- **主权变动**(归附 / 逼迫授权 / 称王称帝 / 继位 / 王朝覆灭 / 抗命剥夺) → `EventPriority.Major`
- **人事变动**(任命 / 罢免 / 调任 / 剥夺 / 转移臣属 / 留后指定 / 议定进奉 / 要求效忠) → `EventPriority.Normal` + 必须在 `chronicleService.ts:CHRONICLE_TYPE_WHITELIST` 加 type 字串
- **高频流水**(铨选 / 考课 / 政策调整 / 建造) → 默认不 emit；如需写入观察日志走 debugLog

新增 interaction / behavior 时必须自检三件事：
1. emit 在 stale 校验之后、状态写入之后(否则会写出"成功但 store 未变"的虚假事件)
2. 同一逻辑动作只 emit 一次：上层(如 `executeRevoke` 成功)若已 emit 更精确事件，下层(如 `executeDismiss`)需用 `skipChronicleEmit` opt 避免重复
3. 字串与白名单严格对账(grep `chronicleService.ts:CHRONICLE_TYPE_WHITELIST`)；NPC 半年/月度扫描类调用必须只在状态真正变化时 emit(避免 noop 噪音，参考 `executeDesignateHeir` 的 previousHeirId 比对)

`worldSnapshot.newTitles / destroyedTitles` 由 `freezeWorldSnapshot` 扫年内事件聚合，依赖 `NEW_TITLE_TYPES / DESTROYED_TITLE_TYPES` 两个 Set——新增头衔类事件时同步更新这两个 Set。

单月事件超过 `MAX_EVENTS_PER_MONTH = 30` 会按 priority 倒序 + 时间正序截断，不必担心 prompt token 爆炸；但仍应避免高频流水类事件污染。

### 史书事件上下文卡片引擎
`engine/chronicle/chronicleEventContext.ts` 按事件类型为每个 actor 选取不同的上下文字段（事件驱动，非全景灌注）：
- 10 种字段：`mainPost`（含皇帝特判）/ `age` / `traits` / `abilities`（≥7 标签化）/ `territory` / `military` / `allegiance` / `vassals` / `wars` / `family`
- `EVENT_FIELD_MAP`：22 种事件类型各有独立映射（如野战只给主将的性格+能力+效忠，归附给辖境+兵力+臣属）
- `EventContextSnapshot` 接口从 Store 冻结快照传入，纯函数不读 Store
- `formatActorRoles()`（在 `chroniclePromptBuilder.ts`）替代原来的扁平 `人物:X、Y`，按事件类型输出带角色标签

新增事件类型时：① `EVENT_FIELD_MAP` 加映射 ② `formatActorRoles` 加 case。新增字段类型时在 `FIELD_RENDERERS` 加渲染器。

### 史书双层架构（起居注→年史）
- **月稿（起居注）**：起居注官人格，直接按事件+上下文卡片写文言编年体，允许适当发挥细节与延展
- **年稿（年史）**：史官人格，基于 12 篇起居注做汇总整理（合并叙述/主线提炼/史臣注/按语），不重新翻译
- 年稿 user prompt 仅含跨年按语 + 逐月起居注，无 topPowers/dossiers（token 全部留给起居注内容）
- **月稿缺失兜底（rawFallback）**：`waitForMonthDrafts` 30 秒超时后，缺失月稿的月份由 `collectMonthEvents` + `buildMonthPrompt` 构建原始事件文本，直接注入年稿 prompt（标注"原始事件记录"），YEAR_SYSTEM 已指示 LLM 以同等文言笔法处理

### 指挥官唯一性
- **兵马使**（`Army.commanderId`）全局唯一：一人不能同时担任两支军的兵马使。规则集中在 `commandRules.ts`，所有写入点（`executeSetCommander` / `militaryAI.ts`）必须通过 `canAssignArmyCommander` 校验
- **都统**（`Campaign.commanderId`）全局唯一：一人不能同时担任两个行营的都统。`executeSetCampaignCommander` 返回 boolean，UI 必须接住
- **允许兼任**：同一角色可同时是某军兵马使 + 某行营都统，两条轨道互不冲突
- `executeCreateCampaign` 选都统时排除已在其他行营任都统者；无合法候选（含 ownerId fallback）时创建失败，不创建半残行营
- **禁止绕过**：AI（`militaryAI.ts`）必须走 `executeSetCommander`，不得直接 `updateArmy({ commanderId })`

### 角色地理位置
- `Character.locationId?: string` — 当前物理位置（州级 territory ID）
- **位置解析优先级**（`locationUtils.ts: resolveLocation`）：行营指挥官 → 治所 → 领主治所 → undefined
- **两类触发源**：
  1. **岗位变动**：全部汇聚到 `refreshPostCaches()`，内部调 `refreshLocation()`，无需逐个 interaction 修改
  2. **军事移动**：行营行军/创建/解散/换帅/拦截/战败撤退时同步都统的 locationId
- **行营解散 → 都统瞬移回治所**（v1 不做旅行时间）
- **军队将领（非行营指挥官）不跟随军队**：`Army.commanderId` 是行政任命，只有 `Campaign.commanderId` 才物理出征
- `CharacterStore.locationIndex`（territoryId → Set<charId>）提供 O(1) 查"谁在这个州"
- `updateCharacter` 维护 locationIndex 时用 `'locationId' in patch`（非 `!== undefined`），正确处理显式清除为 undefined 的场景

### 同盟系统
- 数据在 `WarStore.alliances`（与 truce 并列），`Alliance { partyA, partyB, startDay, expiryDay }`，期限 3 年（`ALLIANCE_DURATION_DAYS = 1095`），上限 `MAX_ALLIANCES_PER_RULER = 2`
- **缔盟资格**：`canEnterAlliance(char, territories)` = `isRuler && (overlordId == null || hasAppointRightPost(char, territories))`。设计动机是让河北三镇这类"名义臣属+实际割据"的藩镇能互相结盟，也能与独立统治者结盟。
- **同一效忠链屏蔽**（硬约束）：canShow / execute / resolver 全部禁止 `player.overlordId === target.id || target.overlordId === player.id`（直接领主↔直接臣属），避免"结盟自己的臣属"这种与效忠关系语义冲突的场景。皇帝不特判——`pos-emperor` 虽非 `grantsControl`，但 `collectRulerIds` 已显式将 tianxia 上的 emperor 加入 rulerIds，`isRuler` 正确；同一效忠链规则防止皇帝向直属藩镇发盟书。
- **自动参战**（`engine/military/allianceAutoJoin.ts`）：**仅**在 `executeDeclareWar` 创建 war 后触发，扫 attackerId/defenderId 的盟友。不在 joinWar / callToArms 二次加入时触发——避免"盟友的盟友"连锁拉入雪球。
- **反戈机制**：若盟友直接 `overlordId === enemyLeaderId`，强制切断臣属（`updateCharacter({ overlordId: undefined })`）再加入战争，emit `同盟反戈` Major。v1 仅检查直接 overlord，不递归上溯；祖孙链场景留作边界。
- **三角同盟冲突裁决**：**先按资格分边求交集**（不能只按名册交集——会漏掉"单侧合法"的情况），真正的冲突是"两侧 canAutoJoin 都合法"的共享盟友。玩家走三选一 StoryEvent（援 A / 援 B / 两不相助），NPC 按好感决定站队或保持中立；所有结局统一落地到 `applyAllianceDilemmaOutcome`
- **背盟**：向盟友宣战或拒绝履约自动参战 → `ALLIANCE_BETRAYAL_PENALTY = -120 威望 / -80 正统性` + 双向好感 -100/-50 + 同盟立即断裂。NPC `declareWarBehavior` 对已同盟目标 `weight -= 1000` 硬禁背盟宣战。
- **死亡清理**：`characterSystem` 死亡处理末尾清理死者所有同盟——**同盟是个人契约，不随继承人转移**。这条一定要记住：死亡接续只转移战争 attackerId/defenderId，同盟不跟随。
- **存档兼容**：旧档 `save.alliances` 可能 undefined，deserialize 兜底为空 Map，无需 schema 升级。`NpcStore.allianceRejectCooldowns` 同样兜底空 Map。
- **execute 契约**：`executeProposeAlliance` 返回 `'accepted' | 'rejected' | 'stale'`，`executeBreakAlliance` 返回 boolean。stale 校验必须重跑 `canEnterAlliance`，不能只查 `overlordId == null`（会把有辟署权的 vassal 错拦）。
- **StoryEvent effectKey 清单**（必须通过 `storyEffectResolver` 恢复）：`proposeAlliance:accept/reject` / `allianceAutoJoin:accept/reject` / `allianceDilemma:pickAttacker/pickDefender/neutral`。新增同盟 StoryEvent 时禁止在 onSelect 里直接写状态，必须补 resolver case。

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

## 六、NPC Engine（33 个行为，已日结化）

行政：铨选/考课/罢免/皇帝调任/宰相调任 | 军事：宣战/动员/补员/征兵/赏赐/调兵草拟/调兵批准/召集参战/干涉战争/退出战争 | 领地：授予/剥夺/转移臣属/要求效忠/归附/逼迫授权/议定进奉 | 外交：提议结盟/解除同盟 | 政策：调税/调职类/调辟署权/调继承法/调回拨率/自身政策调整 | 决议：称王建镇/称帝/篡夺 | 其他：建设/和谈

- `playerMode`：`push-task` / `skip` / `auto-execute` / `standing`
- `schedule`：`daily`（默认 push-task）/ `monthly-slot`（哈希槽位+品级分档）
- 新增行为：`NpcBehavior` → `registerBehavior()` → 自动调度
- 军事编制 AI（`militaryAI.ts`，militarySystem 中调用，跳过玩家）
- **push-task 过期默认行为**：新增 push-task behavior 时必须问"executeAsNpc 跑一遍是不是就是我想要的过期默认行为？"。是 → 通用 fallback 自动处理；否（NPC 路径含概率拒绝/条件性拒绝/会做对玩家不利的决定）→ 必须在 `NpcEngine.handleExpiredPlayerTasks` 加显式 `else if` 分支，明确"超时不管时玩家希望发生什么"，禁止让 NPC 替玩家做决定
- **草拟-审批双 behavior 范式**：新增"草拟人产出方案 → 审批人决定执行"类系统时，先读 **`docs/reference/draft-approve-pattern.md`**。要点：Submission 结构必须带 drafterId；三层 in-flight 锁（CD + buffer + playerTask）；urgency 分档 forced；玩家草拟入口走独立 React UI 而非 PlayerTask（避免 standing 模式 bug）；驳回 CD 在 drafter 维度而非 ruler；审批 behavior 的 executeAsNpc 顶部必须过滤已死草拟人（草拟到审批可跨多日）。当前实现：treasury（draft + approve）+ deploy（draft + approve）。deploy 额外加"战时跳过"锁——战争 AI 归战争引擎，draft behavior 不感知前线，仅服务和平期边境集结。

---

## 七、战争系统

详见 **`docs/reference/war-system.md`**。要点：多方参战、合兵战斗、停战协议、CB 权重平衡、行营 AI、关隘通行。

---

## 八、当前开发阶段

Phase 6（谋略+派系+事件）95%。详细进度见 `docs/milestones.md`。

### 尚未完成（后续系统）
- 更多个人交互 | 谋略系统 | 活动系统 | 派系系统 | 更多随机事件
- 旅行系统（`locationId` 从派生值改独立状态 + 旅行时间，活动/侠客系统前置依赖）
- 存档/读档 UI | AI 史书 | 生育系统 | 人才自然生成 | 非宗法皇位更替
- 权知机制 | 地图增强 | 行营AI优化 | 强力CB

### 测试原则
- **默认测纯函数**（Calc/dateUtils/territoryUtils）。
- **不测** UI 渲染快照、NPC 决策权重（行为权重随平衡频繁调整，写死会反过来阻塞重构）。
- 允许写**少量高价值集成测试**，**仅限**以下白名单类别（这一轮 BUG 类型证明纯函数兜不住）：
  1. **存档 round-trip 不变量**：serialize → deserialize 后 store 状态应等价；含决议型 StoryEvent 在 effectKey resolver 路径下的恢复。
  2. **死亡接续不变量**：领袖死亡后战争 attackerId/defenderId 应转交给继承人；玩家绝嗣后 playerId === null && dynastyExtinct === true。
  3. **治所州联动不变量**：4 个 `executeToggleX` 调用后，道主岗与治所州主岗的 successionLaw / hasAppointRight / territoryType / designatedHeirId 必须严格相等。
  4. **execute 契约**：传入 stale 前提（已被换 holder 的 post / 已失效的 post / 已花光的资源）后，对应 `executeXxx` 必须返回 false / stale，且 store 状态零变化。
- 集成测试也必须写**具体期望数值**，禁止 `toBeGreaterThan(0)`。
- 拿不准是否在白名单里 → 默认不写，先在 plan 里讨论。
