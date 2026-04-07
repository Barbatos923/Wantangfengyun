# 国库提案系统设计文档

> **状态**：待实现
> **作者**：基于 2026-04-08 与项目作者的讨论
> **核心目标**：让 NPC 能自主调度领地间的金钱粮草，并通过"草拟人 → 批准人"模式给副岗/京官增加叙事性玩法
> **架构参考**：1:1 复用调兵系统 (`deployDraftBehavior` / `deployApproveBehavior` / `DeployApproveFlow`)

---

## 一、设计动机

1. **NPC 自主性**：当前 NPC 不会主动平衡治下国库，导致某些州赤字、某些州冗余。
2. **玩家减负**：玩家扮演节度使/皇帝时不应被迫每月手动微调每个州的金钱粮草，应该聚焦角色关系。
3. **副岗增戏**：三司使、节度判官、国长史、录事参军等副岗目前几乎只是装饰岗位。让它们承担"为 ruler 草拟财政方案"的职能后：
   - 玩家扮演 ruler → 看判官递的条子，一键批准/驳回
   - 玩家扮演副岗 → 主动布局（如雄心勃勃的判官早早把粮草调到边境，游说节度使开战）
   - NPC 之间产生微观叙事："节度判官递了一份转粮提案，理由是支援西北防线"

## 二、为什么用草拟+审批模式（而非单角色 behavior）

- 单角色方案技术上可行，但完全无法实现"副岗增戏"和"减负"两个核心目标。
- 草拟+审批模式与项目已有的调兵双行为、宰相提案审批同属一个 design pattern（参考 `feedback_approve_pattern.md`）。

## 三、岗位映射（4 级）

完全对齐调兵的 4 级 drafter 结构：

| 层级 | 草拟人岗位 | template id | 批准方 | 实际产出 |
|---|---|---|---|---|
| 天下 | 三司使 | `pos-sansi-shi` | 皇帝 (`pos-emperor`) | 高 |
| 国 | 国长史 | `pos-guo-changshi` | 行台尚书令 (`pos-xingtai-shangshu`) / 王 (`pos-wang`) | 中 |
| 道 | 节度判官 | `pos-panguan` | 节度使 (`pos-jiedushi`) / 观察使 (`pos-guancha-shi`) | 高 |
| 州 | 录事参军 | `pos-lushibcanjun` | 刺史 (`pos-cishi`) / 防御使 (`pos-fangyu-shi`) | 极低（多数刺史只1州，引擎自然过滤） |

**只用三司使，不接户部尚书**——晚唐三司是事实上的财政掌门，户部尚书在新系统里不参与草拟，让两者职能历史性分化。

**州一级保留**：`canTransferTreasury` 要求源≠目，刺史只控1州时算法自然返回空数组，零额外特殊处理。这样未来"双州刺史/权知数州事"剧本能直接受益。

## 四、与调兵的岗位独立性

- 都知兵马使 (`pos-duzhibingmashi`) 管兵 ↔ 节度判官 (`pos-panguan`) 管钱粮
- 兵部尚书 (`pos-bingbu-shangshu`) 管兵 ↔ 三司使 (`pos-sansi-shi`) 管钱粮
- 国司马 (`pos-guo-sima`) 管兵 ↔ 国长史 (`pos-guo-changshi`) 管钱粮
- 录事参军 (`pos-lushibcanjun`) 在调兵和国库中都是州级 drafter，但 entries 数据结构不同，互不冲突

## 五、文件清单

```
src/engine/treasury/
  └─ treasuryCalc.ts                    [新建] 纯函数层：评估 + 方案生成 + drafter 解析

src/engine/npc/NpcStore.ts                [扩展] 加 treasuryDrafts / treasuryRejectCooldowns

src/engine/npc/behaviors/
  ├─ treasuryProposalDraftBehavior.ts   [新建] 草拟方
  └─ treasuryProposalApproveBehavior.ts [新建] 批准方

src/engine/npc/types.ts                   [扩展] 加 PlayerTask type 'treasury-approve'

src/ui/components/
  └─ TreasuryApproveFlow.tsx            [新建] 玩家审批弹窗（参考 DeployApproveFlow）

src/ui/components/AlertBar.tsx            [扩展] 加 treasury-approve 任务铃铛

src/__tests__/
  └─ treasuryCalc.test.ts               [新建] 纯函数测试
```

---

## 六、`treasuryCalc.ts` 详细设计

### 6.1 类型

