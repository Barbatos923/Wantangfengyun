# 计谋系统（Scheme System）实现方案

## Context
第六阶段三大系统之一。角色可对其他角色发动持续性计谋，经过一段时间后结算成功/失败。首个计谋类型：离间。系统包含谋主机制、同谋、多种方法、模糊成功率显示。

---

## 批次一：引擎核心（类型 + Store + 定义 + 计算 + 日结 + 存档）

### 新建文件

#### 1. `src/data/schemes.ts` — 静态计谋类型定义

```typescript
interface SchemeMethodDef {
  id: string;
  name: string;           // '散布谣言' / '伪造书信' / '收买侍从'
  description: string;    // 叙事文本（供史书）
  baseMultiplier: number; // 名义乘算中心值 0.8~1.2
}

interface AccompliceSlotDef {
  role: string;           // '谋士' / '内应'
  strategyWeight: number; // 同谋谋略加成权重（如 0.3 / 0.2）
}

interface SchemeTypeDef {
  id: string;             // 'alienation'
  name: string;           // '离间'
  icon: string;
  description: string;
  baseDurationDays: number;   // 60
  baseSuccessRate: number;    // 50
  costSource: 'private' | 'treasury'; // 费用来源
  costMoney: number;          // 花费金钱
  methods: SchemeMethodDef[];
  accompliceSlots: [AccompliceSlotDef, AccompliceSlotDef];
  roles: [string, string, string, string, string]; // 5个角色槽位名
}
```

首个定义：离间（alienation），3种方法，base 50%，60天，私产花费。
导出 `ALL_SCHEME_TYPES` 数组 + `schemeTypeMap` Map。

#### 2. `src/engine/scheme/types.ts` — 运行时类型

```typescript
interface SchemeParticipant {
  characterId: string;
  role: string;
  snapshotStrategy: number; // 发起时快照的有效谋略值
}

interface SchemeInstance {
  id: string;
  schemeTypeId: string;
  methodId: string;
  participants: [SchemeParticipant, SchemeParticipant, SchemeParticipant, SchemeParticipant, SchemeParticipant];
  // [0]=发起人 [1]=直接目标 [2]=次要目标 [3]=同谋1 [4]=同谋2
  spymasterId: string;
  spymasterStrategy: number;        // 快照
  targetSpymasterId: string;
  targetSpymasterStrategy: number;  // 快照
  startDate: GameDate;
  resolveDate: GameDate;
  successRate: number;              // 0-100，快照
  methodMultiplier: number;         // 快照
  status: 'active' | 'success' | 'failure' | 'terminated';
  initiatorId: string;              // === participants[0].characterId
}
```

#### 3. `src/engine/scheme/schemeCalc.ts` — 纯计算函数

所有函数**纯函数**，不读 Store。

**并发上限**：
```
calcSchemeLimit(spymasterStrategy) = max(1, floor(strategy / 8))
```

**持续时间**：
```
abilityDiff = 我方谋主strategy - 对方谋主strategy
durationMod = clamp(1.0 - abilityDiff * 0.02, 0.5, 2.0)
finalDays = round(baseDurationDays * durationMod)
```
（差值+10 → 0.8倍更快；差值-10 → 1.2倍更慢）

**方法合理性乘算**：
```typescript
function calcMethodMultiplier(
  method: SchemeMethodDef,
  targetPersonality: Personality,
  opinionAtoB: number,          // 目标A对目标B的好感
  initiatorOpinionFromTarget: number,
  spymasterStrategy: number,
  sameRealm: boolean,
): number {
  let mult = method.baseMultiplier;
  mult -= targetPersonality.rationality * 0.05; // 理性降低被骗概率
  if (opinionAtoB < 0) mult += 0.05;           // 已有嫌隙→更容易
  if (opinionAtoB < -20) mult += 0.05;
  if (initiatorOpinionFromTarget === 0) mult += 0.03; // 陌生人更难防
  mult += (spymasterStrategy - 15) * 0.005;
  if (sameRealm) mult += 0.05;                 // 同势力更容易制造摩擦
  return clamp(mult, 0.5, 1.5);
}
```

**成功率**：
```
baseRate = schemeType.baseSuccessRate
abilityBonus = (我方谋主strategy - 对方谋主strategy) * 1.5
accompliceBonus = Σ(同谋i.snapshotStrategy × slotDef.strategyWeight)
methodBonus = (methodMultiplier - 1.0) * 50
successRate = clamp(baseRate + abilityBonus + accompliceBonus + methodBonus, 5, 95)
```

**模糊显示**（UI 用）：
```
diff = 玩家谋主strategy - 目标谋主strategy
diff ≥ 12 → 精确百分比
diff 6~11 → 高/中/低（≥70高，40~69中，<40低）
diff 0~5 → 偏高/偏低（≥50偏高）
diff < 0 → 未知
```

