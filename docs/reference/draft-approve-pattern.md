# 草拟-审批 双 behavior 范式

> 适用场景：一个角色（草拟人）评估局势产出方案 → 另一个角色（审批人）决定是否执行。
> 草拟人和审批人通常是上下级关系（属官→ruler），可能是不同人，也可能是同一人。
> 当前实现：`treasuryDraftBehavior` + `treasuryApproveBehavior`（国库调拨）。

---

## 一、整体结构

```
草拟侧                              缓冲区                          审批侧
─────                              ─────                          ─────
 NPC drafter                                                       NPC ruler
 (xxxDraftBehavior)                                              (xxxApproveBehavior)
        │                                                              │
        │  addXxxDraft                              getXxxDraft        │
        ├──────────────────────→ NpcStore.xxxDrafts ←─────────────────┤
 玩家 drafter                  Map<rulerId,                            │
 (XxxDrafterTokenOverlay UI)     Submission[]>                         │
        │                                                              │
        │  submitXxxDraftAction                                        │
        └─────────────────────→        ←─ 玩家 ruler ─────────────────┘
                                          (XxxApproveFlow PlayerTask)
```

**核心思想**：草拟和审批是两个独立的 NpcBehavior，通过 `NpcStore` 中的 buffer 中转方案，不直接调用。

---

## 二、Submission 数据结构

```ts
interface XxxSubmission {
  drafterId: string;       // 谁草拟的（用于 CD/好感/通知）
  entries: XxxEntry[];     // 这次提交的具体条目
}

// NpcStore
xxxDrafts: Map<rulerId, XxxSubmission[]>
xxxDrafterCooldowns: Map<drafterId, GameDate>
```

- buffer 是 `Map<rulerId, Submission[]>`：一个 ruler 可堆多个 drafter 的提交
- CD 是 **drafter 维度**：单次驳回只哑火该 drafter，不影响其他 drafter
- 不要把 entries 直接平铺到 buffer 中，必须保留 drafterId 信息

---

## 三、三种角色场景

| 场景 | 草拟侧 | 审批侧 |
|---|---|---|
| **NPC → NPC** | DraftBehavior NPC路径，weight 竞争 | ApproveBehavior NPC路径，按规则批 |
| **NPC → 玩家** | DraftBehavior NPC路径 | ApproveBehavior push-task → 玩家task → 玩家手动批准 |
| **玩家 → NPC** | UI 面板 → submitXxxDraftAction | ApproveBehavior NPC路径，按规则批 |

注意：**没有 standing 模式**。玩家草拟侧通过独立 React UI 组件（非 PlayerTask）入口，绕过 NpcEngine 调度，避免 standing 模式吞 NPC weight 的分桶 bug。

---

## 四、DraftBehavior 实现要点

```ts
{
  id: 'xxx-draft',
  schedule: 'monthly-slot',
  playerMode: 'skip',          // 玩家走 UI panel，不走 behavior

  generateTask(actor, ctx) {
    if (!actor.alive) return null;

    // 解析 actor 是哪个 ruler 的草拟人
    const result = resolveDrafter(actor.id, ctx.territories, ctx.centralPosts, ctx.holderIndex, ctx.postIndex);
    if (!result) return null;
    const { rulerId } = result;

    // ── 三层 in-flight 锁 ──
    // 1. 该草拟人在 CD 中
    if (useNpcStore.getState().isXxxDrafterCooldown(actor.id, ctx.date)) return null;

    // 2. 该草拟人已有待批 submission（buffer 中）
    const existing = useNpcStore.getState().xxxDrafts.get(rulerId);
    if (existing?.some((s) => s.drafterId === actor.id)) return null;

    // 3. ruler 已有 pending 玩家审批任务（generatePlayerTask 已清空 buffer）
    const hasPlayerTask = useNpcStore.getState().playerTasks.some(
      (t) => t.type === 'xxx-approve' && t.actorId === rulerId,
    );
    if (hasPlayerTask) return null;

    // ── plan ──
    const { entries, urgencyMonths } = planXxxDraft(rulerId, ctx);
    if (entries.length === 0) return null;

    // ── urgency 分档 forced ──
    let urgencyWeight: number;
    if (urgencyMonths < 3) urgencyWeight = 100;       // 极急
    else if (urgencyMonths < 6) urgencyWeight = 60;   // 中急
    else if (urgencyMonths < 12) urgencyWeight = 25;  // 不急
    else return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const weight = calcWeight([
      { label: '紧迫度', add: urgencyWeight },
      // ... personality modifiers
    ]);
    if (weight <= 0) return null;

    // 中急以上视为行政职责，forced 触发不与自愿行为竞争 maxActions
    const forced = urgencyWeight >= 60;

    return { data: { rulerId, entries }, weight, forced };
  },

  executeAsNpc(actor, data, _ctx) {
    useNpcStore.getState().addXxxDraft(data.rulerId, actor.id, data.entries);
  },
}
```