```ts
/** 单条转移条目 */
export interface TreasuryTransferEntry {
  fromZhouId: string;
  toZhouId: string;
  money: number;
  grain: number;
  reason: TreasuryTransferReason;
  drafterId: string;  // 用于 UI 显示"由谁草拟"
}

export type TreasuryTransferReason =
  | 'frontline'         // 前线: 充实前线粮草，应对边境威胁
  | 'capital-shortage'  // 治所: 治所国库不足，补血以应付日常支出
  | 'rebalance';        // 平衡: 州间余额失衡，调拨保持储备
  // 'famine-relief' 暂不实现，留 reason 类型扩展位

/** 州的需求评估结果 */
interface ZhouNeedAssessment {
  zhouId: string;
  type: 'frontline' | 'capital' | 'normal';
  currentMoney: number;
  currentGrain: number;
  targetMoney: number;
  targetGrain: number;
  moneyDelta: number;   // 正=盈余，负=赤字
  grainDelta: number;
}
```

### 6.2 阈值常量（可全部调整）

```ts
const TARGET_MONEY = {
  frontline: 20000,
  capital: 20000,
  normal: 5000,
};
const TARGET_GRAIN = {
  frontline: 30000,
  capital: 10000,
  normal: 5000,
};
/** 余额超过目标的 1.5 倍才算"盈余可转出" */
const SURPLUS_RATIO = 1.5;
/** 一份草案最多 N 条 entries，避免决策疲劳 */
const MAX_ENTRIES_PER_PROPOSAL = 3;
/** 边境威胁阈值（复用 assessBorderThreats 的输出） */
const FRONTLINE_THREAT_THRESHOLD = 30;
```

### 6.3 核心函数

```ts
/**
 * 解析草拟者 → 找出他为哪个 ruler 草拟
 * 完全照抄 resolveDeployDrafter 结构，把 set 换掉
 */
const DRAFTER_TEMPLATE_IDS = new Set([
  'pos-sansi-shi',        // 三司使 → 皇帝
  'pos-guo-changshi',     // 国长史 → 行台尚书令/王
  'pos-panguan',          // 节度判官 → 节度使/观察使
  'pos-lushibcanjun',     // 录事参军 → 刺史/防御使
]);

export function resolveTreasuryDrafter(
  actorId: string,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): { rulerId: string } | null {
  // 1. 检查中央岗位（三司使 → 皇帝）
  // 2. 遍历领地岗位匹配 set，返回 getController(t)
  // 实现照抄 deployCalc.ts:282-315
}

/**
 * 评估 ruler 治下所有州的财政需求
 * - 用 buildZhouAdjacency() 复用调兵的邻接缓存
 * - 用 assessBorderThreats() 判定哪些州属于"前线"
 * - 治所州 = ruler.capital
 * - 其余 = normal
 */
export function assessTreasuryNeeds(
  rulerId: string,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  getOpinion: (a: string, b: string) => number,
): ZhouNeedAssessment[] {
  // 1. 拿 ruler 的 capital
  // 2. 复用 assessBorderThreats 算前线州集合（threatLevel >= 30）
  // 3. getRulerZhou(rulerId) 拿所有州
  // 4. 对每州分类 + 计算 delta
}

/**
 * 生成转移方案：贪心匹配最大盈余 → 最大赤字
 */
export function planTreasuryTransfers(
  rulerId: string,
  drafterId: string,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  getOpinion: (a: string, b: string) => number,
  personality: Personality,
): TreasuryTransferEntry[] {
  const needs = assessTreasuryNeeds(rulerId, territories, characters, getOpinion);

  // 分类
  const surpluses = needs.filter(n =>
    n.currentMoney > n.targetMoney * SURPLUS_RATIO ||
    n.currentGrain > n.targetGrain * SURPLUS_RATIO
  );
  const deficits = needs.filter(n => n.moneyDelta < 0 || n.grainDelta < 0);

  if (surpluses.length === 0 || deficits.length === 0) return [];

  // 优先级排序：
  // - deficits: 前线 > 治所 > normal，同类按缺口大小
  // - surpluses: normal > 治所 > 前线（前线尽量留），同类按盈余大小
  const deficitPriority = (n: ZhouNeedAssessment) => {
    if (n.type === 'frontline') return 0;
    if (n.type === 'capital') return 1;
    return 2;
  };
  const surplusPriority = (n: ZhouNeedAssessment) => {
    if (n.type === 'normal') return 0;
    if (n.type === 'capital') return 1;
    return 2;  // frontline 最后才动
  };

  deficits.sort((a, b) => deficitPriority(a) - deficitPriority(b));
  surpluses.sort((a, b) => surplusPriority(a) - surplusPriority(b));

  const entries: TreasuryTransferEntry[] = [];

  // 贪心匹配
  for (const deficit of deficits) {
    if (entries.length >= MAX_ENTRIES_PER_PROPOSAL) break;

    for (const surplus of surpluses) {
      if (surplus.zhouId === deficit.zhouId) continue;

      // 算可转移金额
      const surplusMoney = Math.max(0, surplus.currentMoney - surplus.targetMoney);
      const surplusGrain = Math.max(0, surplus.currentGrain - surplus.targetGrain);
      const needMoney = Math.max(0, -deficit.moneyDelta);
      const needGrain = Math.max(0, -deficit.grainDelta);

      const moveMoney = Math.min(surplusMoney, needMoney);
      const moveGrain = Math.min(surplusGrain, needGrain);

      // boldness 影响实际转移比例：胆大的判官转更多
      const ratio = 0.5 + personality.boldness * 0.3;  // 0.5 ~ 0.8
      const finalMoney = Math.floor(moveMoney * ratio);
      const finalGrain = Math.floor(moveGrain * ratio);

      // 太小的转移不值得
      if (finalMoney < 1000 && finalGrain < 1000) continue;

      const reason: TreasuryTransferReason =
        deficit.type === 'frontline' ? 'frontline'
        : deficit.type === 'capital' ? 'capital-shortage'
        : 'rebalance';

      entries.push({
        fromZhouId: surplus.zhouId,
        toZhouId: deficit.zhouId,
        money: finalMoney,
        grain: finalGrain,
        reason,
        drafterId,
      });

      // 这个 surplus 已被消耗
      surplus.currentMoney -= finalMoney;
      surplus.currentGrain -= finalGrain;
      break;  // 一个赤字只匹配一个盈余，避免分散
    }
  }

  return entries;
}
```

