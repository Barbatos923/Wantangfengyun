# 计谋系统 v1 实施方案

> 框架 + 拉拢（basic）+ 离间（complex）

## 0. 锁定决策（已与用户对齐）

| # | 决策 | 选择 |
|---|------|------|
| D1 | `SchemeInstance` 数据结构 | 鉴别联合 + 柔性 `data` 字段 |
| D2 | `SchemeTypeDef` 形态 | 策略对象 + 自注册 registry，引擎/Store/日结/UI 不感知具体类型 |
| D3 | basic vs complex 推进 | basic = 单阶段倒计时；complex = 多阶段，每阶段完成后 successRate 成长 |
| D4 | 关系约束 | **拉拢**：允许对任何人（含直属臣属）；**离间**：`canShow/canExecute` 允许对任何人作为 `primaryTarget`，但 `secondaryTarget` 必须与 `primaryTarget` 存在关系（领主-臣属 / 直系亲属 / 同势力同僚 / 同盟） |
| D5 | NPC 行为粒度 + 玩家模式 | 每种计谋一个独立 behavior；`playerMode: 'skip'`（NPC 自主，不走 push-task）。发现/反制 v2 在计谋系统内通过 StoryEvent 实现 |
| D6 | StoryEvent 通知 | 启动时不通知；NPC→玩家结算时 StoryEvent；**玩家自己发动的结算也走 StoryEvent**（不只是 toast）。全部 `effectKey: 'noop:notification'` |
| D7 | 谋主机制 | v1 不做，`initiator` 自身 strategy 决定并发上限和成功率；预留 `snapshot.spymasterId` 字段方便 v1.1 接入 |
| Q5 | 计谋成本 | 纯金钱，从私产扣（`Character.resources.money`） |
| Q6 | 拉拢主属性 | `diplomacy`（外交） |
| Q7 | 离间失败后果 | **中度**：`primaryTarget` 和 `secondaryTarget` 双方对 initiator 各 -40 好感（decayable），initiator 失 20 威望 |
| Q8 | 离间方法差异化模型 | 折中方案：成本/时长/副作用统一，**只有方法专属的条件加成 `calcBonus` 不同**。基础成功率 35 由计谋类型统一设定。三种方法的差异完全体现在"对什么样的目标更有效"上 |
| Q9 | 离间方法清单 | **散布谣言** / **伪造书信** / **美人计**（不区分目标性别） |
| Q10 | AI 方法支持 | v1 **不实现**，但**预留干净接口**：`methodId` 用 string、`methodBonus` 统一快照字段、`executeInitiateScheme` 接受可选 `precomputedMethodBonus` 第 4 参、`AlienationData` 预留 `customDescription? / aiReasoning?` 字段。v2 接入时核心引擎零改动 |
| R1 | 月初/非月初执行顺序（GPT 评审） | `runSchemeSystem` **两处挂载**，模仿 NpcEngine 双调用范式：非月初挂 `runDailySettlement` 内 `if (date.day !== 1)` 分支；月初挂 `runMonthlySettlement` 内 `runCharacterSystem` 之后、`runDailyNpcEngine` 之前。保证 scheme 在月初看到死亡/继承结果 |
| R2 | 史书 `formatActorRoles` 真实位置（GPT 评审） | 在 `chroniclePromptBuilder.ts` 不在 `chronicleEventContext.ts`。后者只有 `EVENT_FIELD_MAP`；新增 case 时改前者 |
| R3 | params 强类型守卫（GPT 评审） | `SchemeTypeDef<TParams>` 泛型 + 每个 def 提供 `parseParams(raw): TParams \| null` 守卫；`executeInitiateScheme` 入口接 `unknown` 后由 parseParams 一次性强类型化；def 内部所有方法签名都拿到强类型，**禁止任何 `as string`** |
| R4 | runSchemeSystem mutation 纪律（GPT 评审） | 禁止 `scheme.phase.progress += 1` 这种直接 mutate；所有状态变更走 `store.updateScheme / setStatus`，保证 Zustand 订阅可见 |
| R5 | SAVE_VERSION 升版本（GPT 评审） | 升 5 → 6 + `migrations.ts` 加 v5→v6 迁移函数，**不**用 optional 字段 + 兜底兼容（这是反模式） |

### v1 刻意放弃 / 预留扩展位

| 范围 | v1 处理 |
|------|---------|
| 代理人邀请系统 | 不做。`SchemeInstance.agents?: SchemeAgent[]` 字段保留为 `undefined`，离间初始成功率仅由 initiator + 双方关系决定 |
| 隐秘度 / 月度暴露 / breach | 不做。`secrecy?: number` 字段保留 `undefined` |
| 反制 | 不做。后续在防守方州/道级建筑挂 modifier |
| Critical moment 阶段切换事件 | 不做。complex 阶段静默推进 |
| 起始代理包（CK3 starter package） | 不做 |
| 谋主全局委任 | 见 D7 |
| **AI 方法（玩家自拟策略 + LLM 评分）** | **接口预留**（见 Q10）。`SchemeInitFlow` 不显示 AI 方法卡片，`executeInitiateScheme` 的可选 `precomputedMethodBonus` 第 4 参 v1 永远是 undefined，`AlienationData.customDescription / aiReasoning` 字段 v1 永远是 undefined，但所有相关代码路径已能处理这些字段，v2 加入时无需改核心引擎 |

## 1. 总体架构

```
data/schemes.ts              ← 注册中心入口（导入所有类型，触发 self-register）
engine/scheme/
├── types.ts                 ← SchemeInstance / SchemeTypeDef / SchemeAgent / SchemeStatus
├── registry.ts              ← schemeTypeRegistry: Map<string, SchemeTypeDef>
├── schemeCalc.ts            ← 通用纯函数：并发上限 / 模糊成功率分档 / 关系约束工具
├── SchemeStore.ts           ← Zustand store + 索引
├── schemeSystem.ts          ← runSchemeSystem(date) 日结入口
├── types/
│   ├── curryFavor.ts        ← 拉拢 SchemeTypeDef + AlienationData / executePure
│   └── alienation.ts        ← 离间 SchemeTypeDef + 三种方法 + 关系候选集
└── index.ts                 ← 桶导出
```

## 2. 类型定义（`engine/scheme/types.ts`）

```ts
import type { GameDate } from '@engine/types';

export type SchemeStatus = 'active' | 'success' | 'failure' | 'exposed' | 'terminated';

export interface SchemePhase {
  current: number;            // 1-based
  total: number;
  progress: number;           // 0..phaseDuration
  phaseDuration: number;      // 当前阶段总天数
}

export interface SchemeAgent {
  characterId: string;
  role: string;               // '同谋' / '内应' / '代理人'
  contribution: 'success' | 'speed' | 'secrecy';
  snapshotStrategy: number;   // 发起时快照
}

export interface SchemeSnapshot {
  spymasterId: string;        // v1 = initiatorId
  spymasterStrategy: number;  // v1 = initiator.strategy（或 diplomacy，视类型）
  targetSpymasterId: string;
  targetSpymasterStrategy: number;
  initialSuccessRate: number; // 启动时计算的初始成功率
}

// ── 类型专属 data 鉴别联合 ──
export interface CurryFavorData {
  kind: 'curryFavor';
}

export interface AlienationData {
  kind: 'alienation';
  secondaryTargetId: string;
  /**
   * 方法 ID。预定义：'rumor' | 'forgedLetter' | 'honeyTrap'。
   * v2 预留：'custom'（AI 方法，玩家输入自然语言由 LLM 评分）。
   * 故意用 string 而非 union 以便扩展。
   */
  methodId: string;
  /** 启动时快照的方法加成（纯加分）。预定义方法 init 时算，AI 方法 v2 由 LLM 返回值填入。 */
  methodBonus: number;
  // ── v2 AI 方法专属，v1 永远 undefined ──
  /** 玩家输入的自定义策略描述原文 */
  customDescription?: string;
  /** LLM 给出的评分理由（成功/失败结算时附加到史书 description） */
  aiReasoning?: string;
}

export type SchemeTypeData = CurryFavorData | AlienationData;

export interface SchemeInstance {
  id: string;
  schemeTypeId: string;       // 'curryFavor' | 'alienation'
  initiatorId: string;
  primaryTargetId: string;
  startDate: GameDate;
  status: SchemeStatus;

  // 推进状态：basic 也用 phase 结构（total=1）
  phase: SchemePhase;

  // 数值
  snapshot: SchemeSnapshot;
  currentSuccessRate: number; // complex 随阶段成长，basic 等于 initialSuccessRate

  // v2 扩展位（v1 保持 undefined）
  agents?: SchemeAgent[];
  secrecy?: number;
  breaches?: number;

  // 类型专属
  data: SchemeTypeData;
}
```