### 关键设计

1. **playerMode='skip'**：玩家草拟走独立 UI panel，不进 NpcEngine 调度循环
2. **三层 in-flight 锁**：CD + buffer + playerTask 三处都要检查，缺一会导致重复堆积（典型 bug：generatePlayerTask 清空 buffer 后 drafter 误以为可以再写）
3. **urgency 分档 forced**：紧迫案例必须 forced，否则 maxActions 槽位竞争会饿死中度紧迫的 case
4. **canonical drafter tier**：解析 ruler 最高 tier 决定哪些岗位有效（避免单 ruler 多个低 tier 草拟人同时刷屏）；**同 tier 多领地全部允许**（多道节度使的多个判官都有效）

---

## 五、ApproveBehavior 实现要点

```ts
{
  id: 'xxx-approve',
  schedule: 'daily',           // 一有 buffer 就尽快处理
  playerMode: 'push-task',

  generateTask(actor, _ctx) {
    if (!actor.isRuler || !actor.alive) return null;

    const draft = useNpcStore.getState().xxxDrafts.get(actor.id);
    if (!draft || draft.length === 0) return null;

    // 玩家任务去重
    const hasExisting = useNpcStore.getState().playerTasks.some(
      (t) => t.type === 'xxx-approve' && t.actorId === actor.id,
    );
    if (hasExisting) return null;

    return {
      data: { submissions: draft },
      weight: 100,
      forced: true,            // 行政职责，不与自愿行为竞争
    };
  },

  executeAsNpc(actor, data, ctx) {
    // NPC 概率审批
    const rate = calcApprovalRate(actor.id, data.submissions, ctx);
    const passed = random() * 100 <= rate;

    if (passed) {
      for (const sub of data.submissions) {
        for (const entry of sub.entries) {
          executeXxxEntry(entry, actor.id);
        }
        notifyPlayerApproved(actor.id, sub.drafterId);  // 玩家通知
      }
    } else {
      // 不通过：每个 drafter 加 30 天 CD
      const cdUntil = addDays(ctx.date, 30);
      for (const sub of data.submissions) {
        useNpcStore.getState().setXxxDrafterCooldown(sub.drafterId, cdUntil);
        notifyPlayerRejected(actor.id, sub.drafterId);
      }
    }
    useNpcStore.getState().clearXxxDraft(actor.id);
  },

  generatePlayerTask(actor, data, ctx) {
    // 转为 task 时清空 buffer，避免重复推送
    useNpcStore.getState().clearXxxDraft(actor.id);
    return {
      id: crypto.randomUUID(),
      type: 'xxx-approve',
      actorId: actor.id,
      data: { submissions: data.submissions },
      deadline: addDays(ctx.date, 30),
    };
  },
}
```

### 关键设计

1. **forced + push-task 组合**：对玩家是 push-task 推任务，对 NPC 是 forced 立刻执行
2. **概率公式**：基础高（如 90）+ 好感小幅修正（±5）+ 金额规模小幅修正（-5/-10），clamp 到 [30, 99]
3. **CD on rejection**：拒绝时给每个 drafter 加 30 天 CD，30 天恰好覆盖一个月结周期
4. **executeEntry 工具函数**：单条 entry 执行带 clamp（如金额 clamp 到当前余额），避免余额变化导致整条静默失败
5. **通知玩家**：drafter 是玩家时
   - 批准 → `TurnManager.addEvent` 右下事件流 toast
   - 拒绝 → `storyEventBus.pushStoryEvent` 中心 modal 弹窗

---

## 六、玩家 UI 三件套

### 6.1 草拟入口：DrafterTokenOverlay（左下角令牌）

- **位置**：`<GameLayout>` 的 map 区域内 absolute 定位左下角
- **显示条件**：玩家通过 `resolveDrafter()` 解析为某 ruler 的主草拟人才显示
- **状态**：
  - 正常：金色边框 + "国库调度"文字
  - CD 中：红色边框 + "CD N日"文字 + 提交禁用
  - buffer 中已有该玩家 pending：黄色提示 + 提交禁用
- **打开后**：实时跑 `planXxxDraft` 算推荐方案 → 编辑 → 提交
- **提交**：`submitXxxDraftAction(rulerId, playerId, entries)` → 写入 buffer