**验证函数**：
- `canInitiateScheme(...)` — 检查存活、并发上限、费用、目标有效性
- `getValidSecondaryTargets(directTargetId, characters)` — 离间：与目标有关系的角色（overlord-vassal / 家族 / 同势力）
- `getValidAccomplices(initiatorId, excludeIds, characters)` — 发起人的直属臣属/家族中排除已参与者
- `resolveSpymaster(charId, spymasters, characters)` — 返回谋主角色（map中无则返回自身）

#### 4. `src/engine/scheme/SchemeStore.ts` — Zustand Store

```typescript
interface SchemeStoreState {
  schemes: Map<string, SchemeInstance>;
  initiatorIndex: Map<string, Set<string>>;  // initiatorId → schemeIds
  spymasters: Map<string, string>;           // charId → spymasterId（缺省=自身）

  addScheme: (scheme: SchemeInstance) => void;
  updateSchemeStatus: (id: string, status: SchemeInstance['status']) => void;
  setSpymaster: (charId: string, spymasterId: string) => void;
  removeSpymaster: (charId: string) => void;  // 重置为自身
  getActiveSchemesByInitiator: (charId: string) => SchemeInstance[];
  getActiveSchemeCount: (charId: string) => number;

  // 反序列化
  initSchemes: (schemes: SchemeInstance[], spymasters: [string, string][]) => void;
}
```

谋主存在 SchemeStore.spymasters 而非 Character 上，避免修改 Character 类型。

#### 5. `src/engine/scheme/schemeSystem.ts` — 日结系统

```typescript
export function runSchemeSystem(date: GameDate): void
```

每日遍历活跃计谋：
1. **死亡检查**：任意5参与者死亡 → status='terminated'
2. **到期结算**：resolveDate ≤ today → `random() * 100 < successRate` 判定
3. 成功：调用 `applySchemeSuccess(scheme)` —— 离间：双向 addOpinion decayable -20~-30
4. 失败：调用 `applySchemeFailure(scheme)` —— 离间：目标A对发起人 addOpinion -10
5. 若目标是玩家 → pushStoryEvent 通知（纯通知，effectKey='noop:notification'）
6. emitChronicleEvent（见批次二）

#### 6. `src/engine/scheme/index.ts` — 桶导出

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/engine/settlement.ts` | `runDailySettlement` 中 `runWarSystem` 之后、`runDailyNpcEngine` 之前插入 `runSchemeSystem(date)` |
| `src/engine/systems/index.ts` | 加 `export { runSchemeSystem } from '../scheme/schemeSystem'` |
| `src/engine/persistence/saveSchema.ts` | SaveFile 加 `schemes?: SchemeInstance[]` + `spymasters?: [string, string][]`（可选，向后兼容） |
| `src/engine/persistence/serialize.ts` | 序列化 SchemeStore：`schemes: Array.from(schemeStore.schemes.values())`, `spymasters: Array.from(schemeStore.spymasters.entries())` |
| `src/engine/persistence/deserialize.ts` | `useSchemeStore.getState().initSchemes(save.schemes ?? [], save.spymasters ?? [])` |
| `src/engine/persistence/saveManager.ts` | `resetTransientStores` 加 `useSchemeStore.setState({ schemes: new Map(), initiatorIndex: new Map(), spymasters: new Map() })` |

---

## 批次二：交互 + NPC行为 + StoryEvent + 史书

### 新建文件

#### 1. `src/engine/interaction/schemeAction.ts` — 玩家发起计谋的交互

注册 Interaction：
```typescript
{
  id: 'scheme',
  name: '计谋',
  icon: '🎯',
  canShow: (player, target) => target.alive && player.id !== target.id,
  canExecuteCheck: (player, target) => {
    // 检查并发上限
    const limit = calcSchemeLimit(spymasterStrategy);
    const active = store.getActiveSchemeCount(player.id);
    if (active >= limit) return `谋主策力有限（${active}/${limit}）`;
    return null;
  },
  paramType: 'scheme',  // 新增类型
}
```

导出执行函数：
```typescript
export function executeInitiateScheme(
  initiatorId: string, schemeTypeId: string, methodId: string,
  directTargetId: string, secondaryTargetId: string,
  accomplice1Id: string, accomplice2Id: string,
): boolean  // false = stale
```

执行逻辑：
1. 重跑合法性（存活、并发、费用、目标有效）
2. 快照所有参与者谋略值、双方谋主谋略
3. 计算 methodMultiplier、successRate、resolveDate
4. 扣费（私产或国库）
5. addScheme 到 SchemeStore
6. emitChronicleEvent type='发起计谋'
7. 返回 true

#### 2. `src/engine/npc/behaviors/schemeBehavior.ts` — NPC自主发动计谋

```typescript
const schemeBehavior: NpcBehavior<SchemeNpcData> = {
  id: 'scheme',
  playerMode: 'skip',         // NPC自主，玩家走交互菜单
  schedule: 'monthly-slot',   // 低频
  generateTask(actor, ctx) { ... },
  executeAsNpc(actor, data, ctx) { ... },
}
```

NPC 目标选择：
- 扫描有负面好感的角色，找到其有关系的次要目标
- 自动选谋略最高的2个臣属/家族成员作同谋
- 随机加权选方法
- Weight：base 20，vengefulness * 15，boldness * 8，-rationality * 10，chance > 50 → +10

#### 3. `src/engine/scheme/spymasterUtils.ts` — 谋主工具函数

```typescript
// NPC自动选谋主：直属臣属中谋略最高者
export function autoSelectSpymaster(charId: string, characters, vassalIndex): string