### `SchemeTypeDef` 策略对象

```ts
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import type { SchemeInstance, SchemeTypeData } from './types';

/**
 * 启动参数基础形态（所有计谋共享）。
 * 类型专属字段在派生 interface 中加，例如 AlienationParams 加 secondaryTargetId/methodId。
 *
 * 设计动机：避免 `extra: Record<string, unknown>` 导致下游各处 `as string` 强转。
 * SchemeTypeDef 通过泛型 TParams 在内部方法签名拿到强类型，
 * `executeInitiateScheme` 入口接收 `unknown` 后由 def.parseParams 守卫一次性解析。
 */
export interface BaseSchemeParams {
  primaryTargetId: string;
}

/** 拉拢专用 params（无额外字段） */
export interface CurryFavorParams extends BaseSchemeParams {}

/** 离间专用 params */
export interface AlienationParams extends BaseSchemeParams {
  secondaryTargetId: string;
  methodId: string;
  // v2 AI 方法预留，v1 永远 undefined
  customDescription?: string;
  aiReasoning?: string;
}

export interface SchemeContext {
  characters: Map<string, Character>;
  territories: Map<string, Territory>;
  currentDate: GameDate;
  // 通过 lazy 函数访问，避免直读 store
  getOpinion: (a: string, b: string) => number;
  hasAlliance: (a: string, b: string) => boolean;
  vassalIndex: Map<string, Set<string>>;
}

export interface SchemeEffectOutcome {
  kind: 'success' | 'failure';
  // 一次掷骰之后的副作用快照（供 chronicle/storyevent 使用）
  description: string;
}

export interface SchemeTypeDef<TParams extends BaseSchemeParams = BaseSchemeParams> {
  id: string;
  name: string;
  icon: string;
  category: 'hostile' | 'personal' | 'political';
  isBasic: boolean;
  baseDurationDays: number;     // basic = 总天数；complex = 单阶段天数
  phaseCount: number;           // basic = 1
  costMoney: number;            // 私产扣

  /** UI 简介 */
  description: string;
  /** 史书 type 字串（必须在 CHRONICLE_TYPE_WHITELIST 中） */
  chronicleTypes: { initiate: string; success: string; failure: string };

  /**
   * 入口守卫：把任意 raw 输入解析为强类型 TParams。
   * 调用约定：所有 params 字段缺失或类型不对一律返回 null（执行层视为 stale）。
   * 这是把"动态调度的 unknown 入参"和"def 内部强类型方法"之间的唯一桥梁，
   * 解析后的 TParams 在 canInitiate / initInstance 中无需再做 type assertion。
   */
  parseParams(raw: unknown): TParams | null;

  /** 哪些参与者出现在 UI 候选集中 */
  getValidPrimaryTargets(initiator: Character, ctx: SchemeContext): Character[];

  /**
   * canShow 级别：极廉价，仅用于交互菜单。
   * 严格化校验由 canInitiate 完成。
   */
  canShow(initiator: Character, target: Character, ctx: SchemeContext): boolean;

  /**
   * canInitiate：发起前完整校验。返回 null = 可发起，否则返回原因字串。
   * UI 灰显按钮 + execute stale 校验都调它。
   */
  canInitiate(initiator: Character, params: TParams, ctx: SchemeContext): string | null;

  /**
   * 启动时构建类型专属 data + 计算 initialSuccessRate + methodBonus 快照。
   * 全程纯函数，从 Character 快照取值，不直接读 store。
   *
   * @param precomputedMethodBonus v2 AI 方法路径专用：调用方已通过 LLM 取得评分，
   *                                跳过类型内部的同步加分计算。v1 永远是 undefined。
   */
  initInstance(
    initiator: Character,
    params: TParams,
    ctx: SchemeContext,
    precomputedMethodBonus?: number,
  ): {
    data: SchemeTypeData;
    initialSuccessRate: number;
    snapshot: SchemeSnapshot;
  };

  /**
   * complex 才实现：阶段完成时回调。返回新的 currentSuccessRate（基于成长公式）。
   * basic scheme 实现可省略或返回 currentSuccessRate 不变。
   */
  onPhaseComplete?(scheme: SchemeInstance, ctx: SchemeContext): number;

  /**
   * 终局结算：返回 outcome（不直接写状态）。
   */
  resolve(scheme: SchemeInstance, rng: () => number, ctx: SchemeContext): SchemeEffectOutcome;

  /**
   * 真正写状态（addOpinion / 扣威望 / 史书 emit）。
   * 必须遵守 execute 契约：内部对参与者再做存活校验。
   */
  applyEffects(scheme: SchemeInstance, outcome: SchemeEffectOutcome, ctx: SchemeContext): void;

  /**
   * NPC 权重生成（generateTask 调用）：返回 BehaviorTaskResult 或 null。
   * 接 NpcContext 而非 SchemeContext —— 这是 NPC 行为路径，复用现有快照。
   * 返回的 params 已经是强类型 TParams，executeInitiateScheme 调用前会再走 parseParams 校验。
   */
  npcGenerateTask?(actor: Character, npcCtx: import('@engine/npc/types').NpcContext):
    | { params: TParams; weight: number }
    | null;
}
```

**Registry 类型擦除约定**：`schemeTypeRegistry: Map<string, SchemeTypeDef<any>>`。`executeInitiateScheme` 入口接 `unknown` 类型的 params raw，调 `def.parseParams(raw)` 一次性强类型化，之后所有 def 内部方法都拿到强类型，**禁止任何 `as string` / `as Record<string, unknown>`**。

## 3. Registry（`engine/scheme/registry.ts`）

```ts
const registry = new Map<string, SchemeTypeDef>();

export function registerSchemeType(def: SchemeTypeDef): void {
  if (registry.has(def.id)) {
    console.warn(`[scheme] duplicate registration: ${def.id}`);
    return;
  }
  registry.set(def.id, def);
}

export function getSchemeType(id: string): SchemeTypeDef | undefined {
  return registry.get(id);
}

export function getAllSchemeTypes(): SchemeTypeDef[] {
  return Array.from(registry.values());
}
```

`data/schemes.ts` 只做一件事：

```ts
import '@engine/scheme/types/curryFavor';
import '@engine/scheme/types/alienation';
```

`main.tsx` 在启动时 import 一次，触发 self-register。

## 4. 通用纯函数（`engine/scheme/schemeCalc.ts`）

