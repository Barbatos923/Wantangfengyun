# CLAUDE.md — 《晚唐风云》项目指南

> 本文件供 Claude Code 在会话开始时读取，避免为小任务而全量扫描代码库。
> **开始任务前先读本文件，再只读取与任务直接相关的文件。**

---

## 一、项目概述

晚唐（约 867 AD）历史策略模拟单机游戏，灵感来自 CK3，聚焦中国历史特色（官职体系、藩镇割据、兵变、史书叙事）。

| 项目 | 值 |
|---|---|
| 技术栈 | Vite 8 + React 19 + TypeScript 5.9 (strict) + Zustand 5 + TailwindCSS 4 |
| 存储 | IndexedDB（`idb` 库），数据库名 `wantang-db`，三张表：saves / chronicles / events |
| 随机数 | `seedrandom` 确定性 RNG，入口 `engine/random.ts`，存档时序列化种子 |
| 地图 | `d3-delaunay` Voronoi 多边形 + SVG clipPath 疆域裁剪 |
| 测试 | `vitest`，**只测纯函数**，不测 Store 状态流转；`npx vitest run` 当前 16 个文件 352 个测试 |
| 构建 | `pnpm build`（tsc -b && vite build），产物纯静态 |
| 开发 | `pnpm dev` |
| 测试命令 | `npx vitest run` |
| 路径别名 | `@` → `src/`，`@engine` → `src/engine/`，`@data` → `src/data/`，`@ui` → `src/ui/` |
| 工作目录 | `D:\桌面\Github上传\Wantangfengyun`（即 Git 仓库根目录） |
| 文档 | `docs/` 目录：GDD-v2.0（权威设计案）、milestones.md（进度）、design/（活跃方案）、archive/（历史文档）、reference/（参考资料） |

---

## 二、目录结构

```
src/
├── engine/                            # 游戏引擎层（与 UI 完全解耦）
│   ├── types.ts / random.ts / utils.ts / TurnManager.ts / settlement.ts / storage.ts
│   ├── init/loadSampleData.ts         # 开局数据组装
│   ├── character/                     # CharacterStore + 工具 + 生成器 + 继承
│   ├── territory/                     # TerritoryStore + 工具
│   ├── official/                      # 官职：经济/铨选/正统性/地图着色/岗位查询
│   ├── military/                      # MilitaryStore/WarStore + 战斗/行军/围城/结算
│   ├── interaction/                   # 玩家交互 Action（任命/罢免/宣战/剥夺领地/篡夺/集权等）
│   ├── decision/                      # 决议系统（称王/称帝/建镇/销毁头衔）
│   ├── npc/                           # NPC Engine 框架 + 26 个行为模块
│   └── systems/                       # 月结管线各 System（9 个）
├── data/                              # 纯静态数据（JSON + 定义表 + 索引，禁止放逻辑）
├── ui/                                # React UI 层（只读 Store + 调用 interaction）
│   ├── components/                    # GameMap / CampaignPopup / MapPlaceholder / EventToast / EventModal 等 ~30 个
│   │   └── base/                      # 基础组件库：Modal / ModalHeader / Button
│   ├── layouts/ / hooks/ / panels/ / stores/
└── __tests__/
    ├── data/                          # 数据完整性（positions / ranks / buildings / traits / map）
    ├── engine/                        # 纯函数（dateUtils / territoryUtils / battleEngine /
    │                                  #         economyCalc / reviewSystem / selectionCalc）
    └── phase*.test.ts                 # 重构安全网（已有 3 个，锁定数据契约和正统性公式）
```

### 测试原则
- **测什么**：纯函数（Calc 模块、dateUtils、territoryUtils、reviewSystem、selectionCalc）和静态数据完整性
- **不测什么**：Store 状态流转、结算管线顺序、NPC 决策（依赖随机 + 完整游戏状态，ROI 低）
- 每个测试必须写**具体期望数值**，禁止只写 `toBeGreaterThan(0)`，确保公式被无意修改时能立刻报警

---

## 三、核心 Store 与索引

各 Store **维护预计算索引**以支持 O(1) 查询，**查询时必须优先使用索引，禁止全量遍历**。

