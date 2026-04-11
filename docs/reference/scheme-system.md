# 计谋系统参考

> CLAUDE.md 的"计谋系统"章节指向此文档。当前 v1.1 含拉拢（basic）+ 离间（complex）。完整设计见 `wantang/docs/plans/scheme-system-v1.md`。

## 数据模型

- `engine/scheme/` 目录
- `SchemeStore` Map<id, SchemeInstance> + `initiatorIndex / targetIndex` 双反向索引
- 索引**不存档**，由 `initSchemes` 重建

## SchemeTypeDef 框架

每种计谋一个 `engine/scheme/types/<id>.ts` 文件，调 `registerSchemeType()` 自注册；`data/schemes.ts` import 触发。引擎 / Store / 日结 / UI **不感知具体类型**。

### 泛型 + 守卫

- `SchemeTypeDef<TParams>` 内部所有方法签名都是强类型
- `executeInitiateScheme(initiatorId, schemeTypeId, rawParams: unknown, precomputedRateOverride?)` 入口由 `def.parseParams(raw): TParams | null` 一次性强类型化
- **禁止任何 `as string`**，参数走 `parseParams` 的运行时校验
- 第 4 参 `precomputedRateOverride` 语义是"v2 AI 方法路径绕过基础公式直接覆盖最终 initial rate"（原名 `precomputedMethodBonus`，v2 重命名）

## basic vs complex 分级

- **basic**（拉拢）：单阶段倒计时
- **complex**（离间）：多阶段每段 +growth
- 两者走**同一** SchemeStore 和 runSchemeSystem，仅靠 `isBasic` + `phaseCount` 区分

## 快照原则

`initInstance()` 时把所有数值（`spymasterStrategy / targetSpymasterStrategy / methodBonus / initialSuccessRate`）冻结进 `snapshot`，之后任何外部变化（更换谋主 / 特质变动）**不影响进行中计谋**。

## runSchemeSystem 双挂载（必须！）

- **非月初**：挂 `runDailySettlement` 内 `if(date.day !== 1)` 分支（`warSystem` 之后、`NpcEngine` 之前）
- **月初**：挂 `runMonthlySettlement` 内 `runCharacterSystem` **之后**、`runDailyNpcEngine` **之前**——保证看到最新死亡/继承结果

## mutation 纪律（硬约束）

`runSchemeSystem` 内**禁止** `scheme.phase.progress += 1` 这类直接 mutate；所有状态变更走 `store.updateScheme / setStatus / removeScheme`，保证 Zustand 订阅链可见。

## 执行链早退

`runSchemeSystem` 顶部立即：

```ts
if (active.length === 0) return;
```

避免每日构建 schemeCtx。

## AI 方法（v2 离间自拟妙计）

复用 chronicle LLM 栈（`@engine/chronicle/llm/createProvider` + `loadLlmConfig`），orchestration 在 `engine/scheme/llm/schemeAiMethod.ts`。

框架层 `SchemeTypeDef.buildAiMethodPrompt?(initiator, params, customDescription, ctx): LlmPrompt` —— **只有支持 AI 方法的 scheme type 实现，当前仅离间**。

### 关键约定

1. **LLM 返回最终 initial rate**（不是 bonus），通过 `precomputedRateOverride` 第 4 参绕过 `calcAlienationInitialRate` 基础公式（prompt 里已给主谋谋略，叠加 `stratDiff×3` 会双重计数）
2. **clamp 范围**：AI 方法 `[-20, 100]`（vs 预设方法 `[5, 80]`），`onPhaseComplete` cap 也分支到 100（vs 90）
3. **`canInitiate` 是 stale 守卫单点**：扩签名多收 `precomputedRateOverride?`，实现里检查"AI 方法未带 override → 返回 stale 原因字串"；`initInstance` 遇到非法输入走 `console.error` + rate=0 兜底（不抛），维持 execute 路径"失败返回 false 不抛"的契约
4. **NPC 完全不接触 AI 方法**：`getAvailableAlienationMethods()` 过滤 `isAI` 供 NPC 用；`getAlienationMethodsForUI()` 含 AI 方法仅供玩家 UI 用。**新增 AI 方法时这条分流必须保持**
5. **UI 缓存键**：`SchemeInitFlow` 的 `customEvaluation` 必须按 `(primaryId, secondaryId, description)` 三元组 key，任一变动即失效。`handleConfirm` 传 override 前必须再次比对 key
6. **mock 兜底**：`isAiMethodAvailable()` 异步检测，UI mount effect 探测，`null` 期间显示"检测配置中"，`false` 时 disabled + tooltip 指向设置
7. **prompt builder 允许读 live Store**（territories / military / centralPosts），因为它只在玩家主动发起时调用一次，非热路径。**不得**扩 `SchemeContext` 字段为 AI prompt 服务