```ts
/** 并发上限：v1 直接用 initiator.strategy / 8 */
export function calcSchemeLimit(initiatorStrategy: number): number {
  return Math.max(1, Math.floor(initiatorStrategy / 8));
}

/** 模糊成功率分档（UI 显示） */
export type FuzzySuccess =
  | { kind: 'exact'; value: number }
  | { kind: 'tier'; tier: '高' | '中' | '低' }
  | { kind: 'rough'; tier: '偏高' | '偏低' }
  | { kind: 'unknown' };

export function getFuzzySuccess(
  observerStrategy: number,
  targetStrategy: number,
  trueRate: number,
): FuzzySuccess {
  const diff = observerStrategy - targetStrategy;
  if (diff >= 12) return { kind: 'exact', value: Math.round(trueRate) };
  if (diff >= 6) {
    if (trueRate >= 70) return { kind: 'tier', tier: '高' };
    if (trueRate >= 40) return { kind: 'tier', tier: '中' };
    return { kind: 'tier', tier: '低' };
  }
  if (diff >= 0) return { kind: 'rough', tier: trueRate >= 50 ? '偏高' : '偏低' };
  return { kind: 'unknown' };
}

/** 关系存在性（用于离间次要目标候选集） */
export function hasRelationship(
  a: Character,
  b: Character,
  ctx: SchemeContext,
): boolean {
  if (a.overlordId === b.id || b.overlordId === a.id) return true;       // 领主-臣属
  if (a.family.fatherId === b.id || b.family.fatherId === a.id) return true; // 父子
  if (a.family.spouseId === b.id) return true;                            // 夫妻
  if (a.family.childrenIds.includes(b.id)) return true;                   // 子女
  if (b.family.childrenIds.includes(a.id)) return true;
  // 同势力同僚：共同效忠根
  if (sameRealmRoot(a, b, ctx.characters)) return true;
  // 同盟
  if (ctx.hasAlliance(a.id, b.id)) return true;
  return false;
}
```

## 5. SchemeStore（`engine/scheme/SchemeStore.ts`）

```ts
interface SchemeStoreState {
  schemes: Map<string, SchemeInstance>;
  initiatorIndex: Map<string, Set<string>>;  // initiatorId → schemeIds，反序列化时重建
  targetIndex: Map<string, Set<string>>;     // primaryTargetId → schemeIds，反序列化时重建

  // —— 写操作 ——
  addScheme: (scheme: SchemeInstance) => void;
  removeScheme: (id: string) => void;
  updateScheme: (id: string, patch: Partial<SchemeInstance>) => void;
  setStatus: (id: string, status: SchemeStatus) => void;

  // —— 查询 ——
  getActiveSchemesByInitiator: (charId: string) => SchemeInstance[];
  getActiveSchemesByTarget: (charId: string) => SchemeInstance[];
  getActiveSchemeCount: (charId: string) => number;
  getAllActive: () => SchemeInstance[];

  // —— 反序列化入口 ——
  initSchemes: (schemes: SchemeInstance[]) => void;
}
```

- `initiatorIndex` / `targetIndex` **不写入存档**，由 `initSchemes` 重建（参考 vassalIndex 模式）
- `addScheme` / `removeScheme` / `setStatus` 维护两个索引
- `updateScheme` 不允许改 `initiatorId` / `primaryTargetId`（patch 限制）

## 6. 日结系统（`engine/scheme/schemeSystem.ts`）

### 6.1 mutation 纪律

`runSchemeSystem` **绝不直接 mutate** `store.schemes` 取出的 instance 对象。所有进度推进、阶段切换、状态变更都走 `SchemeStore` 的接口（`updateScheme` / `setStatus` / `removeScheme`），保证 Zustand 订阅链可见。

```ts
export function runSchemeSystem(date: GameDate): void {
  const store = useSchemeStore.getState();
  const cs = useCharacterStore.getState();
  const ctx = buildSchemeContext();
  const rng = random;

  // 取快照列表（避免迭代过程中 store 被修改）
  const active = store.getAllActive();

  for (const scheme of active) {
    // 1. 死亡终止：发起人 / primaryTarget / secondaryTarget 任一死亡
    if (!isSchemeStillValid(scheme, cs)) {
      store.setStatus(scheme.id, 'terminated');
      notifySchemeTerminated(scheme);
      continue;
    }

    // 2. 推进进度（必须走 store 接口，禁止 scheme.phase.progress += 1）
    const newProgress = scheme.phase.progress + 1;

    // 3. 阶段未完成 → 单纯推进
    if (newProgress < scheme.phase.phaseDuration) {
      store.updateScheme(scheme.id, {
        phase: { ...scheme.phase, progress: newProgress },
      });
      continue;
    }

    // 4. 阶段完成
    const def = getSchemeType(scheme.schemeTypeId)!;
    if (scheme.phase.current < scheme.phase.total) {
      // 复杂计谋：进入下一阶段（构造一个临时快照供 onPhaseComplete 计算）
      const tickedScheme: SchemeInstance = {
        ...scheme,
        phase: { ...scheme.phase, progress: newProgress },
      };
      const newRate = def.onPhaseComplete?.(tickedScheme, ctx) ?? scheme.currentSuccessRate;
      store.updateScheme(scheme.id, {
        phase: {
          ...scheme.phase,
          current: scheme.phase.current + 1,
          progress: 0,
        },
        currentSuccessRate: newRate,
      });
    } else {
      // 最终阶段完成 → 结算
      const outcome = def.resolve(scheme, rng, ctx);
      def.applyEffects(scheme, outcome, ctx);
      store.setStatus(scheme.id, outcome.kind);
      notifySchemeResolved(scheme, outcome);
    }
  }
}
```

### 6.2 日结/月结挂载点（关键：必须分流，模仿 NpcEngine 模式）

当前 `settlement.ts` 的结构是 daily callback + monthly callback **分开**调度的：

- **非月初**（`day !== 1`）：`runDailySettlement` 执行 `runWarSystem` → `runDailyNpcEngine` → 应在此插入 `runSchemeSystem`
- **月初**（`day === 1`）：先跑 `runDailySettlement`（只 warSystem，跳过 NPC），再跑 `runMonthlySettlement`（characterSystem → NpcEngine → ...）

**关键问题**：scheme 在月初 1 号必须看到最新的死亡/继承结果，否则会出现"昨天还活着的角色今天月初死了，scheme 没检测到、又跑了一天才发现"。所以月初路径必须把 `runSchemeSystem` 放到 `runCharacterSystem` **之后**、`runDailyNpcEngine` **之前**。

模仿现有的 `runDailyNpcEngine` 双挂载范式（参见 `settlement.ts:25-30, 82-83`）：

```ts
// settlement.ts
export function runDailySettlement(date: GameDate): void {
  runWarSystem(date);
  if (date.day !== 1) {
    runSchemeSystem(date);   // 非月初：scheme 在 NPC 之前推进
    runDailyNpcEngine(date);
  }
}

export function runMonthlySettlement(date: GameDate): void {
  // ... 现有的同盟过期清理 ...
  runCharacterSystem(date);   // 1. 死亡 / 继承 / 健康
  runSchemeSystem(date);      // ← 插在这：看到最新世界状态后再推进
  runDailyNpcEngine(date);    // 2. NPC 决策
  runPopulationSystem(date);
  // ... 其余系统不变 ...
}
```

这样保证：
- 月初：`characterSystem` 处理完死亡/继承 → `schemeSystem` 看到最新 alive 状态、正确触发死亡终止 → `NpcEngine` 决策时已知 scheme 最新状态
- 非月初：`warSystem` 处理战事 → `schemeSystem` 推进 → `NpcEngine` 决策

### 6.3 `notifySchemeResolved` 通知规则（实现 D6）

