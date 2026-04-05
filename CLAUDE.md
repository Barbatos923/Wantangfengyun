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
│   ├── npc/                           # NPC Engine 框架 + 21 个行为模块
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
- **TerritoryStore**：`territories` Map + `postIndex` + `holderIndex` + `controllerIndex` + `expectedLegitimacy` 缓存 + `addPost()` / `removePost()`
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

- 21 个行为模块：铨选 / 考课 / 宣战 / 要求效忠 / 动员 / 补员 / 征兵 / 赏赐 / 建设 / 和谈 / 授予领地 / 剥夺领地 / 转移臣属 / 调兵草拟 / 调兵批准 / 召集参战 / 干涉战争 / 退出战争 / 称王建镇 / 称帝 / 篡夺
- `playerMode`：`push-task`（行政职责）/ `skip`（自愿行为）/ `auto-execute`
- `schedule`：`daily`（每天检测，默认 push-task）/ `monthly-slot`（按槽位，默认 skip/auto-execute）
- `weight` = 百分比概率，`forced` = 强制执行（forced 每天检测，日历型需自带 day===1 守卫）
- `maxActions` = `clamp(0, 3, round(1 + energy × 4))`，品级<9 上限 1
- **哈希槽位调度**：`hash(actorId + ':' + behaviorId) % 28 + 1` 决定月内执行日
- **品级分档频率**：王公(25+) 2次/月，节度使(17-24) 1次/月，刺史(12-16) 1次/2月，县令(0-11) 1次/3月
- 新增行为：实现 `NpcBehavior` → `registerBehavior()` → 自动调度，默认从 playerMode 推断 schedule

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

---

## 八、当前开发阶段

**NPC Engine 日结化已完成，交互系统和通知系统已重构，效忠关系级联机制已完善，头衔创建/篡夺/销毁系统已完成。**

核心循环、继承、铨选、考课、正统性、NPC Engine（21 个行为）、战争系统（含多方参战）、决议系统均已实现并可自主运转。时间系统全面日结（CK3 风格）。

### 最近完成
- **自我领主防御**（2026-04-05）：修复4处 overlordId=操作者 的自我领主bug（appointAction 罢免前任/治所清退、dismissAction 被罢免者回归/级联效忠）；CharacterStore 加 DEBUG console.error 监测；demandFealtyPure 加防环检查；characterSystem 继承加自我领主防御
- **同战争多行营合围**（2026-04-05）：同战争同阵营的多个行营共同参与围城，合算兵力计算进度；城破后所有参与行营回 idle；跨战争围城仍互斥
- **行营AI跨战争寻路**（2026-04-05）：idle行营在被其他战争围城的领地不再傻等，继续寻路找下一个目标；目标选择排除被其他战争围城的领地
- **删除防守方惰性加分**（2026-04-05）：移除战争分数中防守方惰性加分机制（bug多，100%占领后仍扣分）
- **危世→乱世全面改革**（2026-04-05）：销毁皇帝岗位 + 有地臣属解除效忠独立 + 所有道/国级 grantsControl 主岗改为辟署权+宗法继承（割据体制）
- **铨选候选池修复**（2026-04-05）：排除持有辟署权的角色不进入候选池；继承时高品角色不继承低品岗位；铨选连锁(round>1)只选fresh候选人+接受underRank，防止无限升调链
- **铨选草案去重**（2026-04-05）：handleDraftSubmission 执行前按 appointeeId 去重，防止同人在多岗位间弹跳
- **铨选调动vacateOnly**（2026-04-05）：executeDismiss 新增 vacateOnly 选项，铨选调动时不让罢免者接管 grantsControl 岗位，防止皇帝通过铨选调动获得大量领地
- **赏赐行为改进**（2026-04-05）：一次赏赐所有低士气军队（不再逐支）；去除 isRuler 限制，非统治者也能赏赐自己的军队
- **授予领地改进**（2026-04-05）：executeAsNpc 一次授出所有超额州（循环授出）
- **城破守军解散**（2026-04-05）：城破后解散守军而非转移给攻方，防止攻方白得大量军队引发后续士气/私兵问题
- **DeployDraftFlow hooks修复**（2026-04-05）：修复提前return导致React hooks数量变化的崩溃
- **决议系统**（`engine/decision/`）：框架（Decision 接口 + registry）+ 4 个决议（称王/建镇/称帝/销毁头衔）
  - 称王：guo 级，控制 50% 法理州，可选体制/继承法/辟署权，创建时一并生成国司马+国长史副岗
  - 建镇：dao 级，控制 50% 法理州 + 治所州，治所失陷后重建节度使/观察使
  - 称帝：乱世限定，控制 80% 全国州，触发乱世→治世
  - 销毁头衔：guo 级，非唯一主岗
  - 控制比例统一以州为最小单位（`calcRealmControlRatio` 递归收集法理 zhou）
  - UI：SideMenu"决议"按钮 → DecisionPanel 列表 → DecisionDetailModal 详情弹窗