## 死亡终止

`runSchemeSystem` 每日检查 `initiator / primaryTarget / secondaryTarget` 任一死亡 → `setStatus('terminated')` + StoryEvent 通知玩家（如玩家是参与方）。

**计谋不随继承转移**——同 alliance，是个人契约。

## 通知规则（D6）

- **发起时不通知**（隐秘性本质，即使 v1 没做 secrecy）
- **结算时**玩家是参与方 → StoryEvent + `effectKey: 'noop:notification'`

## NPC 行为

每种 scheme 一个独立 behavior（`curryFavorBehavior / alienateBehavior`），`playerMode: 'skip'` + `schedule: 'monthly-slot'`。

### 岗位门槛

- **拉拢**：`getActorMaxMinRank ≥ 12`（刺史）
- **离间**：`≥ 17`（节度使）

用 `holderIndex + postIndex + positionMap.get(templateId).minRank`，皇帝（`pos-emperor minRank=29`）走同一路径自动通过，无需特判。

### 候选池从 actor 已知关系直接展开（硬约束：性能纪律）

**禁止 `for (c of ctx.characters.values())` 全表扫描**——之前 alienate N×N 是 ~8M 步/天瓶颈。

- **拉拢候选池** = `[overlord, vassals, 家庭, 中央同朝为官, 邻居州 locationIndex]`
- **离间 primary 候选池** = `[overlord, vassals, 相邻同级 ruler]`（后者用 `buildZhouAdjacency` + overlord 链上溯到 `minRank ≥ 17`）
- **离间 secondary 候选池** = primary 的 `[overlord, vassals, allies]`（**不**含家庭 / 同僚）

### per-(initiator, primaryTarget, schemeType) CD 365 天

- `SchemeInstance.resolveDate` 在 success / failure 结算时写入（terminated 不写）
- `SchemeStore.hasRecentScheme(...)` 做 live 校验（`executeInitiateScheme` 契约兜底）
- NPC 行为走 `NpcContext.hasRecentSchemeOnTarget(initiator, target, typeId)` 快照接口（`buildNpcContext` 时预聚合 `schemeCdIndex: Map<key, resolveAbsDay>`，active scheme 用 `Infinity` 标记）
- **禁止**在 `generateTask` 里直接 `useSchemeStore.getState().hasRecentScheme(...)`

### NpcContext 快照接口

- **`getAllies(charId): string[]`**：闭包 `warState.getAllies + currentDay`，behavior 读盟友列表不直接 poke WarStore
- **`getPeerNeighbors(charId): ReadonlySet<string>`** lazy 快照：返回相邻的节度使级以上 rulers。内部基于 realm 边界（自身直辖 + 直属 vassal 直辖 zhou）做一跳邻接 + overlord 链上溯到 `minRank ≥ 17` 祖先。首次 ~500-1500 ops，之后 O(1)。**多 NPC 行为共享同一视图**，同 tick 内不会 drift。
- **新增涉及"相邻敌对势力 rulers"逻辑的 behavior 时必须走这个接口**，不要在 behavior 本地扫邻接

## 存档

- `SAVE_VERSION = 7`
- v5 → v6：注入 schemes 空数组
- v6 → v7：已结算 scheme 用 `startDate` 作为 `resolveDate` 近似回填
- 新字段必填 + 显式 migration，**不要**走 optional + 兜底反模式

## 长测 sim

`SCHEME_SIM=1 npx vitest run scheme-frequency-sim`

`src/__tests__/scheme-frequency-sim.test.ts` 是计谋频率观测长测（默认 `describe.skipIf(!process.env.SCHEME_SIM)`，单次 ~60-90s 不进 CI）。跑 24 个月完整日结/月结管线，产出 `scheme-frequency-report.txt`（仓库根目录），内含：

- 每种 scheme 的月均频率、按状态分布、月度分布、TOP 10 发起人
- 初始成功率分布 + 桶位直方图
- `generateTask` 的 **weight 分布直方图**（monkey-patch `behavior.generateTask` 采样非 null 返回值的 weight）+ 统计 mean/p50/p90/p99/max

### 目标区间参考

调 NPC weight / 成功率 / 候选池后用此 sim 看效果，**不要盲调**。

- **拉拢**：~1.5-2.5 次/月，weight mean 10-20，max 25-40
- **离间**：~0.3-1 次/月，weight mean 15-30，max 40-80
- **比率**：拉拢/离间 2-4:1（叙事上拉拢日常、离间稀缺）