### 6.4 测试要点（按 CLAUDE.md "测纯函数 + 具体期望数值"原则）

- `resolveTreasuryDrafter`: 给定持有特定岗位的 actor，返回正确的 ruler
- `assessTreasuryNeeds`: 已知威胁的州被标 frontline，capital 字段对的州被标 capital
- `planTreasuryTransfers`: 构造盈余州 60000 + 赤字州 -20000 的场景，验证生成 1 条 entry，金额按 boldness 0.5 → 0.65 × min(40000, 20000) = 13000

---

## 七、`NpcStore.ts` 扩展

```ts
// 加在现有 deploymentDrafts / deployRejectCooldowns 旁边

/** 国库提案缓冲区: rulerId → 待批方案 */
treasuryDrafts: Map<string, TreasuryTransferEntry[]>;
addTreasuryDraft: (rulerId: string, entries: TreasuryTransferEntry[]) => void;
clearTreasuryDraft: (rulerId: string) => void;

/** 国库驳回冷却: rulerId → 冷却截止日 */
treasuryRejectCooldowns: Map<string, GameDate>;
setTreasuryRejectCooldown: (rulerId: string, until: GameDate) => void;
isTreasuryCooldown: (rulerId: string, now: GameDate) => boolean;
```

实现完全照抄 `addDeploymentDraft` / `clearDeploymentDraft` / `setDeployRejectCooldown` / `isDeployCooldown`：
- `addTreasuryDraft` 用追加语义 `[...existing, ...entries]`（纵深防御）
- `clearTreasuryDraft` 直接删除
- 冷却用 `isDateReached` 判断

---

## 八、两个 Behavior

### 8.1 `treasuryProposalDraftBehavior`

照抄 `deployDraftBehavior` 结构，关键字段：