// 获取谋主（查 spymasters map，缺省返回自身）
export function resolveSpymaster(charId: string, spymasters, characters): Character
```

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/engine/interaction/types.ts` | InteractionParamType 联合类型加 `'scheme'` |
| `src/engine/interaction/index.ts` | import schemeAction |
| `src/engine/npc/NpcEngine.ts` | import schemeBehavior 触发注册 |
| `src/engine/storyEffectResolver.ts` | 无需新增 case（通知型用 `noop:notification`） |
| `src/engine/chronicle/chronicleService.ts` | CHRONICLE_TYPE_WHITELIST 加 `'发起计谋'` / `'计谋成功'` / `'计谋失败'` |
| `src/engine/chronicle/chronicleEventContext.ts` | EVENT_FIELD_MAP 加三个事件类型的字段映射 |
| `src/engine/debugLog.ts` | 加 `'scheme'` category |

---

## 批次三：UI

### 新建文件

#### 1. `src/ui/components/SchemePanel.tsx` — 一级弹窗（计谋总览）

从 SideMenu "计谋" 按钮打开。`<Modal size="lg">`。

布局：
- **顶部**：谋主卡片 — 头像/姓名/谋略值/好感度 + "更换谋主"按钮 + 并发数 `active/max`
- **列表区**：当前所有活跃计谋，每行：类型icon + 名称 + 目标 + 方法 + 剩余天数 + 模糊成功率
- 点击行 → 打开 SchemeDetailPanel

#### 2. `src/ui/components/SchemeDetailPanel.tsx` — 二级弹窗（计谋详情）

`<Modal size="md" zIndex={50}>`（高于一级弹窗）。

布局：
- 计谋类型 + 方法名 header
- 5个参与者卡片（姓名、角色、快照谋略值）
- 方法描述文本
- 模糊成功率显示
- 剩余天数进度条（live 计算 resolveDate - currentDate）
- "取消计谋" 按钮（移除计谋，无惩罚）

#### 3. `src/ui/components/SchemeInitFlow.tsx` — 发起计谋配置流程

从交互菜单选择"计谋"后打开。多步向导：

1. **选计谋类型**：列出 ALL_SCHEME_TYPES
2. **选次要目标**：`getValidSecondaryTargets` 过滤后列表
3. **选方法**：3种方法，显示名称+描述+模糊乘算指示
4. **选同谋**：2个槽位，从 `getValidAccomplices` 中选
5. **确认**：汇总所有参与者+方法+预估持续时间+模糊成功率 → "确认"调 `executeInitiateScheme`

订阅 volatile state（characters/territories/currentDate），按 CLAUDE.md execute 契约。

#### 4. `src/ui/components/SchemeQuickAccess.tsx` — 右下角快捷入口

定位于 GameLayout 地图区域内，WarOverlay 左侧（`right-32 bottom-4`）。

每个活跃计谋一个小按钮（icon），点击直接打开 SchemeDetailPanel。无活跃计谋时不渲染。

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/ui/components/SideMenu.tsx` | 加 `showSchemePanel` state + handleClick 分支 + 渲染 `<SchemePanel>` |
| `src/ui/layouts/GameLayout.tsx` | 在 WarOverlay 旁加 `<SchemeQuickAccess />` overlay |
| `src/ui/components/CharacterPanel.tsx`（或 InteractionMenu） | 处理 `paramType: 'scheme'` → 打开 SchemeInitFlow（传入 directTarget） |

---

## 关键设计约束汇总

1. **快照原则**：发起时锁定所有数值（谋略、成功率、持续时间），更换谋主不影响进行中计谋
2. **只有死亡终止**：被废/转移势力不终止计谋
3. **无发现机制**：不需要考虑暴露/反制，NPC 对玩家的计谋在结算时直接 StoryEvent 通知
4. **离间目标**：任意两个有关系的角色，发起人与目标无关系限制
5. **并发上限**：`floor(谋主strategy / 8)`，最少 1
6. **NPC 谋主自动选**：直属臣属中谋略最高者
7. **费用**：离间从私产扣；不同计谋类型可配置不同来源
8. **史书**：发起 + 成功/失败均 emit，priority Normal，加入 WHITELIST

## 验证计划

1. `pnpm build` 编译通过
2. 手动测试：
   - 发起离间计谋（选目标、选方法、选同谋）→ SchemePanel 显示活跃计谋
   - 快进到结算日 → 弹出结算通知 / 好感变化正确
   - 更换谋主 → 进行中计谋不受影响
   - 并发上限生效
   - 存档 → 读档 → 计谋状态恢复正确
   - 目标死亡 → 计谋终止
   - 右下角快捷按钮显示/点击
3. `npx vitest run` 现有测试不破