```ts
function notifySchemeResolved(scheme: SchemeInstance, outcome: SchemeEffectOutcome) {
  const playerId = useCharacterStore.getState().playerId;
  if (!playerId) return;
  const isInitiator = scheme.initiatorId === playerId;
  const isTarget = scheme.primaryTargetId === playerId
    || (scheme.data.kind === 'alienation' && scheme.data.secondaryTargetId === playerId);
  if (!isInitiator && !isTarget) return;

  useStoryEventBus.getState().pushStoryEvent({
    id: crypto.randomUUID(),
    title: buildSchemeTitle(scheme, outcome, isInitiator),
    description: outcome.description,
    actors: buildSchemeActors(scheme, isInitiator),
    options: [{
      label: '知悉',
      description: '',
      effects: [],
      effectKey: 'noop:notification',
      effectData: {},
      onSelect: () => {},
    }],
  });
}
```

`notifySchemeTerminated` 同形态，仅在玩家是参与方时推送，title 为「计谋终止」。

## 7. 拉拢（`engine/scheme/types/curryFavor.ts`）

```ts
const CURRY_FAVOR_DURATION = 90;       // 90 天
const CURRY_FAVOR_COST = 200;          // 私产
const CURRY_FAVOR_BASE_RATE = 50;

const curryFavorDef: SchemeTypeDef = {
  id: 'curryFavor',
  name: '拉拢',
  icon: '🤝',
  category: 'personal',
  isBasic: true,
  baseDurationDays: CURRY_FAVOR_DURATION,
  phaseCount: 1,
  costMoney: CURRY_FAVOR_COST,
  description: '通过宴饮、馈赠和私下结交，增进对方对自己的好感。',
  chronicleTypes: { initiate: '发起拉拢', success: '拉拢成功', failure: '拉拢失败' },

  getValidPrimaryTargets(initiator, ctx) {
    return Array.from(ctx.characters.values()).filter(c =>
      c.alive && c.id !== initiator.id
    );
  },

  canShow(initiator, target) {
    return target.alive && initiator.id !== target.id;
  },

  canInitiate(initiator, params, ctx) {
    const target = ctx.characters.get(params.primaryTargetId);
    if (!target || !target.alive) return '目标不存在';
    if (target.id === initiator.id) return '不能对自己使用';
    if (initiator.resources.money < CURRY_FAVOR_COST) return `金钱不足（需 ${CURRY_FAVOR_COST}）`;
    // 并发上限校验由调用方（schemeAction）做
    return null;
  },

  initInstance(initiator, params, ctx) {
    const target = ctx.characters.get(params.primaryTargetId)!;
    // 拉拢：base 50 + diplomacy 差 × 1.5 + 现有好感 × 0.2
    const dipDiff = initiator.abilities.diplomacy - 10;  // 标准 10 为基线
    const opinionBonus = ctx.getOpinion(target.id, initiator.id) * 0.2;
    const rate = clamp(CURRY_FAVOR_BASE_RATE + dipDiff * 1.5 + opinionBonus, 5, 95);
    return {
      data: { kind: 'curryFavor' },
      initialSuccessRate: rate,
      snapshot: {
        spymasterId: initiator.id,
        spymasterStrategy: initiator.abilities.diplomacy,  // basic 用 diplomacy
        targetSpymasterId: target.id,
        targetSpymasterStrategy: target.abilities.diplomacy,
        initialSuccessRate: rate,
      },
    };
  },

  resolve(scheme, rng) {
    const success = rng() * 100 < scheme.currentSuccessRate;
    return {
      kind: success ? 'success' : 'failure',
      description: success
        ? `${getName(scheme.initiatorId)}的拉拢深得${getName(scheme.primaryTargetId)}之心，关系大为亲近。`
        : `${getName(scheme.initiatorId)}的拉拢未能打动${getName(scheme.primaryTargetId)}。`,
    };
  },

  applyEffects(scheme, outcome, ctx) {
    const cs = useCharacterStore.getState();
    if (outcome.kind === 'success') {
      // 双向 +25 好感（拉拢是建立关系，是双向的）
      cs.addOpinion(scheme.primaryTargetId, scheme.initiatorId,
        { reason: '受其拉拢', value: 25, decayable: true });
      cs.addOpinion(scheme.initiatorId, scheme.primaryTargetId,
        { reason: '与其结交', value: 15, decayable: true });
      emitChronicleEvent({
        type: '拉拢成功',
        actors: [scheme.initiatorId, scheme.primaryTargetId],
        territories: [],
        description: outcome.description,
        priority: EventPriority.Normal,
      });
    } else {
      // 失败：仅 -5 好感（拉拢失败不结仇）
      cs.addOpinion(scheme.primaryTargetId, scheme.initiatorId,
        { reason: '拒其示好', value: -5, decayable: true });
      emitChronicleEvent({
        type: '拉拢失败',
        actors: [scheme.initiatorId, scheme.primaryTargetId],
        territories: [],
        description: outcome.description,
        priority: EventPriority.Normal,
      });
    }
  },

  npcGenerateTask(actor, npcCtx) {
    // NPC 拉拢权重：找一个有负面好感但有结交价值的人
    // weight base 5 + sociability 10 - vengefulness 8
    // ... 详细 weight 在实现时定，目标是低频但偶尔触发
  },
};

registerSchemeType(curryFavorDef);
```

## 8. 离间（`engine/scheme/types/alienation.ts`）

### 8.1 统一参数（所有方法共用，**method 不影响这些**）

```ts
const ALIENATION_BASE_RATE = 35;       // 基础成功率（计谋类型统一）
const ALIENATION_PHASE_DAYS = 30;       // 单阶段天数
const ALIENATION_PHASES = 3;            // 阶段数
const ALIENATION_COST = 500;            // 私产
const ALIENATION_GROWTH_PER_PHASE = 8;  // 每阶段成功率 +8
const ALIENATION_INITIAL_CAP = 80;      // 初始成功率上限
const ALIENATION_FINAL_CAP = 90;        // 最终阶段封顶

// 失败副作用（统一，方法不影响）
const ALIENATION_FAIL_OPINION = -40;    // 双方对发起人
const ALIENATION_FAIL_PRESTIGE = -20;   // 发起人威望损失
const ALIENATION_SUCCESS_OPINION = -30; // 双方互相好感
```

### 8.2 方法定义（差异化全部在 `calcBonus`）