```ts
{
  id: 'treasury-proposal-draft',
  playerMode: 'standing',     // 玩家走常驻面板
  schedule: 'monthly-slot',   // 哈希槽位 + 品级分档

  generateTask(actor, ctx) {
    if (!actor.alive) return null;

    const result = resolveTreasuryDrafter(actor.id, ctx.territories, ctx.centralPosts);
    if (!result) return null;
    const { rulerId } = result;

    // 驳回冷却
    if (useNpcStore.getState().isTreasuryCooldown(rulerId, ctx.date)) return null;

    // 已有未批草案
    const existing = useNpcStore.getState().treasuryDrafts.get(rulerId);
    if (existing && existing.length > 0) return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    // 玩家路径：standing
    if (actor.id === ctx.playerId) {
      const entries = planTreasuryTransfers(
        rulerId, actor.id,
        ctx.territories, ctx.characters, ctx.getOpinion,
        personality,
      );
      return { data: { entries, rulerId }, weight: 100 };
    }

    // NPC 路径
    const entries = planTreasuryTransfers(
      rulerId, actor.id,
      ctx.territories, ctx.characters, ctx.getOpinion,
      personality,
    );
    if (entries.length === 0) return null;

    // 权重：基础 + 紧迫度 + 理性
    const maxDeficit = computeMaxDeficitMagnitude(entries);  // 辅助函数
    const modifiers: WeightModifier[] = [
      { label: '基础', add: 20 },
      { label: '财政紧迫', add: Math.min(50, maxDeficit / 1000) },
      { label: '理性', add: personality.rationality * 15 },
    ];
    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    return { data: { entries, rulerId }, weight };
  },

  executeAsNpc(actor, data, ctx) {
    useNpcStore.getState().addTreasuryDraft(data.rulerId, data.entries);
  },

  generatePlayerTask(actor, data, ctx) {
    return {
      id: crypto.randomUUID(),
      type: 'treasury-proposal-draft',
      actorId: actor.id,
      data: { entries: data.entries, rulerId: data.rulerId },
      deadline: addDays(ctx.date, 9999),
      standing: true,
    };
  },
}
```

**重要约束（来自 backlog_npc_snapshot_cleanup.md）**：从 ctx 读快照，不要直读 store。`ctx.territories` / `ctx.characters` / `ctx.centralPosts` / `ctx.getOpinion` / `ctx.personalityCache` 都已经是快照。

### 8.2 `treasuryProposalApproveBehavior`

照抄 `deployApproveBehavior`：

```ts
{
  id: 'treasury-proposal-approve',
  playerMode: 'push-task',
  schedule: 'daily',

  generateTask(actor, _ctx) {
    if (!actor.isRuler || !actor.alive) return null;
    const draft = useNpcStore.getState().treasuryDrafts.get(actor.id);
    if (!draft || draft.length === 0) return null;

    // 玩家任务去重
    const hasExisting = useNpcStore.getState().playerTasks.some(
      t => t.type === 'treasury-approve' && t.actorId === actor.id,
    );
    if (hasExisting) return null;

    return {
      data: { entries: draft },
      weight: 100,
      forced: true,  // 行政职责，不受 maxActions 限制
    };
  },

  executeAsNpc(actor, data, _ctx) {
    // NPC 无条件批准
    for (const entry of data.entries) {
      // executeTransferTreasury 内部会再跑 canTransferTreasury，
      // 失败则静默跳过（容错）
      executeTransferTreasury(actor.id, entry.fromZhouId, entry.toZhouId, {
        money: entry.money,
        grain: entry.grain,
      });
    }
    useNpcStore.getState().clearTreasuryDraft(actor.id);
  },

  generatePlayerTask(actor, data, ctx) {
    useNpcStore.getState().clearTreasuryDraft(actor.id);
    return {
      id: crypto.randomUUID(),
      type: 'treasury-approve',
      actorId: actor.id,
      data: { entries: data.entries },
      deadline: addDays(ctx.date, 30),
    };
  },
}
```

---

## 九、`TreasuryApproveFlow.tsx` UI

### 9.1 整体结构（参考 DeployApproveFlow，砍掉地图选点相关代码）

```
Modal(lg) + ModalHeader("国库审批 — YY年MM月")
├─ task = playerTasks.find(type === 'treasury-approve')
├─ 本地副本 entries: TreasuryTransferEntry[]
├─ useEffect 初始化 + 失效过滤 + 降额保留
├─ 列表渲染每条:
│   ├─ 第一行: [reason 标签] 草拟者名 · 来源州 → 目的州  ★已修改
│   ├─ 第二行: 钱 [input step=10000] 全  粮 [input] 全  [删除]
│   └─ 第三行(小字): 余额: 钱X 粮Y
├─ ★折叠区 "新建运输方案"
│   └─ 复用 InlineTreasuryTransferRow（金钱+粮草两行）
└─ 底部:
    ├─ [驳回全部] → setTreasuryRejectCooldown(180天) + clearTreasuryDraft + removeTask
    └─ [批准 N 项] → 循环 executeTransferTreasury + removeTask
```

### 9.2 失效过滤逻辑

