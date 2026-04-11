# 同盟系统参考

> CLAUDE.md 的"同盟系统"章节指向此文档。涉及同盟/结盟/参战逻辑时读此文档。

## 数据模型

- 数据在 `WarStore.alliances`（与 truce 并列）
- `Alliance { partyA, partyB, startDay, expiryDay }`
- 期限 3 年：`ALLIANCE_DURATION_DAYS = 1095`
- 上限：`MAX_ALLIANCES_PER_RULER = 2`

## 缔盟资格

```ts
canEnterAlliance(char, territories) =
  isRuler && (overlordId == null || hasAppointRightPost(char, territories))
```

设计动机：让河北三镇这类"名义臣属 + 实际割据"的藩镇能互相结盟，也能与独立统治者结盟。

## 硬约束：同一效忠链屏蔽

`canShow / execute / resolver` 全部禁止：

```
player.overlordId === target.id || target.overlordId === player.id
```

即**直接领主 ↔ 直接臣属**禁缔盟——避免"结盟自己的臣属"这种与效忠语义冲突的场景。

**皇帝不特判**：`pos-emperor` 虽非 `grantsControl`，但 `collectRulerIds` 已显式将 tianxia 上的 emperor 加入 rulerIds，`isRuler` 正确；同一效忠链规则防止皇帝向直属藩镇发盟书。

## 自动参战

`engine/military/allianceAutoJoin.ts`：**仅**在 `executeDeclareWar` 创建 war 后触发，扫 `attackerId / defenderId` 的盟友。

**不在 `joinWar` / `callToArms` 二次加入时触发**——避免"盟友的盟友"连锁拉入雪球。

## 反戈机制

若盟友直接 `overlordId === enemyLeaderId`，强制切断臣属（`updateCharacter({ overlordId: undefined })`）再加入战争，emit `同盟反戈` Major。

v1 仅检查直接 overlord，不递归上溯；祖孙链场景留作边界。

## 三角同盟冲突裁决

**先按资格分边求交集**（不能只按名册交集——会漏掉"单侧合法"的情况）。真正的冲突是"两侧 `canAutoJoin` 都合法"的共享盟友。

- 玩家走三选一 StoryEvent（援 A / 援 B / 两不相助）
- NPC 按好感决定站队或保持中立
- 所有结局统一落地到 `applyAllianceDilemmaOutcome`

## 背盟惩罚

向盟友宣战或拒绝履约自动参战：

- `ALLIANCE_BETRAYAL_PENALTY = -120 威望 / -80 正统性`
- 双向好感 `-100 / -50`
- 同盟**立即断裂**
- NPC `declareWarBehavior` 对已同盟目标 `weight -= 1000`，硬禁背盟宣战

## 死亡清理

`characterSystem` 死亡处理末尾清理死者所有同盟——**同盟是个人契约，不随继承人转移**。

**这条一定要记住**：死亡接续只转移战争 `attackerId / defenderId`，同盟不跟随。

## 存档兼容

- 旧档 `save.alliances` 可能 undefined，`deserialize` 兜底为空 Map，无需 schema 升级
- `NpcStore.allianceRejectCooldowns` 同样兜底空 Map

## execute 契约

- `executeProposeAlliance` 返回 `'accepted' | 'rejected' | 'stale'`
- `executeBreakAlliance` 返回 `boolean`
- stale 校验必须重跑 `canEnterAlliance`，**不能**只查 `overlordId == null`（会把有辟署权的 vassal 错拦）

## StoryEvent effectKey 清单

必须通过 `storyEffectResolver` 恢复：

- `proposeAlliance:accept` / `proposeAlliance:reject`
- `allianceAutoJoin:accept` / `allianceAutoJoin:reject`
- `allianceDilemma:pickAttacker` / `allianceDilemma:pickDefender` / `allianceDilemma:neutral`

**新增同盟 StoryEvent 时禁止在 `onSelect` 里直接写状态，必须补 resolver case**。