```ts
interface AlienationMethodDef {
  id: string;                  // 'rumor' | 'forgedLetter' | 'honeyTrap' | 'custom'(v2)
  name: string;
  description: string;
  hint: string;                // UI 提示文案：「适合对付：xxx」
  /** 同步加分函数。AI 方法 (isAI=true) 永远返回 0，由 LLM 路径填入 methodBonus */
  calcBonus: (
    primary: Character,
    secondary: Character,
    initiator: Character,
    ctx: SchemeContext,
  ) => number;
  /** v2 标记：AI 方法走独立 UI 流程，不显示在常规方法卡片列表中 */
  isAI?: boolean;
}

// ── 散布谣言：对多疑、胆小、偏听偏信者有效 ──
function rumorBonus(primary: Character): number {
  const p = calcPersonality(primary);
  let bonus = 0;
  // 多疑：vengefulness 高 → 容易猜忌身边人
  if (p.vengefulness > 0.5) bonus += (p.vengefulness - 0.5) * 40;
  // 胆小：boldness 低 → 风吹草动疑神疑鬼
  if (p.boldness < 0.4) bonus += (0.4 - p.boldness) * 30;
  // 偏听偏信：rationality 低 → 听到啥信啥
  if (p.rationality < 0.4) bonus += (0.4 - p.rationality) * 50;
  // 标志特质额外加成
  if (primary.traitIds.includes('trait-suspicious')) bonus += 8;
  if (primary.traitIds.includes('trait-coward')) bonus += 8;
  return clamp(bonus, 0, 50);
}

// ── 伪造书信：对双方有嫌隙、有所忌惮者有效 ──
function forgedLetterBonus(
  primary: Character,
  secondary: Character,
  _initiator: Character,
  ctx: SchemeContext,
): number {
  let bonus = 0;
  // 已有嫌隙：primary 对 secondary 的好感越负越好
  const op = ctx.getOpinion(primary.id, secondary.id);
  if (op < 0) bonus += Math.min(40, -op * 0.4);
  // 忌惮上级：primary 是 secondary 的直属臣属
  if (primary.overlordId === secondary.id) bonus += 15;
  // 实力差：secondary 法理层级显著高于 primary
  const ts = useTerritoryStore.getState();
  const stratGap = getSovereigntyTier(secondary.id, ts.territories, ts.centralPosts)
                 - getSovereigntyTier(primary.id, ts.territories, ts.centralPosts);
  if (stratGap >= 1) bonus += 5 * stratGap;
  return clamp(bonus, 0, 50);
}

// ── 美人计：对好色、贪婪者有效（节欲者免疫） ──
function honeyTrapBonus(primary: Character): number {
  // 节欲特质：直接 0，整个方法对其无效
  if (primary.traitIds.includes('trait-chaste')) return 0;
  const p = calcPersonality(primary);
  let bonus = 0;
  if (primary.traitIds.includes('trait-lustful')) bonus += 25;
  if (primary.traitIds.includes('trait-gluttonous')) bonus += 15;
  if (p.greed > 0.5) bonus += (p.greed - 0.5) * 40;
  if (primary.traitIds.includes('trait-greedy')) bonus += 10;
  return clamp(bonus, 0, 50);
}

const ALIENATION_METHODS: AlienationMethodDef[] = [
  {
    id: 'rumor',
    name: '散布谣言',
    description: '在市井与官场散播流言，使二人嫌隙渐生。',
    hint: '适合对付：多疑 / 胆小 / 偏听偏信者',
    calcBonus: (p, _s, _i, _c) => rumorBonus(p),
  },
  {
    id: 'forgedLetter',
    name: '伪造书信',
    description: '伪造一方致敌的密信，使之落入另一方手中。',
    hint: '适合对付：与目标已有嫌隙 / 忌惮上级者',
    calcBonus: forgedLetterBonus,
  },
  {
    id: 'honeyTrap',
    name: '美人计',
    description: '以声色之诱，使其沉溺自毁。',
    hint: '适合对付：好色 / 贪婪者（贞守者免疫）',
    calcBonus: (p, _s, _i, _c) => honeyTrapBonus(p),
  },
  // ── v2 预留：AI 方法 ──
  // {
  //   id: 'custom',
  //   name: '自拟妙计',
  //   description: '由你亲自构思一条策略，交由谋士评议',
  //   hint: '由 LLM 评估其合理性与威力',
  //   calcBonus: () => 0,  // never called for AI methods
  //   isAI: true,
  // },
];

export function getAlienationMethod(id: string): AlienationMethodDef | undefined {
  return ALIENATION_METHODS.find(m => m.id === id);
}

/** UI 候选集：v1 过滤掉 isAI 方法 */
export function getAvailableAlienationMethods(): AlienationMethodDef[] {
  return ALIENATION_METHODS.filter(m => !m.isAI);
}
```

### 8.3 SchemeTypeDef 注册（强类型 params，无 as 强转）

```ts
const alienationDef: SchemeTypeDef<AlienationParams> = {
  id: 'alienation',
  name: '离间',
  icon: '🗡',
  category: 'hostile',
  isBasic: false,
  baseDurationDays: ALIENATION_PHASE_DAYS,
  phaseCount: ALIENATION_PHASES,
  costMoney: ALIENATION_COST,
  description: '挑拨两位有关系的人物，使其关系破裂，互相敌视。',
  chronicleTypes: { initiate: '发起离间', success: '离间成功', failure: '离间失败' },

  /**
   * 入口守卫：把 unknown 解析为 AlienationParams。
   * 这是唯一允许做运行时类型检查的地方，下游所有方法拿到的都是强类型。
   */
  parseParams(raw): AlienationParams | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.primaryTargetId !== 'string') return null;
    if (typeof r.secondaryTargetId !== 'string') return null;
    if (typeof r.methodId !== 'string') return null;
    return {
      primaryTargetId: r.primaryTargetId,
      secondaryTargetId: r.secondaryTargetId,
      methodId: r.methodId,
      customDescription: typeof r.customDescription === 'string' ? r.customDescription : undefined,
      aiReasoning: typeof r.aiReasoning === 'string' ? r.aiReasoning : undefined,
    };
  },

  getValidPrimaryTargets(initiator, ctx) {
    return Array.from(ctx.characters.values()).filter(c =>
      c.alive && c.id !== initiator.id
    );
  },

  canShow(initiator, target) {
    return target.alive && initiator.id !== target.id;
  },

  canInitiate(initiator, params, ctx) {
    // params 已经是强类型 AlienationParams，无需任何 as
    const target = ctx.characters.get(params.primaryTargetId);
    if (!target?.alive) return '目标不存在';
    if (target.id === initiator.id) return '不能对自己使用';
    const secondary = ctx.characters.get(params.secondaryTargetId);
    if (!secondary?.alive) return '次要目标不存在';
    if (secondary.id === initiator.id || secondary.id === target.id) return '次要目标不可重复';
    if (!hasRelationship(target, secondary, ctx)) return '两者之间无可离间的关系';
    const method = getAlienationMethod(params.methodId);
    if (!method) return '手段不存在';
    if (method.isAI) return 'v1 暂不支持自拟妙计';   // v1 防御性拒绝
    if (initiator.resources.money < ALIENATION_COST) return `金钱不足（需 ${ALIENATION_COST}）`;
    return null;
  },

  /**
   * 启动构建实例。
   * @param precomputedBonus v2 AI 方法路径专用：LLM 已返回评分，跳过同步 calcBonus。
   *                         v1 永远是 undefined，走 method.calcBonus 同步路径。
   */
  initInstance(initiator, params, ctx, precomputedBonus) {
    // params 是强类型 AlienationParams，直接用
    const target = ctx.characters.get(params.primaryTargetId)!;
    const secondary = ctx.characters.get(params.secondaryTargetId)!;
    const method = getAlienationMethod(params.methodId)!;

    // 方法加分：优先用调用方提供的（AI 方法路径），否则同步计算
    const methodBonus = precomputedBonus !== undefined
      ? precomputedBonus
      : method.calcBonus(target, secondary, initiator, ctx);

    // 初始成功率（纯加法）
    const stratDiff = initiator.abilities.strategy - target.abilities.strategy;
    const baseRate = ALIENATION_BASE_RATE + stratDiff * 1.5;
    const finalRate = clamp(baseRate + methodBonus, 5, ALIENATION_INITIAL_CAP);

    return {
      data: {
        kind: 'alienation',
        secondaryTargetId: secondary.id,
        methodId: params.methodId,
        methodBonus,
        // v1 由 UI 永远不传，v2 AI 流程透传至此
        customDescription: params.customDescription,
        aiReasoning: params.aiReasoning,
      },
      initialSuccessRate: finalRate,
      snapshot: {
        spymasterId: initiator.id,
        spymasterStrategy: initiator.abilities.strategy,
        targetSpymasterId: target.id,
        targetSpymasterStrategy: target.abilities.strategy,
        initialSuccessRate: finalRate,
      },
    };
  },

  onPhaseComplete(scheme) {
    return Math.min(ALIENATION_FINAL_CAP, scheme.currentSuccessRate + ALIENATION_GROWTH_PER_PHASE);
  },

  resolve(scheme, rng) {
    const success = rng() * 100 < scheme.currentSuccessRate;
    const data = scheme.data as AlienationData;
    const method = getAlienationMethod(data.methodId);
    const methodName = method?.name ?? '计谋';
    return {
      kind: success ? 'success' : 'failure',
      description: success
        ? `${getName(scheme.initiatorId)}的${methodName}计成，${getName(scheme.primaryTargetId)}与${getName(data.secondaryTargetId)}终于反目。`
        : `${getName(scheme.initiatorId)}的${methodName}败露，${getName(scheme.primaryTargetId)}得知此事，怒不可遏。`,
    };
  },

  applyEffects(scheme, outcome, _ctx) {
    const cs = useCharacterStore.getState();
    const data = scheme.data as AlienationData;

    // v2 AI 方法支持：reasoning 存在时附加到史书 description（v1 永远是 undefined，分支死代码）
    let description = outcome.description;
    if (data.aiReasoning) description += `（谋士评议：${data.aiReasoning}）`;

    if (outcome.kind === 'success') {
      // 成功：双向 -30 好感
      cs.addOpinion(scheme.primaryTargetId, data.secondaryTargetId,
        { reason: '受其离间', value: ALIENATION_SUCCESS_OPINION, decayable: true });
      cs.addOpinion(data.secondaryTargetId, scheme.primaryTargetId,
        { reason: '受其离间', value: ALIENATION_SUCCESS_OPINION, decayable: true });
      emitChronicleEvent({
        type: '离间成功',
        actors: [scheme.initiatorId, scheme.primaryTargetId, data.secondaryTargetId],
        territories: [],
        description,
        priority: EventPriority.Normal,
      });
    } else {
      // 失败：双方对发起人 -40，发起人 -20 威望
      cs.addOpinion(scheme.primaryTargetId, scheme.initiatorId,
        { reason: '离间败露', value: ALIENATION_FAIL_OPINION, decayable: true });
      cs.addOpinion(data.secondaryTargetId, scheme.initiatorId,
        { reason: '离间败露', value: ALIENATION_FAIL_OPINION, decayable: true });
      const initiator = cs.characters.get(scheme.initiatorId);
      if (initiator) {
        cs.updateCharacter(scheme.initiatorId, {
          resources: {
            ...initiator.resources,
            prestige: Math.max(0, initiator.resources.prestige + ALIENATION_FAIL_PRESTIGE),
          },
        });
      }
      emitChronicleEvent({
        type: '离间失败',
        actors: [scheme.initiatorId, scheme.primaryTargetId, data.secondaryTargetId],
        territories: [],
        description,
        priority: EventPriority.Normal,
      });
    }
  },

  npcGenerateTask(actor, npcCtx) {
    // NPC 离间权重：找有负面好感的目标 + 该目标有可离间的盟友/上级
    // 方法选择：v1 NPC 直接选 calcBonus 最高的方法（逐个试算取 max）
    // weight base 8 + vengefulness 12 - honor 10
    // ... 详细在实现时定
  },
};

registerSchemeType(alienationDef);
```