- **CharacterStore**：`characters` Map + `vassalIndex` + `aliveSet` + `refreshIsRuler()`
- **TerritoryStore**：`territories` Map + `postIndex` + `holderIndex` + `controllerIndex` + `expectedLegitimacy` 缓存 + `policyOpinionCache` 缓存 + `addPost()` / `removePost()`
- **MilitaryStore**：`armies` / `battalions` Map + `ownerArmyIndex` + `locationArmyIndex` + `syncArmyOwnersByPost()`
- **WarStore**：`wars` / `campaigns` / `sieges` 三个 Map
- **NpcStore**：`playerTasks` 队列 + 旧字段（`TODO(phase6-cleanup)`）

---

## 四、日结/月结双层结算管线

时间系统采用**日结驱动**（现实平年日历，365天/年），各系统按不同频率触发。

入口：`TurnManager.ts` → `settlement.ts`

### 日结管线（每日触发，dailyCallback）
- `warSystem` — 行军（marchSpeed 累积器）/战斗/围城/战争分数
- `NpcEngine`（非月初）— NPC 日结决策（daily 行为每天检测，monthly-slot 行为按哈希槽位+品级分档）

### 月结管线（每月初 day===1 触发，monthlyCallback），严格顺序：
1. `characterSystem` — 健康/死亡/继承（必须最先）
2. `NpcEngine` — NPC 决策（月初在 characterSystem 之后，保证继承先完成）
3. `populationSystem` — 年度人口（仅 month===1）
4. `socialSystem` — 好感/领地漂移/晋升
5. `economySystem` — 经济/破产
6. `militarySystem` — 征兵池/士气/兵变
7. `eraSystem` — 时代进度
8. `buildingSystem` — 建筑施工

### 日期工具
- `dateUtils.ts`：`getDaysInMonth` / `toAbsoluteDay` / `addDays` / `diffDays` / `diffMonths` 等
- 禁止手写 `(y2-y1)*12+(m2-m1)` 日期算术，必须用 `dateUtils`

**规则**：不要在 `settlement.ts` 中直接写业务逻辑，应当新建 System 或 NpcBehavior。

---

## 五、关键架构约定（必须遵守）

### 岗位变动三连
所有修改 `grantsControl` 岗位 `holderId` 的地方，**必须配套**：
1. `syncArmyOwnersByPost(postId, newHolderId)` — 军队跟随岗位转移
2. `refreshIsRuler(collectRulerIds(territories))` — 刷新统治者标记
3. （如适用）`refreshExpectedLegitimacy()` — 正统性缓存

当前已在 8 处配套：`appointAction` / `dismissAction` / `revokeAction`（剥夺成功时调用 dismissAction）/ `characterSystem`（继承）/ `warSettlement` / `usurpPostAction`（篡夺）/ `createKingdomDecision`（创建岗位）/ `destroyTitleDecision`（销毁岗位）

### 岗位销毁清理
销毁 grantsControl 主岗时，**必须配套**：
1. 同领地副岗 `holderId` 全部清空
2. 绑定军队 `postId → null`（变私兵，保留原 owner）
3. 三连刷新（refreshIsRuler + refreshExpectedLegitimacy）

当前已在 3 处配套：`warSettlement`（治所失陷）/ `destroyTitleDecision`（决议销毁）/ `eraSystem`（皇帝自动销毁，tianxia 无副岗/军队）

### 治所州联动
道级领地的 `capitalZhouId` 治所州是道的附属品：
- **任命道级主岗** → 自动授予治所州刺史（仅当治所空缺或仍在任命方势力内）
- **罢免道级主岗** → 自动罢免治所州刺史
- **继承道级主岗** → 治所州跟随继承（仅当治所 holderId === deadId）
- **铨选候选池** → 跳过治所州（不单独铨选）
- **治所州被战争占领** → 自动销毁父道主岗 + 清空副岗 + 军队变私兵
- **道级篡夺/创建** → 必须控制治所州作为前置条件

### 效忠关系级联
主岗（grantsControl）易手时，效忠关系自动级联更新：
- **离任级联**（`executeDismiss`）：法理下级主岗持有人 + 本领地副岗持有人的 `overlordId` 回退给接管者（dismisserId）
- **就任级联**（`executeAppoint`）：本领地副岗持有人自动归附新任者；法理下级刺史**不自动**转移，由就任者通过要求效忠收服
- **铨选调动**（`vacateOldPost=true`）：旧 grantsControl 岗位走 `executeDismiss(skipOpinion: true)` 复用级联且无好感惩罚；新任者 overlordId 沿 parentId 找法理上级主岗持有人
- **单独任命**（`vacateOldPost` 为 false）：新任者 overlordId 直接指向 appointerId（保持现状）