```ts
useEffect(() => {
  if (!task) return;
  const raw = (task.data as { entries: TreasuryTransferEntry[] }).entries;
  const valid = raw.flatMap(e => {
    const check = canTransferTreasury(actorId, e.fromZhouId, e.toZhouId, {
      money: e.money, grain: e.grain,
    });
    if (check.ok) return [e];

    // 余额不足时尝试降额保留
    const fromT = territories.get(e.fromZhouId);
    const safeMoney = Math.min(e.money, Math.max(0, Math.floor(fromT?.treasury?.money ?? 0)));
    const safeGrain = Math.min(e.grain, Math.max(0, Math.floor(fromT?.treasury?.grain ?? 0)));
    if (safeMoney <= 0 && safeGrain <= 0) return [];

    const recheck = canTransferTreasury(actorId, e.fromZhouId, e.toZhouId, {
      money: safeMoney, grain: safeGrain,
    });
    if (!recheck.ok) return [];

    return [{ ...e, money: safeMoney, grain: safeGrain }];
  });

  // 标记降额条目为 isEdited
  const editedSet = new Set<number>();
  valid.forEach((v, i) => {
    const orig = raw[i];
    if (v.money !== orig?.money || v.grain !== orig?.grain) editedSet.add(i);
  });
  setEntries(valid);
  setEditedIndices(editedSet);
}, [task]);
```

### 9.3 reason 标签映射

```ts
const REASON_LABEL: Record<TreasuryTransferReason, string> = {
  'frontline': '前线',
  'capital-shortage': '治所',
  'rebalance': '平衡',
};
const REASON_COLOR: Record<TreasuryTransferReason, string> = {
  'frontline': 'var(--color-accent-red)',
  'capital-shortage': 'var(--color-accent-gold)',
  'rebalance': 'var(--color-text-muted)',
};
const REASON_TOOLTIP: Record<TreasuryTransferReason, string> = {
  'frontline': '充实前线粮草，应对边境威胁',
  'capital-shortage': '治所国库不足，需补血以应付日常支出',
  'rebalance': '州间余额失衡，调拨以保持储备',
};
```

### 9.4 草拟者显示

```tsx
const drafter = characters.get(entry.drafterId);
const drafterPosts = getHeldPosts(entry.drafterId);
const drafterPostName = drafterPosts.find(p =>
  ['pos-sansi-shi','pos-guo-changshi','pos-panguan','pos-lushibcanjun'].includes(p.templateId)
)?.templateId;
const drafterPostLabel = positionMap.get(drafterPostName ?? '')?.name ?? '';
// 显示: "{drafterPostLabel} {drafter?.name}"
```

### 9.5 ★ 新建方案折叠区（用户特别要求）

```tsx
const [showNewProposal, setShowNewProposal] = useState(false);

<button onClick={() => setShowNewProposal(s => !s)}>
  {showNewProposal ? '▼' : '▶'} 新建运输方案
</button>
{showNewProposal && playerId && (
  <div className="border-t pt-2">
    <InlineTreasuryTransferRow charId={playerId} resource="money" />
    <InlineTreasuryTransferRow charId={playerId} resource="grain" />
  </div>
)}
```

**注意**：`InlineTreasuryTransferRow` 已存在，是上次会话做的，直接复用。它的"运输"按钮调用 `executeTransferTreasury` 即时生效——这正好满足"驳回之后按自己想法立刻执行"的需求。

### 9.6 批准/驳回处理

```ts
function handleApprove() {
  for (const entry of entries) {
    executeTransferTreasury(actorId, entry.fromZhouId, entry.toZhouId, {
      money: entry.money, grain: entry.grain,
    });
  }
  useNpcStore.getState().removePlayerTask(task.id);
  onClose();
}

function handleReject() {
  const now = useTurnManager.getState().currentDate;
  useNpcStore.getState().setTreasuryRejectCooldown(actorId, addDays(now, 180));  // ★ 180天
  useNpcStore.getState().clearTreasuryDraft(actorId);
  useNpcStore.getState().removePlayerTask(task.id);
  onClose();
  // 注意：驳回后玩家可以立刻在折叠区自己新建方案，不必关弹窗
  // 但由于这里 onClose 了，折叠区也消失。考虑改成保留弹窗：
  //   如果折叠区已展开，handleReject 不 onClose，只清状态
}
```

**关于驳回后是否关闭弹窗的细节**：用户的需求是"驳回之后可以按自己想法立刻执行"。两种实现选择：