### 8.4 数值参考表

base 35 + 双方谋略 12（差 0）+ 三阶段最终成长 +16（满 = +24 但封顶 90）：

| 场景 | rumor bonus | forgedLetter bonus | honeyTrap bonus | 初始成功率（最高方法） | 最终成功率 |
|------|---|---|---|---|---|
| 多疑(0.8) + 怯懦(0.2) + 偏信(0.2) + 持有"多疑"特质 | **36** | 0 | 0 | 71% | 87% |
| 河北节度使 ↔ 皇帝，好感 -50，名义臣属 | 0 | **35** | 0 | 70% | 86% |
| 好色 + 贪婪(0.9) + 持有"纵欲"特质 | 0 | 0 | **50（封顶）** | 80% | 90% |
| 贞守特质 + 完全理性勇敢 | 0 | 0 | **0** | 35% | 51% |
| 双方好感 -100 + 多疑 + 好色（兼有） | 8 | **40** | 25 | 75% | 90% |

最后一行是关键：**多种条件同时成立时，玩家选最对症的方法**。系统不会自动叠加——这是策略选择的核心。

## 9. 玩家交互（`engine/interaction/schemeAction.ts`）

```ts
registerInteraction({
  id: 'scheme',
  name: '计谋',
  icon: '🎯',
  canShow: (player, target) => {
    if (player.id === target.id) return false;
    if (!target.alive || !player.alive) return false;
    // 至少有一种计谋的 canShow 通过
    const ctx = buildSchemeContext();
    return getAllSchemeTypes().some(def => def.canShow(player, target, ctx));
  },
  canExecuteCheck: (player) => {
    const limit = calcSchemeLimit(player.abilities.strategy);
    const active = useSchemeStore.getState().getActiveSchemeCount(player.id);
    if (active >= limit) return `谋力有限（${active}/${limit}）`;
    return null;
  },
  paramType: 'scheme',  // 新增 type → CharacterPanel 路由到 SchemeInitFlow
});

/**
 * 玩家发起计谋：必须遵守 execute 二次校验契约。
 * 返回 false = stale，true = 成功创建。
 *
 * @param rawParams 任意 raw 形态的入参（来自 UI 表单或 NPC behavior），
 *                   由 def.parseParams 一次性强类型化，下游零 type assertion。
 * @param precomputedMethodBonus v2 AI 方法路径专用：UI 调 LLM 已得到评分，由调用方传入快照值。
 *                                v1 永远是 undefined，走方法的同步 calcBonus 路径。
 */
export function executeInitiateScheme(
  initiatorId: string,
  schemeTypeId: string,
  rawParams: unknown,
  precomputedMethodBonus?: number,
): boolean {
  const def = getSchemeType(schemeTypeId);
  if (!def) return false;
  // 入口守卫：raw → 强类型 params。失败 = stale。
  const params = def.parseParams(rawParams);
  if (!params) return false;

  const cs = useCharacterStore.getState();
  const initiator = cs.characters.get(initiatorId);
  if (!initiator?.alive) return false;

  const ctx = buildSchemeContext();
  // 二次校验
  const reason = def.canInitiate(initiator, params, ctx);
  if (reason) return false;

  // 并发上限二次校验
  const limit = calcSchemeLimit(initiator.abilities.strategy);
  if (useSchemeStore.getState().getActiveSchemeCount(initiatorId) >= limit) return false;

  // 扣费
  if (initiator.resources.money < def.costMoney) return false;
  cs.updateCharacter(initiatorId, {
    resources: { ...initiator.resources, money: initiator.resources.money - def.costMoney },
  });

  // 构建实例（透传 precomputedBonus 给 initInstance；预定义方法路径 v1 永远是 undefined）
  const { data, initialSuccessRate, snapshot } = def.initInstance(
    initiator, params, ctx, precomputedMethodBonus
  );
  const instance: SchemeInstance = {
    id: crypto.randomUUID(),
    schemeTypeId,
    initiatorId,
    primaryTargetId: params.primaryTargetId,
    startDate: useTurnManager.getState().currentDate,
    status: 'active',
    phase: { current: 1, total: def.phaseCount, progress: 0, phaseDuration: def.baseDurationDays },
    snapshot,
    currentSuccessRate: initialSuccessRate,
    data,
  };
  useSchemeStore.getState().addScheme(instance);

  // 史书 emit（启动时）
  emitChronicleEvent({
    type: def.chronicleTypes.initiate,
    actors: [initiatorId, params.primaryTargetId],
    territories: [],
    description: `${initiator.name}对${cs.characters.get(params.primaryTargetId)?.name}发动${def.name}`,
    priority: EventPriority.Normal,
  });

  debugLog('scheme', `[${def.name}] ${initiator.name} → ${params.primaryTargetId}`);
  return true;
}
```