### 私兵继承
- `postId: null` 的军队不受 `syncArmyOwnersByPost` 管理
- owner 死亡时：有继承人 → 转给 primaryHeir；绝嗣 → disbandArmy 解散

### 皇帝查找
- 皇帝岗位在 `tianxia` 领地上，**不在 `centralPosts` 数组里**
- 必须用 `findEmperorId(territories, centralPosts)`

### 铨选语义
- 候选人池效忠链指向**法理主体**，不指向经办人
- `executeDismiss` 的 `dismisserId` 传**法理主体**，不传经办人

### 纯函数分离
- `engine/` 下的 Calc 模块必须是**纯函数**，不得调用 `getState()`
- Utils 文件是便捷包装层，允许读 Store 后委派给纯函数

### 好感系统双轨制
好感（opinion）系统只有两种类型，**禁止使用 `setOpinion` + `decayable: false` 模式存储状态好感**：
- **实时计算**（不存储在 relationships 中）：在 `calculateBaseOpinion` 中根据当前状态实时算出
  - 特质/亲属/外交/正统性：从 Character 字段直接计算
  - 政策好感（赋税等级/回拨率/辟署权/继承法/职类）：赋税和回拨率从 Character 字段计算，岗位相关从 `policyOpinionCache` 读取
  - `policyOpinionCache`（TerritoryStore）：预计算每角色的辟署权/继承法/职类好感值。**无需手动刷新**——`updatePost`/`addPost`/`removePost` 在检测到 grantsControl 岗位的 `holderId`/`hasAppointRight`/`successionLaw`/`templateId` 变更时自动增量更新（`updateCharPolicyCache`），仅刷新受影响角色。全量 `refreshPolicyOpinionCache()` 只在 `initTerritories`/`initCentralPosts` 时调用一次
- **事件存储**（`addOpinion`, `decayable: true`）：一次性事件触发，逐月衰减到消失
  - 如：授予职位 +20、罢免 -20、拒绝效忠 -30、剥夺领地 -30
  - 使用 `addOpinion` 追加（可叠加同 reason）

### 层级隔离（engine ↛ ui）
- **`engine/` 禁止 import `@ui/` 的任何模块**，依赖方向只能是 `ui/ → engine/`
- NPC 行为需要通知玩家时，使用 `engine/storyEventBus.ts`（Zustand store）推送纯数据事件，UI 层（`EventModal.tsx`）订阅渲染
- `StoryEvent` / `StoryEventOption` / `StoryEventEffect` 类型定义在 `engine/storyEventBus.ts`，**不在 UI 层**
- 新增 NPC 行为如需玩家决策/通知弹窗，统一调用 `useStoryEventBus.getState().pushStoryEvent(event)`

### UI 组件规范
- 新建弹窗/流程组件**必须使用** `base/` 基础组件：`<Modal>`、`<ModalHeader>`、`<Button>`
- `Modal` size：`sm`=max-w-sm / `md`=max-w-md / `lg`=max-w-lg / `xl`=max-w-4xl
- `Button` variant：`default`（默认）/ `primary`（金色确认）/ `danger`（红色警告）/ `ghost`（无边框）/ `icon`（圆形图标）
- 颜色、字号、圆角、阴影均通过 `index.css` 的 CSS 变量控制，**禁止在组件内硬编码颜色值**
- 新弹窗禁止直接写 `fixed inset-0 bg-black/50` 遮罩，统一用 `<Modal>`

### 自我领主防御
所有 `updateCharacter(X, { overlordId: Y })` 或 `batchMutate` 中 `c.overlordId = Y` 的赋值，**必须确保 X !== Y**（角色不能成为自己的领主）。典型危险场景：罢免前任回归人才池、治所清退、级联效忠回退——当操作者恰好就是被操作者时会触发。`CharacterStore` 中有 DEBUG `console.error` 监测。