- **篡夺头衔交互**（`usurpPostAction`）：guo+dao 级，控制 50% 法理州，dao 需控制治所州，好感-40，本领地副岗归附
- **治所州失陷联动**：战争转移治所州 → 自动销毁父道主岗 + 副岗清空 + 军队变私兵；`executeAppoint` 不再强覆盖被敌方占领的治所
- **时代钩子**：危世→乱世自动销毁皇帝岗位（`eraSystem.ts`）
- **NPC 称王/称帝/篡夺行为**（3 个）：`createKingdomBehavior`（guo+dao 通用）/ `createEmperorBehavior` / `usurpBehavior`
- **岗位模板新增**：`pos-guo-changshi`（国长史，国级行政副岗）
- **TerritoryStore 扩展**：`addPost()` / `removePost()` 方法，含完整索引增量更新
- **效忠关系级联更新**：主岗易手时自动级联更新法理下级和本领地副岗的 overlordId；铨选调动通过 `executeDismiss(skipOpinion: true)` 复用级联逻辑且无好感惩罚；铨选新任主岗者 overlordId 自动指向法理上级
- **NPC 转移臣属行为**（`transferVassalBehavior`）：节度使及以上主动将法理下级臣属转给对应的下级领主，品级 >= 17 触发
- **要求效忠权重调整**：基础权重 0→50，荣誉感改为正向修正（维护体制秩序）
- **NPC 授予领地行为**（`grantTerritoryBehavior`）：直辖超额时自动授予臣属，受赠者按好感(60%)+属性总和(40%)评分
- **NPC 剥夺领地行为**（`revokeBehavior`）+ 玩家交互（`revokeAction` + `RevokeFlow`）：对仇敌臣属剥夺领地，有成功率判定（`calcRevokeChance`），失败触发免费独立战争
- **罢免/剥夺分离**：罢免（dismiss）仅限非 grantsControl 岗位（京官/地方副岗），剥夺（revoke）针对 grantsControl 岗位（有风险）；罢免条件改为"臣属"而非"你任命的"
- **通知系统三层重构**：
  - 顶部通知栏（AlertBar）：仅行政任务（铨选/审批/考课）
  - 侧边栏通知（EventToast）：CK3 风格右侧卡片流，羊皮纸材质，头像集成，边框颜色编码，入场动画
  - 中心弹出框（EventModal）：重大决策事件框架（角色卡+叙事+决策按钮+hover预览），SideMenu"活动"按钮可触发虚拟测试事件
- **事件系统改进**：事件在引擎层无条件记录（作为 AI 史书史料），UI 层按与玩家关联度筛选显示（`getDisplayRelevance`）；新增宣战/战争结束事件
- **notificationStore**：管理已清除事件 ID + 中心弹出框事件队列
- **征兵/补员金钱消耗**（2026-04-04）：征兵和补员新增金钱成本（每兵 20 贯），`RECRUIT_COST_PER_SOLDIER` 常量
- **NPC 征兵行为**（`conscriptBehavior`）：NPC 自主新建营扩军，基于性格/财政/粮草净收入决策，粮草评估使用轻量 `estimateNetGrain` 纯函数（领地粮产出 - 军费粮耗）
- **调兵草拟人四级拆分**（2026-04-04）：`resolveDeployDrafter` 重写，直接检测 4 个专职草拟人岗位（兵部尚书→皇帝 / 国司马→王 / 都知兵马使→节度使 / 录事参军→刺史），ruler 不再自己兼任草拟人
- **岗位调整**（2026-04-04）：新增 `pos-guo-sima`（国司马，国级军务副岗）；删除 `pos-sima`（州级司马）和 `pos-zhangshi`（州级长史），州级副岗仅保留录事参军
- **NpcContext 扩展**：新增 `armies`、`battalions`、`controllerIndex` 快照字段，军事相关 behavior 的 `generateTask` 可通过 ctx 获取军事数据
- **多方参战系统**（2026-04-04）：War 扩展 `attackerParticipants`/`defenderParticipants`；`warParticipantUtils.ts` 8个纯函数替换全部二元判断；合兵战斗方案（同阵营行营合并 armyIds）；3个新 NPC 行为（召集/干涉/退出）+ 3个新交互（joinWar/callToArms/withdrawWar）；角色交互面板支持"召集参战"（二级弹窗）和"干涉战争"；AlertBar 集成召集通知（超时自动接受）；MilitaryPanel 显示参战者列表+退出按钮+臣属战争区域；角色死亡自动清理；`isEnemyTerritoryInWar` 修复效忠链阵营误判；围城中行营可被援军拉入战斗
- **战争 UI**（2026-04-04）：`WarOverlay` 右下角虎符悬浮图标+展开详情面板（双方头像/战分条/兵力/盟友/操作按钮）；战分显示改为我方视角（+绿-红）；地图行营颜色四态（我军金/友军绿/敌军红/中立灰）；CampaignPopup 文案修正
- **性能优化**（2026-04-04）：`buildZhouAdjacency` 模块级缓存（静态拓扑数据只构建一次）；`DeployApproveFlow` 打开时过滤已失效 entries
- **调兵执行校验**（2026-04-04）：`executeDeployEntry` 执行前校验军队存在性和归属；驳回调兵方案后 180 天冷却

### 尚未完成（NPC-玩家同权收尾，当前优先）
- 战争停战协议期限（战争结束后一定时间内不可再次宣战）
- NPC 罢免行为（`dismissBehavior`）：主动罢免不满/低能副岗官员
- NPC 政策行为（`policyBehavior`）：集权/放权决策，正统性驱动（皇帝让权叙事）
- NPC 军事编制 AI（`militarySystem` 内通用函数）：建军/换将/调营/裁营
- NPC 指定继承人（`characterSystem` 内扩展）：根据性格偏好选择继承人

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