## 10. NPC 行为（每种计谋一个独立 behavior）

### `npc/behaviors/curryFavorBehavior.ts`

```ts
const curryFavorBehavior: NpcBehavior<{ params: SchemeInitiateParams }> = {
  id: 'curryFavor',
  playerMode: 'skip',           // NPC 自主，不推送 PlayerTask
  schedule: 'monthly-slot',
  generateTask(actor, ctx) {
    if (!actor.alive) return null;
    const def = getSchemeType('curryFavor')!;
    const result = def.npcGenerateTask?.(actor, ctx);
    if (!result) return null;
    return { data: { params: result.params }, weight: result.weight };
  },
  executeAsNpc(actor, data, ctx) {
    // NPC 路径：直接调 executeInitiateScheme
    executeInitiateScheme(actor.id, 'curryFavor', data.params);
    // 注意：返回值丢弃符合 NPC 范式（generate→execute 同 tick，stale 极低）
  },
};
registerBehavior(curryFavorBehavior);
```

### `npc/behaviors/alienateBehavior.ts`

同样形态，`schedule: 'monthly-slot'`、`playerMode: 'skip'`，目标选择逻辑：
- 扫描 actor 对哪些角色好感 < -20
- 对每个候选 primaryTarget，找其相邻（有关系的）secondaryTarget
- 随机选一个手段
- weight 由 vengefulness/boldness 加成，rationality/honor 减分

**关键纪律**：NPC 行为必须只读 `npcCtx`，不直接读 SchemeStore（除了通过 ctx 写不到的场景）。可以用 `useSchemeStore.getState().getActiveSchemeCount(actor.id)` 做并发上限校验，因为这是 store 查询而非 mutation；或者把 `schemeCount` 加到 NpcContext 预聚合。**v1 走前者更简单**。

## 11. UI 层

### 11.1 `SchemePanel.tsx`（一级面板）

由 SideMenu "计谋" 按钮打开。`<Modal size="lg">`。

布局：
- **顶部状态栏**：玩家头像 + strategy + diplomacy + 并发数 `active/max`
- **活跃计谋列表**：每行 = icon + 类型名 + 主目标 + （次要目标） + 阶段 `1/3` + 剩余天数 + 模糊成功率徽章
- 点击行 → 打开 `SchemeDetailPanel`

订阅 volatile state：`schemes`、`characters`、`currentDate`。

### 11.2 `SchemeDetailPanel.tsx`（二级 modal，`zIndex={50}`）

显示一个 scheme 的全部细节：
- 标题：类型 + （方法名）
- 参与者卡片：发起人 / primaryTarget /（secondaryTarget）
- 阶段进度条 live 计算
- 模糊成功率（按玩家是发起人还是目标用不同 observer 视角）
- 「取消计谋」按钮：发起人是玩家时显示，移除 instance（无惩罚，v1 简化）

### 11.3 `SchemeInitFlow.tsx`（发起向导，从 InteractionMenu 调起）

多步：
1. 选计谋类型（列出 `getAllSchemeTypes().filter(d => d.canShow(player, primaryCandidate, ctx))`）
2. 拉拢直接确认；离间进入步骤 3
3. 选 secondaryTarget（`getValidSecondaryAlienationTargets(primaryTargetId, ctx)`）
4. 选方法（3 张卡片，显示 baseMultiplier 文案而非数值）
5. 汇总：参与者、方法、预估持续时间、模糊成功率、费用 → 「确认」

订阅 volatile state，调用 `executeInitiateScheme()`，按返回值显示成功 / stale 文案。

### 11.4 `CharacterPanel.tsx` / InteractionMenu

`paramType: 'scheme'` → 打开 `<SchemeInitFlow defaultPrimaryTargetId={target.id} />`。

### 11.5 `SideMenu.tsx`

加一个「🎯 计谋」按钮 + state，渲染 `<SchemePanel>`。

### 11.6 不做的 UI（v1）

- 旧设计稿提到的 `SchemeQuickAccess` 右下角浮窗 → v1 不做，避免 GameLayout 拥挤。SideMenu 入口足够。

## 12. 史书集成

### `chronicleService.ts:CHRONICLE_TYPE_WHITELIST` 新增

```
'发起拉拢', '拉拢成功', '拉拢失败',
'发起离间', '离间成功', '离间失败',
'计谋终止',  // 死亡终止
```

### `chronicleEventContext.ts:EVENT_FIELD_MAP` 新增

每种事件类型给 actor 选适当的字段：
- 发起/成功/失败 → initiator: `mainPost / age / traits / abilities`
- target / secondary → `mainPost / traits`（用现有字段，避免新增 field 类型）

### `chroniclePromptBuilder.ts:formatActorRoles` 新增 case

**注意**：`formatActorRoles` 实际位于 `chroniclePromptBuilder.ts`（不是 chronicleEventContext.ts —— 后者只放 `EVENT_FIELD_MAP` 和字段渲染器）。

按事件类型给角色打标签：「主谋 / 直接目标 / 次要目标」。新增 7 个事件类型的 case。

## 13. 存档集成

### `saveSchema.ts`

```ts
export const SAVE_VERSION = 6;   // 5 → 6：新增 schemes 字段

export interface SaveFile {
  // ... 现有字段
  schemes: SchemeInstance[];     // 必填（migration 后保证存在）
}
```

**SAVE_VERSION 必须自增到 6**（采纳 GPT 建议）。理由：现有项目已经历 v1→v5 共 4 次迁移，migration 管线是首选的兼容机制；用 optional + 兜底是反模式，未来 schemes 字段需要重命名/拆分时会和"旧档无该字段"的边缘混在一起难排查。升版本之后字段类型可以是必填。

### `migrations.ts` 新增 v5 → v6

```ts
if (fromVersion === 5) {
  // v5 → v6：新增 schemes 字段。旧档无活跃计谋，注入空数组即可。
  const migrated: SaveFile = {
    ...save,
    version: 6,
    schemes: (save as unknown as { schemes?: SchemeInstance[] }).schemes ?? [],
  };
  return migrate(migrated, 6);
}
```

### `serialize.ts`

```ts
schemes: Array.from(useSchemeStore.getState().schemes.values()),
```

`SchemeInstance` 全字段 JSON-safe（鉴别联合 + 无函数指针 + 无 Map/Set）。

### `deserialize.ts`

```ts
useSchemeStore.getState().initSchemes(save.schemes);  // migration 已保证非空
```

`initSchemes` 内部重建 `initiatorIndex` / `targetIndex`。

### `saveManager.ts:resetTransientStores`

```ts
useSchemeStore.setState({
  schemes: new Map(),
  initiatorIndex: new Map(),
  targetIndex: new Map(),
});
```

## 14. 文件清单

### 新建（13 个）

| 文件 | 行数估算 |
|------|---------|
| `engine/scheme/types.ts` | 80 |
| `engine/scheme/registry.ts` | 30 |
| `engine/scheme/schemeCalc.ts` | 120 |
| `engine/scheme/SchemeStore.ts` | 130 |
| `engine/scheme/schemeSystem.ts` | 150 |
| `engine/scheme/types/curryFavor.ts` | 150 |
| `engine/scheme/types/alienation.ts` | 220 |
| `engine/scheme/index.ts` | 15 |
| `data/schemes.ts` | 10 |
| `engine/interaction/schemeAction.ts` | 150 |
| `engine/npc/behaviors/curryFavorBehavior.ts` | 80 |
| `engine/npc/behaviors/alienateBehavior.ts` | 120 |
| `ui/components/SchemePanel.tsx` | 150 |
| `ui/components/SchemeDetailPanel.tsx` | 130 |
| `ui/components/SchemeInitFlow.tsx` | 250 |