### 6.2 审批入口：AlertBar chip + ApproveFlow Modal

- **chip**：在 `AlertBar` 中加一个彩色按钮，显示 "💰 N项调拨待审批"
- **Modal**：`XxxApproveFlow.tsx`，列出所有 entries（拍平 submissions），可编辑/删除/批准/驳回
- **驳回**：遍历 task.data.submissions，给每个 drafter 加 30 天 CD
- **暂停联动**：审批 Modal 打开时游戏自动暂停，关闭后恢复（已有 `anyModalOpen` 机制）

### 6.3 interaction action

```ts
export function submitXxxDraftAction(
  rulerId: string,
  drafterId: string,
  entries: XxxEntry[],
): { ok: boolean; reason?: string } {
  // CD 检查
  const now = useTurnManager.getState().currentDate;
  if (useNpcStore.getState().isXxxDrafterCooldown(drafterId, now)) {
    return { ok: false, reason: '上次草案被驳回，仍在冷却期' };
  }
  // 重复 pending 检查
  const existing = useNpcStore.getState().xxxDrafts.get(rulerId);
  if (existing?.some((s) => s.drafterId === drafterId)) {
    return { ok: false, reason: '你的上次草案尚未审批' };
  }
  useNpcStore.getState().addXxxDraft(rulerId, drafterId, entries);
  return { ok: true };
}
```

---

## 七、过期默认行为

新增的 push-task behavior 必须在 `NpcEngine.handleExpiredPlayerTasks` 加显式分支决定"超时不管时玩家希望发生什么"。

判断原则：
- **NPC executeAsNpc 跑一遍是不是想要的过期默认行为？**
  - **是** → 通用 fallback 自动处理（不需要写显式分支）
  - **否**（NPC 路径含概率拒绝/条件性拒绝/会做对玩家不利的决定） → **必须**写显式 `else if` 分支

国库审批的 NPC 路径有 ~10% 概率拒绝，所以加了显式分支：
```ts
} else if (task.type === 'treasury-approve') {
  // 玩家超时未审批 → 必定通过（不走概率裁决，避免 NPC 替玩家做决定）
  const data = task.data as { submissions: TreasurySubmission[] };
  for (const sub of data.submissions) {
    for (const entry of sub.entries) {
      executeTreasuryEntry(entry, task.actorId);
    }
  }
}
```

---

## 八、踩过的坑（避免再踩）

1. **buffer 不带 drafterId 信息**：CD 只能 ruler 维度，无法精细到单个 drafter；好感修正没法用。**必须 Submission 结构带 drafterId**。
2. **drafter in-flight 锁缺一层**：只检查 buffer 不检查 playerTask，会导致玩家审批期间 drafter 重复堆积。
3. **standing 模式吞 NPC weight 的分桶 bug**：早期 deploy 用 standing playerMode，导致 NPC 路径 weight 被吞。**所有玩家草拟入口必须用独立 React UI 而不是 PlayerTask**。
4. **forced 是 result 属性不是 behavior 属性**：引擎事先不知道哪次会 forced，会调一次 generateTask 才知道。性能开销可接受，但所有 monthly-slot 行为都会被第一遍 forced 检测调用一次（已记 backlog）。
5. **maxActions 槽位饿死中度紧迫**：weight 即使 60 也常抢不到 voluntary slot。**urgency < 6 月 也必须 forced**。
6. **皇帝特殊建模**：`pos-emperor.grantsControl=false` + 无 territoryId，所有"按 ruler 找 tier"代码都要特判。已记技术债务，未来重构虚拟领地统一。
7. **planner 反复读旧状态**：drafter 写入后 player task pending 期间，drafter 再次触发会读到旧 territory 状态（用户还没批准转账）。靠 in-flight 锁的第三层 hasPlayerTask 阻断。
8. **驳回 CD 必须给 drafter 而不是 ruler**：ruler 维度 CD 会一刀切所有 drafter（包括无辜的同 tier 同事）。

---

## 九、未来抽象方向（暂不做）

如果将来出现第三个"草拟-审批"系统（譬如建设规划草案、外交国书草案），可以考虑抽工厂：

```ts
createDraftApprovePair({
  id: 'xxx',
  resolveDrafter: ...,
  planner: ...,
  executeEntry: ...,
  calcApprovalRate: ...,
  // ...
})
```

工厂内部统一处理 buffer/CD/in-flight 锁/通知/过期分支等。当前两个系统不强行抽象，避免提前设计错。