1. **驳回后保留弹窗 + 自动展开折叠区**：让玩家驳回后直接在同一个弹窗里新建方案。推荐这个，体验更流畅。
2. **驳回后关闭弹窗**：玩家自己去 RealmPanel 经济Tab 操作内联表单。简单但需要切面板。

实现建议：选 1，handleReject 后 `setShowNewProposal(true)`，并清空 entries 但不 onClose。提供一个独立的 [关闭] 按钮让玩家完成后退出。

---

## 十、`AlertBar.tsx` 扩展

参照 deploy-approve 的处理方式，给 `treasury-approve` 任务加铃铛入口：

```tsx
const treasuryTask = playerTasks.find(t => t.type === 'treasury-approve');
{treasuryTask && (
  <button onClick={() => openTreasuryApproveFlow()}>
    📜 国库审批
  </button>
)}
```

具体怎么挂载（顶层 visible state）参考 DeployApproveFlow 在 `App.tsx` 的现有挂法。

---

## 十一、阶段切分

| 阶段 | 内容 | 验证方式 |
|---|---|---|
| **P1** | `treasuryCalc.ts` 纯函数 + `treasuryCalc.test.ts` | 跑 vitest，所有测试通过且数值精确 |
| **P2** | `NpcStore` 扩展 + 两个 behavior + `types.ts` 加 PlayerTask 类型 | 跑游戏看 NPC 节度使治下是否出现自动调拨；console.log buffer 状态 |
| **P3** | `TreasuryApproveFlow.tsx` + `AlertBar` 接入 | 玩家扮演节度使，月度收到判官提案；批准/驳回都能正确触发 |
| **P4** | 折叠"新建方案"区 + 驳回后自动展开 | 玩家驳回后能在同弹窗内立刻新建并执行 |

P1+P2 是闭环最小必要集；P3+P4 是玩家体验。每阶段独立可验证。

---

## 十二、需要注意的项目约定

1. **从 ctx 读快照**（`backlog_npc_snapshot_cleanup.md`）：新 behavior 从一开始就走 ctx 路径，不直读 store。
2. **复杂功能先 plan**（`feedback_plan_before_code.md`）：本设计文档已经是 plan 的等价物，新会话拿到这个文档可直接进入 P1 实现，不必再开 plan 模式。
3. **测试只测纯函数 + 具体数值**（`CLAUDE.md` 测试原则）：只测 `treasuryCalc.ts`，不测 behavior/UI/store 流转。
4. **Modal 用 base 组件**：不硬编码颜色和遮罩。
5. **批量操作用 batchMutate**：本系统的执行是单条 `executeTransferTreasury`，每条已经是 store 操作，循环调用即可。
6. **驳回冷却 180 天**：与调兵对齐，避免行为不一致。
7. **不引入新 npm 依赖**。

---

## 十三、未来扩展位（不在本期实现）

- **`famine-relief` reason**：当目标州民心 < 30 或人口锐减时触发"赈灾"提案。
- **草拟者好感影响**：低 opinion 的判官故意不草拟 / 草拟糟糕方案。
- **拒绝时的好感惩罚**：草拟者被驳回后获得 -3 衰减式 opinion（30 天后消失）。
- **多 drafter 同 ruler 兼职场景**：调兵的"先到先得 + 非空跳过 + 追加兜底"机制已在 NpcStore 复用，无需额外处理。
- **未来漕运**：当 `treasuryTransferAction` 升级为 shipment 模型（带时间/路径/关隘阻断）时，本系统的 entries 含义不变，只是 execute 路径从"即时到账"变成"创建 shipment"。叙事切入点：朱温截运河，三司使的提案变得无法到达。

---

## 十四、与本次讨论相关的其他文件

- `wantang/src/engine/military/deployCalc.ts` — 草拟人解析、威胁评估、方案生成的参考实现
- `wantang/src/engine/npc/behaviors/deployDraftBehavior.ts` — 草拟 behavior 模板
- `wantang/src/engine/npc/behaviors/deployApproveBehavior.ts` — 批准 behavior 模板
- `wantang/src/engine/npc/NpcStore.ts` — buffer + 冷却的实现模式
- `wantang/src/ui/components/DeployApproveFlow.tsx` — 审批 UI 模板
- `wantang/src/ui/components/InlineTreasuryTransferRow.tsx` — 新建方案折叠区直接复用
- `wantang/src/engine/interaction/treasuryTransferAction.ts` — 底层执行函数 `canTransferTreasury` / `executeTransferTreasury`
- `wantang/src/data/positions.ts` — 4 个草拟岗位 + 4 个批准岗位的定义（已确认存在）