### 修改（10 个）

| 文件 | 改动 |
|------|------|
| `engine/settlement.ts` | **两处**插入 `runSchemeSystem(date)`：`runDailySettlement` 内 `if (date.day !== 1)` 分支、`runMonthlySettlement` 内 `runCharacterSystem` 之后 `runDailyNpcEngine` 之前 |
| `engine/persistence/saveSchema.ts` | `SAVE_VERSION` 升 6；`SaveFile` 加 `schemes: SchemeInstance[]`（必填） |
| `engine/persistence/migrations.ts` | 新增 v5 → v6 迁移：旧档 schemes 字段缺失时注入空数组 |
| `engine/persistence/serialize.ts` | 序列化 schemes |
| `engine/persistence/deserialize.ts` | `initSchemes(save.schemes)` |
| `engine/persistence/saveManager.ts` | `resetTransientStores` 重置 SchemeStore |
| `engine/interaction/types.ts` | `InteractionParamType` 加 `'scheme'` |
| `engine/interaction/index.ts` | import schemeAction |
| `engine/npc/behaviors/index.ts` | import 两个新 behavior（自注册） |
| `engine/chronicle/chronicleService.ts` | WHITELIST 加 7 个 type 字串 |
| `engine/chronicle/chronicleEventContext.ts` | `EVENT_FIELD_MAP` 加 7 个 event 字段映射 |
| `engine/chronicle/chroniclePromptBuilder.ts` | `formatActorRoles` 加 7 个 case（角色标签：主谋 / 直接目标 / 次要目标） |
| `engine/debugLog.ts` | 加 `'scheme'` category |
| `ui/components/SideMenu.tsx` | 加「计谋」按钮 + state |
| `ui/components/CharacterPanel.tsx` 或 InteractionMenu | `paramType: 'scheme'` 路由 |
| `main.tsx` | `import '@data/schemes'` 触发 self-register |

## 15. 实施批次

### 批次 1：引擎核心骨架（无 UI、无具体类型）

- 13 个文件中：types.ts / registry.ts / schemeCalc.ts / SchemeStore.ts / schemeSystem.ts / index.ts
- settlement（**两个挂载点**）/ saveSchema（升版本 6）/ migrations（v5→v6）/ serialize / deserialize / saveManager / debugLog 修改
- **验证**：
  - `pnpm build` 通过
  - 新建游戏 → 自动续档 → 重载 → 空 schemes Map round-trip
  - 手工构造 v5 旧档（schemes 字段缺失）→ 加载 → migration 注入空数组 → 不报错

### 批次 2：拉拢（basic 通路打通）

- `types/curryFavor.ts` + `data/schemes.ts` + `main.tsx` 注册
- `interaction/schemeAction.ts` + `interaction/types.ts`
- `npc/behaviors/curryFavorBehavior.ts`
- 史书 WHITELIST 加 3 个 type
- 简化 UI：先只做 `SchemeInitFlow` 的拉拢支线 + `SchemePanel` 列表 + SideMenu 入口
- **验证**：玩家发起拉拢、90 天后结算、StoryEvent 通知、好感正确变化、存档 round-trip

### 批次 3：离间（complex 通路 + 多阶段）

- `types/alienation.ts` + 注册
- `npc/behaviors/alienateBehavior.ts`
- 史书 WHITELIST 加 4 个 type
- `SchemeInitFlow` 加离间多步流程（次要目标 + 方法选择）
- `SchemeDetailPanel` 完整版（显示阶段进度、参与者卡片、模糊成功率）
- **验证**：玩家发起离间、3 阶段推进、最终结算、成功率成长正确、失败扣威望、存档 round-trip
- 关键集成测试（白名单第 4 类 - execute 契约）：
  1. 发起离间后死掉 secondaryTarget → 计谋应 'terminated'
  2. 金钱不足时 `executeInitiateScheme` 必须返回 false 且不扣钱
  3. 并发上限达到时 `executeInitiateScheme` 必须返回 false

### 批次 4：NPC 行为权重平衡 + 史书上下文卡片

- 完善 `curryFavorBehavior.npcGenerateTask` 和 `alienateBehavior.npcGenerateTask` 的 weight 公式
- `chronicleEventContext.ts` 加 7 个 event 字段映射 + `formatActorRoles` case
- 手动测试：跑游戏几个月，看 NPC 是否合理频率发动计谋、史书是否正确记录

## 16. 关键约束自检（CLAUDE.md 对齐）

| 约束 | 落实 |
|------|------|
| **execute 契约**：canShow/canExecute 是快照，execute 必须二次校验 | `executeInitiateScheme` 重跑 `canInitiate` + 并发上限 + 资源校验，任一不过返回 false |
| **快照原则** | `SchemeSnapshot` 在 `initInstance` 中冻结所有数值 |
| **史书 emit 纪律** | 启动/成功/失败均 emit；7 个 type 加入 WHITELIST；NPC 行为通过 executeInitiateScheme 走统一 emit 路径，不重复 |
| **StoryEvent 数据化** | 通知型用 `effectKey: 'noop:notification'` + 空 effectData，符合纯通知契约 |
| **存档 round-trip** | SchemeInstance 全字段 JSON-safe，索引重建；写白名单第 1 类集成测试 |
| **层级隔离** | engine/scheme 不 import @ui；玩家通知走 storyEventBus |
| **不引入新依赖** | ✅ |
| **NPC 快照原则** | generate 阶段只用 npcCtx；executeAsNpc 内部允许调 store mutation |
| **debugLog** | 新增 `'scheme'` category |
| **死亡接续** | scheme 不跟随继承人转移（个人契约语义同 alliance）；characterSystem 死亡处理无需特殊扩展，schemeSystem 自己检测死亡终止 |

## 17. 不在本 plan 范围内的明确边界

- ❌ 谋主全局委任 UI 和数据结构
- ❌ 代理人邀请系统（仅预留 `agents?` 字段）
- ❌ 隐秘度 / 暴露 / breach 系统
- ❌ 反制机制
- ❌ 阶段切换的 critical moment 事件
- ❌ 玩家「取消计谋」的费用退还策略（v1 直接 remove，无任何代价/退款）
- ❌ 第 3+ 个计谋类型（伪造把柄、绑架、刺杀等）

这些都是 v1.1 / v2 的扩展位，本 plan 文件结构和 SchemeTypeDef 接口已经完整支持新增。

## 18. 验证矩阵

| 项 | 验证手段 |
|----|---------|
| 编译 | `pnpm build` |
| 现有测试不破 | `npx vitest run` |
| 拉拢 happy path | 手动：发起 → 90 天 → StoryEvent → 好感变化 |
| 离间 happy path | 手动：发起 → 阶段推进 → 成功率成长 → 结算 |
| stale 契约 | vitest 集成测试（白名单第 4 类） |
| 存档 round-trip | vitest 集成测试（白名单第 1 类） |
| 死亡终止 | 手动：发起后 kill secondaryTarget → 'terminated' + StoryEvent |
| 并发上限 | 手动：玩家 strategy=8 → 上限 1，第二次发起被拒 |
| NPC 自动发起 | 手动跑 6 个月，观察 chronicle 中 NPC 计谋频率 |
| 玩家通知 | 手动：被 NPC 离间 → 结算时 StoryEvent 弹出 |