### 其他规则
- 批量操作**必须用 `batchMutate`**，禁止循环 `setState`
- ID 生成**必须用 `crypto.randomUUID()`**，禁止自增计数器
- `data/` 只存纯数据和索引，不放逻辑
- `ui/` 不写游戏逻辑，只读 Store + 调用 interaction
- `canShow()` 必须是廉价纯布尔判断
- 不引入新 npm 依赖（除非用户授权）

---

## 六、NPC Engine（已日结化）

- 26 个行为模块：铨选 / 考课 / 宣战 / 要求效忠 / 动员 / 补员 / 征兵 / 赏赐 / 建设 / 和谈 / 授予领地 / 剥夺领地 / 转移臣属 / 调兵草拟 / 调兵批准 / 召集参战 / 干涉战争 / 退出战争 / 称王建镇 / 称帝 / 篡夺 / 罢免 / 调税 / 调职类 / 调辟署权 / 调继承法 / 调回拨率
- `playerMode`：`push-task`（行政职责）/ `skip`（自愿行为）/ `auto-execute`
- `schedule`：`daily`（每天检测，默认 push-task）/ `monthly-slot`（按槽位，默认 skip/auto-execute）
- `weight` = 百分比概率，`forced` = 强制执行（forced 每天检测，日历型需自带 day===1 守卫）
- `maxActions` = `clamp(0, 3, round(1 + energy × 4))`，品级<9 上限 1
- **哈希槽位调度**：`hash(actorId + ':' + behaviorId) % 28 + 1` 决定月内执行日
- **品级分档频率**：王公(25+) 2次/月，节度使(17-24) 1次/月，刺史(12-16) 1次/2月，县令(0-11) 1次/3月
- 新增行为：实现 `NpcBehavior` → `registerBehavior()` → 自动调度，默认从 playerMode 推断 schedule
- **军事编制 AI**（`militaryAI.ts`，在 `militarySystem` 月结中调用，不走 NpcBehavior）：
  - 建军：每 3 州 1 支军队（上限 10），选无己方军队驻扎的州
  - 换将：commanderId 空缺自动补缺 + military 高 10+ 点时优化替换
  - 调营：营数差距 >= 3 时从多的转弱营到少的
  - 裁营：空壳营（strength < 100）直接解散 + 净粮草为负时裁弱营（每月最多 2 个）
  - 跳过玩家，玩家手动管理军队

---

## 七、战争系统要点

- **多方参战**：War 含 `attackerParticipants` / `defenderParticipants` 数组，两阵营联盟制；工具函数在 `warParticipantUtils.ts`；所有二元判断已替换
- **召集参战**（`callToArmsBehavior`）：战争领袖 daily 召集直属臣属，NPC 按好感(1:1)/荣誉决定接受(基础60)或拒绝(-30好感)，玩家 push-task 通知（超时自动接受）；玩家可通过角色交互"召集参战"主动发起（二级弹窗：概率预览→结果）
- **干涉战争**（`joinWarBehavior`）：NPC 领主 monthly-slot 主动加入臣属战争同一方，权重受好感/荣誉/兵力驱动；玩家通过角色交互"干涉战争"发起（`playerMode: skip`）
- **退出战争**（`withdrawWarBehavior`）：参战者（非领袖）评估退出，保守权重；退出解散行营+好感-20
- **合兵方案**：同一位置同阵营的多个行营合并 armyIds 打一场 `resolveBattle`，统帅取 military 最高者，败方统一撤退；围城中的行营被援军拉入战斗时自动解除围城
- **领地阵营判定**（`isEnemyTerritoryInWar`）：沿效忠链找到第一个战争参与者判断阵营，避免高层领主在对方导致下级领地误判
- **战分占领**：占领战分分母只看主防御者（war.defenderId）领土，分子统计己方阵营所有人的占领；战斗战分由行营归属自然归阵营
- **角色死亡**：自动从参战者列表移除 + 解散行营
- **宣战理由**：武力兼并（危世仅辟署权持有者可用，治世不可见）/ 法理宣称 / 独立
- **独立战争**：宣战即脱离效忠，败北恢复
- **关隘通行**：己方/臣属控制或己方占领 → 通行；被敌方占领 → 阻隔（即使原控制者是己方）
- **行营 AI**：寻路→行军→围城→推进→撤退→重新出击，玩家行营跳过 AI
- **战斗触发**：同一州的同战争敌对行营自动交战（含围城中行营），无战争关系不交战
- **地图行营颜色**：金色=我军，绿色=友军，红色=敌军，灰色=中立
- **战争悬浮图标**（`WarOverlay`）：右下角虎符图标 + 我方视角战分；点击展开详情面板（双方头像+战分条+兵力+盟友+和谈/投降/退出按钮）；多场战争可切换
- **调兵驳回冷却**：驳回调兵方案后 180 天冷却，冷却期内不生成新草案
- **对向行军拦截**：后置交叉检测（行军结算之后），仅当甲从 X→Y、乙从 Y→X **同一天互换位置**时触发，相遇在防守方原始位置；速度不一致时由常规战斗检测接手（`warSystem.ts`）
- **地图行军 UI**：CK3 风格，在地图上点击选目的地，金色虚线显示路径
- **停战协议**：战争结束后双方领袖 2 年（730 天）停战；违反额外 -30 名望 -20 正统性；NPC 权重 -20 基本不违反；WarStore.truces Map + 月结自动清理过期
- **宣战权重平衡**：CB 基础权重分开（独立 -18、兼并 -3、法理 +2）；好感系数按 CB 差异化（独立 ×-0.5、法理 ×-0.2、兼并 ×-0.15）；成本公式 `|prestige|×0.5 + |legitimacy|×4` 重视正统性

