# 岗位变动原子操作参考表

> 本文件从 CLAUDE.md 抽取，供需要修改岗位变动逻辑时查阅。

## 原子操作清单（`official/postTransfer.ts`）

| 操作 | 函数 | 说明 |
|------|------|------|
| 就任 | `seatPost(postId, holderId, appointedBy, date, extra?)` | 设置 holderId + appointedBy + appointedDate |
| 空缺 | `vacatePost(postId)` | 清空 holderId/appointedBy/appointedDate |
| 军队跟随 | `syncArmyForPost(postId, newOwnerId)` | 岗位绑定军队 owner 转给新持有人 |
| 军队脱离 | `detachArmiesFromPost(postId)` | 岗位绑定军队变私兵（postId → null） |
| 副岗归附 | `cascadeSecondaryOverlord(terrId, newOverlordId, prevHolderId?)` | 同领地副岗持有人 overlordId → 新主岗持有人；prevHolderId 可选，不传则无条件更新 |
| 法理下级回退 | `cascadeChildOverlord(terrId, newOverlordId, prevHolderId)` | 法理下级主岗持有人中 overlordId===prevHolderId 的 → 回退给 newOverlordId |
| 治所就任 | `capitalZhouSeat(daoTerrId, holderId, appointedBy, date, opts?)` | 道级→治所刺史联动就任 |
| 治所空缺 | `capitalZhouVacate(daoTerrId, oldHolderId?)` | 道级→治所刺史联动空缺 |
| 治所失陷 | `checkCapitalZhouLost(transferredTerrIds)` | 被转移的州是否为某道治所→销毁道级主岗 |
| 销毁主岗 | `destroyMainPost(postId, terrId)` | 清空副岗 + 军队变私兵 + removePost |
| 查询可转移下级 | `getTransferableChildren(terrId, newHolderId)` | 返回法理直接下级中 overlordId!=newHolderId 的主岗持有人列表 |
| 转移下级 | `transferChildren(charIds, newOverlordId)` | 批量设置 overlordId（玩家勾选后调用） |
| 自动转移下级 | `autoTransferChildrenAfterAppoint(postId)` | 任命后自动转移所有可转移法理下级（NPC 用） |
| 独立辟署权 | `ensureAppointRight(charId)` | 独立统治者自动获得辟署权 |
| 缓存刷新 | `refreshPostCaches(charIds?, fullRefresh?)` | refreshIsRuler + updateExpectedLegitimacy + refreshPlayerLedger |
| 玩家账本 | `refreshPlayerLedger()` | 重算玩家月度收支 |

## 各场景调用的原子操作

| 场景 | seatPost | vacatePost | syncArmy | cascadeSecondary | cascadeChild | capitalZhou | refreshCaches |
|------|----------|------------|----------|-----------------|--------------|-------------|---------------|
| **考课罢免**（vacateOnly） | | `vacatePost` | | | | | `refreshPostCaches` |
| **正常罢免**（剥夺领地成功） | `seatPost(dismisser)` | | `syncArmyForPost` | `cascadeSecondary(dismisser, prev)` | `cascadeChild(dismisser, prev)` | `capitalZhouSeat(dismisser)` | `refreshPostCaches` |
| **铨选任命** | `seatPost(appointee)` | | `syncArmyForPost` | `cascadeSecondary(appointee)` | 可选转移（deJure） | `capitalZhouSeat(checkCanTake)` | `refreshPostCaches` |
| **直接任命** | `seatPost(appointee)` | | `syncArmyForPost` | `cascadeSecondary(appointee)` | 可选转移（仅任命者臣属） | `capitalZhouSeat(checkCanTake)` | `refreshPostCaches` |
| **篡夺** | `seatPost(actor)` | | `syncArmyForPost` | `cascadeSecondary(actor)` | 不执行 | `capitalZhouSeat(oldHolder)` | `refreshPostCaches` |
| **继承** | `seatPost(heir)` | `vacatePost`（流官） | `syncArmyForPost` | | | `capitalZhouSeat`/`Vacate` | `refreshPostCaches(full)` |
| **战争结算** | `seatPost(attacker)` | | `syncArmyForPost` | `cascadeSecondary(attacker)`（无条件） | 不执行 | `checkCapitalZhouLost` | `refreshPostCaches(full)` |
| **创建头衔** | （addPost） | | `syncArmyForPost` | | | `capitalZhouSeat` | `refreshPostCaches(full)` |
| **销毁头衔** | | | | | | | `destroyMainPost` + `refreshPostCaches` |
| **调任**（外放内调） | `seatPost(京官)` | 全部`vacatePost` | `syncArmyForPost` | `cascadeSecondary(京官)` | `cascadeChild(京官, 有地者)` | `capitalZhouSeat` | `refreshPostCaches` |
| **皇帝销毁**（eraSystem） | | | | | | | `removePost` + `refreshPostCaches(full)` |

## 效忠关系级联详细规则

### 副岗持有人（`cascadeSecondaryOverlord`）
- **正常罢免**：overlordId 原指向被罢免者的 → 回退给 dismisserId（有 prevHolderId 约束）
- **任命/篡夺**：overlordId → 新持有人（无 prevHolderId 约束，无条件归附）
- **战争结算**：强制 overlordId → 攻方（无条件）
- **考课罢免（vacateOnly）**：不级联（由后续 executeAppoint 处理）

### 法理下级主岗持有人（`cascadeChildOverlord`）
- **正常罢免**：overlordId 原指向被罢免者的 → 回退给 dismisserId
- **铨选任命**（deJure 模式）：递归所有法理后代，任命者臣属 + 前任（vacatedHolderId）臣属可选转移
- **直接任命**：递归所有法理后代，仅任命者自己的臣属可转移
- **篡夺/战争结算**：不级联
- **考课罢免（vacateOnly）**：不级联，vacatePost 记录 vacatedHolderId 供后续铨选使用

### 被任命者自身的 overlordId
- **铨选调动**（`vacateOldPost=true`）：沿 parentId 找法理上级主岗持有人
- **直接任命**（`vacateOldPost=false`）：直接 = appointerId
- **副岗任命**：= 本领地 grantsControl 主岗持有人