---

## 八、当前开发阶段

核心循环、继承、铨选、考课、正统性、NPC Engine（26 个行为）、战争系统（含多方参战）、决议系统均已实现并可自主运转。时间系统全面日结（CK3 风格）。

### 最近完成
- **NPC 留后指定 + 停战协议 + 宣战权重平衡**（2026-04-05）：半年一次性格偏好选留后（年龄大权重+能力小权重，boldness/honor 调节，男性限定）；2 年停战协议（违反额外 -30 名望 -20 正统性，NPC 权重 -20）；人物栏新增当前战争（含战分）+ 外交（停战协议）；宣战权重分 CB 差异化（独立基础 -18、法理 +2、好感系数按 CB 分开、成本公式 `|prestige|×0.5 + |legitimacy|×4` 重视正统性）
- **NPC 军事编制 AI**（2026-04-05）：`militaryAI.ts` 在 militarySystem 月结中自动执行（建军/换将/调营/裁营）；`estimateNetGrain` 提取到 militaryCalc.ts 共用；MilitaryStore ID 生成修复为 `crypto.randomUUID()`
- **NPC 政策行为 + 好感实时化重构**（2026-04-05）：5 个政策行为 + 好感双轨制（实时计算+事件存储）+ `policyOpinionCache` 自维护 + 权限校验 `hasAuthorityOverPost` + 道/州职类独立
- **NPC 罢免行为 + StoryEvent 下沉**（2026-04-05）
- **决议系统 + 篡夺 + 头衔系统**（2026-04-05）
- **多方参战系统**（2026-04-04）：召集/干涉/退出 + 合兵战斗 + 战争 UI + 地图行营四色
- **效忠级联 + 铨选修复 + 通知系统三层重构**（2026-04-04~05）

### 尚未完成（当前优先）
- 铨选调动时法理下级刺史的可选转移（CK3 风格，玩家可选是否同时转给新任者）

### 尚未完成（后续系统）
- 铨选调动时法理下级刺史的可选转移（CK3 风格，玩家可选是否同时转给新任者）
- 存档/读档 UI（底层已实现）
- AI 史书（GameEvent → 大模型生成史书文本，事件 payload 需结构化补充）
- 生育系统（宗法继承长期运转基础）
- 人才自然生成（进士及第/举孝廉）
- 非宗法皇位更替（禅让/篡位/权臣拥立）
- 权知机制
- 谋略/派系系统
- 地图增强：选中领主高亮、封臣名标签、效忠链箭头、地图管理器（右下角）
- 行营AI目标选择优化（都统性格+攻守态势）
- 强力CB（一次宣战多个领地）
- NPC Engine 旧 UI 兼容层清理（`TODO(phase6-cleanup)`）

---

## 九、数据规模

| 实体 | 当前 |
|------|------|
| 角色 | ~160（79 史实 + ~80 随机生成） |
| 领地 | 72（1 天下 + 5 国 + 17 道 + 49 州） |
| 军队 | 41 |
| 营 | 366 |

军事经济基准：1 牙兵 = 2 斛粮/月，征兵/补员 = 20 贯/兵
