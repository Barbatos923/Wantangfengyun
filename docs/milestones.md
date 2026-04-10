# 《晚唐风云》开发里程碑与进度

> **最后更新**：2026-04-10
> **原始规划**：见 `archive/开发里程碑与阶段方案-原版.md`

---

## 总览

```
Phase 0  技术底座          ████████████  100%  ✅ 完成
Phase 1  角色 + 领地        ████████████  100%  ✅ 完成
Phase 2  官职 + 经济        ████████████  100%  ✅ 完成（含 Post 架构重构）
Phase 3  军事系统           ████████████  100%  ✅ 完成
Phase 4  继承 + 王朝周期    ████████████  100%   ✅ 完成
Phase 5  AI 史书            █████████░░░   80%  🔧 v1完成，v2精修中（三方向：原始素材丰富化 + 话题聚焦策略 + 模型与prompt调优）
Phase 6  谋略 + 派系 + 事件 ██████████░░   95%  ⬜ NPC Engine 31 行为 + 军事编制AI + 决议 + 多方参战 + 好感实时化 + 留后指定 + 停战协议 + 宣战平衡 + 外放内调 + 逼迫授权 + 自身政策调整 + 议定进奉 + 归附 + 玩家通知补全 + 04-10 系统性 BugFix Wave（Game Over + 战争接续 + 18+ execute stale 契约）
Phase 7  内容填充           ██░░░░░░░░░░   15%  ⬜ 已有初始数据集
Phase 8  整合测试 + 打磨    ░░░░░░░░░░░░    0%  ⬜ 未开始
```

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──┐
              角色+领地     官职+经济     军事     │
                                                  ↓
                                          Phase 4 继承+周期律
                                                  │
                         Phase 5 ←────────────────┘
                          AI史书（依赖前4阶段的GameEvent产出）
                            │
                            ↓
                         Phase 6 ──→ Phase 7 ──→ Phase 8
                        丰富度系统     内容填充      打磨
```

---

## Phase 0：技术底座 — ✅ 完成

| 原计划交付物 | 状态 | 实际情况 |
|:---|:---:|:---|
| 项目工程（React + TS + Vite + Tailwind） | ✅ | Vite 8 + React 19 + TS 5.9 (strict) + Zustand 5 + TailwindCSS 4 |
| TurnManager 核心 | ✅ | 日推进（CK3风格）+ 事件队列 + 日结/月结双层回调 |
| 基础 UI 框架 | ✅ | 主界面布局 + 面板打开/关闭 |
| SVG 地图原型 | ✅ | **超出原计划**：后续升级为 Voronoi 多边形地图 |
| IndexedDB 存档接口 | ✅ | `engine/storage.ts`，数据库 `wantang-db` |
| 时间控制 | ✅ | CK3 风格：中文日期 + 播放/暂停键 + 三档毛边色块（1/2/5天秒）+ 空格/+-快捷键 |

**遗留项**：存档/读档 UI 界面至今未做（底层接口已就绪）。

---

## Phase 1：角色 + 领地 — ✅ 完成

| 原计划交付物 | 状态 | 实际情况 |
|:---|:---:|:---|
| Character 数据模型 | ✅ | 五维能力、特质、好感度、健康值、家族关系树 |
| 角色生成器 | ✅ | `characterGen.ts`，~100 随机角色 + 闲散人才池 |
| Territory 数据模型 | ✅ | 州/道/国三级，含建筑槽、三属性 |
| 月结算：领地产出 | ✅ | 万级产出，含建筑加成 |
| 月结算：角色状态 | ✅ | 健康/老化/死亡管线 |
| 人物信息卡 UI | ✅ | CharacterPanel |
| 领地信息面板 UI | ✅ | TerritoryPanel |

**额外完成**：
- 确定性 RNG（seedrandom），存档可序列化种子
- 路径别名（`@` / `@engine` / `@data` / `@ui`）

**实现中的设计调整**：
- 压力系统暂未实现（GDD 中有设计，代码字段存在但无月度逻辑）

---

## Phase 2：官职 + 经济 — ✅ 完成

| 原计划交付物 | 状态 | 实际情况 |
|:---|:---:|:---|
| 品位表 + 职位注册表 | ✅ | 29 阶散官 + 46 个职位模板 |
| 贤能系统 | ✅ | 贤能积累、品位自动晋升 |
| 任命/罢免系统 | ✅ | 统一函数 `executeAppoint` / `executeDismiss` |
| 上缴与俸禄 | ✅ | 4 级集权 × 领地类型查表 + 回拨率 |
| 经济结算 | ✅ | 完整月度收支管线 + LedgerStore |
| 官职面板 UI | ✅ | GovernmentPanel（百官图）+ OfficialPanel（官署） |
| 领地体制面板 UI | ✅ | CentralizationFlow（集权/继承法/辟署权切换） |

**重大架构重构（超出原计划）**：
- **Post 岗位模型重构**：从 PositionHolding（角色绑定）→ Post（领地绑定），任命从两步简化为一步，冲突检测从 50 行 → `holderId !== null`
- **officialUtils 拆分**：592 行 → postQueries.ts + appointValidation.ts + economyCalc.ts + officialUtils.ts
- **TerritoryStore 索引**：新增 postIndex（O(1) 岗位查找）、holderIndex、controllerIndex

---

## Phase 3：军事系统 — ✅ 完成

| 原计划交付物 | 状态 | 实际情况 |
|:---|:---:|:---|
| Army / Battalion 数据模型 | ✅ | 43 军队 + 378 营，含兵种/士气/补给 |
| War 数据模型 | ✅ | 战争/战役/围城三层，WarStore |
| 宣战流程 | ✅ | declareWarAction + DeclareWarFlow |
| 军队行军 | ✅ | marchCalc.ts，基于 mapTopology 道路 |
| 战斗系统 | ✅ | battleEngine.ts，含地形/将领/兵种克制 |
| 围城系统 | ✅ | siegeCalc.ts |
| 战争结算 | ✅ | warSettlement.ts + warCalc.ts |
| 牙兵士气 / 兵变 | ✅ | militarySystem.ts 中实现 |
| 军事面板 UI | ✅ | MilitaryPanel + BattleDetailModal + CampaignPopup |

**额外完成**：
- 要求臣服交互（demandFealtyAction）
- 转封附庸交互（transferVassalAction）
- 军队绑定岗位架构（Army.postId 为真相源，ownerId 为缓存）

**已知待修复**：
- ⚠️ WarStore 模块级自增 ID（`_warIdCounter` 等）→ 需替换为 `crypto.randomUUID()`，读档后 ID 冲突

---

## Phase 4：继承 + 王朝周期律 — 🔶 进行中（50%）

### Phase 4a：继承系统 — ✅ 完成

| 交付物 | 状态 |
|:---|:---:|
| 继承法（宗法 clan / 流官 bureaucratic） | ✅ |
| 继承人决算 `resolveHeir()` | ✅ |
| 绝嗣上交 `findParentAuthority()` | ✅ |
| 辟署权拦截 `findAppointRightHolder()` | ✅ |
| 死亡继承管线（characterSystem.ts） | ✅ |
| 好感继承（死者好感 ×0.5 → "先辈余泽"） | ✅ |
| 玩家死亡 → playerId 切换 / 王朝覆灭事件 | ✅ |
| 指定继承人交互 | ✅ |
| 继承法 / 辟署权切换 UI | ✅ |

**实现中的设计调整**：
- 继承法从绑定角色改为**绑定岗位（Post.successionLaw）**（参考 manus 方案）
- 新增辟署权（Post.hasAppointRight）机制，划分朝廷/藩镇人事边界
- 牙兵推举继承法暂未实现（宗法/流官二选一）

### Phase 4b：铨选 + 考课 — ✅ 完成

| 交付物 | 状态 |
|:---|:---:|
| 分级任命权（resolveAppointAuthority / resolveLegalAppointer） | ✅ |
| 候选人三层分级评分（selectionCalc.ts） | ✅ |
| 连锁铨选（空缺 → 自动填补） | ✅ |
| 辟署权域自动铨选 | ✅ |
| NPC 自动铨选（appointBehavior.ts） | ✅ |
| 铨选审批 UI（SelectionFlow + TransferPlanFlow） | ✅ |
| 三年一考（reviewSystem.ts + reviewBehavior.ts） | ✅ |
| 考课审批 UI（ReviewPlanFlow） | ✅ |
| 任期归一化（36/实际月数） | ✅ |

### Phase 4c：王朝兴衰 — ✅ 完成

| 交付物 | 状态 |
|:---|:---:|
| 王朝兴衰时代（eraSystem.ts） | ✅ |
| 正统性实装（socialSystem.ys）| ✅ |

---

## Phase 4 额外完成的工作（跨阶段）

以下工作在 Phase 1-4 开发过程中完成，不属于原计划任何一个 Phase：

| 工作 | 说明 |
|:---|:---|
| **Voronoi 多边形地图** | d3-delaunay 生成，SVG clipPath 疆域裁剪，替代原始简化地图 |
| **CK3 风格分层着色** | 默认按藩镇着色，点击展开封臣层级，颜色基于角色 ID 哈希 |
| **势力边界分级** | 玩家金色 > 势力间粗线 > 封臣间中线 > 同控制者细线 |
| **数据层 JSON 化重构** | 实体数据从 TS 硬编码 → JSON 文件，逻辑移至 engine/ |
| **关隘重构** | 从独立实体合并为 Territory 属性（passName / passLevel） |
| **角色生成器** | characterGen.ts，填充副岗空缺 + 闲散人才池 |
| **NPC 引擎基础** | NpcEngine + NpcStore，调度铨选和考课行为 |
| **行军UI优化** | 行军系统改为地图宣战 |

---

## Phase 5-8：后续阶段展望

### Phase 5：AI 史书管线 — 🔧 v1完成，v2精修进行中

**v1 已完成：**
- ✅ 月稿+年史两层增量管线（月度白话摘要→年度文言年史）
- ✅ Direct/Mock/Proxy 三 provider 架构（OpenAI 兼容，支持 OpenRouter/Kimi/DeepSeek 等）
- ✅ 独立 IndexedDB 存 apiKey（不进存档）
- ✅ 读档 reconcile（generating→pending 自动重试）
- ✅ AbortError 不降级 Mock + 三重 stale 校验（playthroughId/requestId/abort）
- ✅ 史成走 EventToast 不暂停游戏
- ✅ 方向 2：关键人物档案（`chronicleDossier.ts`，top 8 + 玩家，禁止套用历史原型）
- ✅ 方向 3：跨年记忆（史官按语提取 + 上年 dossier 快照传递 + 接续叙事指令）

**v2 精修三方向（当前高优先级）：**

**方向 1：原始素材丰富化** — 评估每个 addEvent/emitChronicleEvent 调用点，确保：
  - description 包含足够的因果信息（不仅是"X做了Y"，还要有"为什么/结果如何"）
  - payload 携带结构化数据供 prompt builder 提取（如战斗阶段、兵力对比、成功率）
  - actors/territories 完整（史官需要知道事件涉及的所有关键人物和地点）

**方向 2：话题聚焦策略** — 月稿/年史的 prompt 如何引导 LLM 聚焦有价值的叙事线：
  - 月稿：哪些事件该合并叙述、哪些该独立成段
  - 年史：如何识别年度主线（如"某势力崛起""某战争始末"）并围绕主线组织篇章
  - 史臣注：何时触发纪传切片、聚焦哪些人物

**方向 3：模型与 prompt 调优** — 针对不同模型的输出特征调整：
  - system prompt 的文体指令精度（文言纯度、叙事节奏、忌讳项）
  - 不同 kind（month/year）的 temperature/maxTokens 策略
  - 思考型模型（K2 等）的 reasoning token 预算分配

### Phase 6：谋略 + 派系 + 事件 — ⬜ 继续补充

**已完成（按系统归类）：**

**NPC Engine（31 个行为）**：
- ✅ 框架：日结化调度、哈希槽位+品级分档、push-task/skip/auto-execute/standing 四种 playerMode
- ✅ 行政行为：铨选 / 考课 / 罢免 / 皇帝调任 / 宰相调任
- ✅ 军事行为：宣战 / 动员 / 补员 / 征兵 / 赏赐 / **调兵草拟+审批（draft-approve范式）** / 召集参战 / 干涉战争 / 退出战争
- ✅ 领地行为：授予领地 / 剥夺领地 / 转移臣属 / 要求效忠 / 归附 / 逼迫授权 / 议定进奉
- ✅ 政策行为：调税 / 调职类 / 调辟署权 / 调继承法 / 调回拨率 / 自身政策调整（通用讨好评估 `evaluateAppeasementTargets` + 权限校验 `hasAuthorityOverPost`）
- ✅ 决议行为：称王建镇 / 称帝 / 篡夺
- ✅ 其他：建设 / 和谈

**好感系统双轨制重构**：
- ✅ 实时计算：特质/亲属/外交/正统性/赋税等级/回拨率/辟署权/继承法/职类（`calculateBaseOpinion` + `policyOpinionCache`）
- ✅ 事件存储：`addOpinion` + `decayable: true`，逐月衰减
- ✅ `policyOpinionCache` 自维护（updatePost/addPost/removePost 自动增量更新）
- ✅ 淘汰 `setOpinion` + `decayable: false` 模式

**决议系统**：称王 / 建镇 / 称帝 / 销毁头衔 + 篡夺交互 + 治所联动 + 时代钩子

**多方参战系统**：召集/干涉/退出 + 合兵战斗 + WarOverlay 战争 UI + 地图行营四色

**效忠级联**：离任/就任/铨选调动三路级联 + 自我领主防御 + 铨选候选池/草案修复

**通知系统三层**：AlertBar（行政）/ EventToast（CK3 侧栏）/ EventModal（重大决策）

**战争修复**：多行营合围 / 跨战争寻路 / 城破守军解散 / 删除惰性加分 / 调兵校验+冷却

**时代系统**：危世→乱世全面改革（销毁皇帝+割据体制）

**军事编制 AI**（`militaryAI.ts`，militarySystem 月结中调用）：
- ✅ 建军（每 3 州 1 支，上限 10）/ 换将（补缺+优化）/ 调营（均衡）/ 裁营（空壳+财政）
- ✅ `estimateNetGrain` 提取到 militaryCalc.ts 共用
- ✅ MilitaryStore ID 生成修复为 `crypto.randomUUID()`

**NPC 留后指定**（2026-04-05）：
- ✅ 评分公式：`age×3 + totalAbility × clamp((boldness-honor+2)/4, 0, 1)`，年龄大权重、能力小权重
- ✅ 半年一次（正月/七月）为 NPC 统治者宗法岗位自动设 `designatedHeirId`
- ✅ 有男性子嗣优先，无子嗣才考虑同族男性附庸；继承人仅限男性
- ✅ 治所联动（仅当治所刺史是自己时）

**停战协议系统**（2026-04-05）：
- ✅ Truce 数据层：WarStore.truces Map + addTruce/hasTruce/cleanExpiredTruces
- ✅ 战争结束自动创建 2 年（730 天）停战，仅双方领袖
- ✅ 违反停战额外 -30 名望 -20 正统性；NPC 权重 -20 基本不违反
- ✅ 人物栏新增：当前战争（含战分）+ 外交（停战协议到期日）
- ✅ 月结自动清理过期停战

**宣战权重平衡**（2026-04-05）：
- ✅ CB 基础权重分开：独立 -18（含 -15 独立基础）、兼并 -3、法理 +2（含 +5 法理基础）
- ✅ 好感系数按 CB 差异化：独立 ×-0.5、法理 ×-0.2、兼并 ×-0.15
- ✅ 成本公式重视正统性：`cbCost = |prestige|×0.5 + |legitimacy|×4`

**交互 canShow / 适用对象审查 + 辟署权修复**（2026-04-06）：
- ✅ 逐场景审查 10 个岗位变动场景的对象条件（考课罢免/正常罢免/剥夺领地/铨选/直接任命/篡夺/继承/创建头衔/销毁头衔/皇帝销毁）
- ✅ `ensureAppointRight`（`postTransfer.ts`）：独立统治者自动获得辟署权，三个调用点（独立宣战/继承断链/乱世进入）
- ✅ 剥夺领地辟署权校验：`getRevokablePosts`（玩家）+ `revokeBehavior`（NPC）均需操作者为法理任命人
- ✅ `eraSystem` 去掉重复的 `hasAppointRight: true`，改由 `ensureAppointRight` 统一处理
- ✅ 独立统治者绝嗣兜底：臣属全部独立 + `ensureAppointRight`
- ✅ 确认直接任命不需辟署权（封出自己的领地不需要额外权限）

**岗位变动原子操作重构 + 法理下级可选转移**（2026-04-05）：
- ✅ `postTransfer.ts`：8 个原子操作 + 8 场景审查，5 处代码修复（cascadeChildOverlord 递归化、promoteOverlordIfNeeded、直接任命禁止替换、留后唯一+UI、AppointFlow 自持岗位可授出）
- ✅ 法理下级可选转移：递归所有法理后代（国→道→州），铨选模式（deJure）任命者+前任臣属可转移、直接任命仅转移自己臣属
- ✅ `Post.vacatedHolderId`：vacateOnly 时记录前任，供铨选法理转移判定
- ✅ `TransferChildrenFlow.tsx`：玩家勾选弹窗（默认全选），NPC 自动全转移
- ✅ 好感：新任者对任命者 +转授法理臣属（公式同转移臣属，累加）

**NPC 直辖膨胀修复 + 转移臣属品级校验**（2026-04-05）：
- ✅ 考课罢免 grantsControl 岗位改用 `vacateOnly: true`（三处：reviewBehavior / NpcEngine / ReviewPlanFlow）
- ✅ `canGrantTerritory` 排除治所州（治所与道级主岗绑定，不可单独授出）
- ✅ `calcMaxActions` 下限 0→1、基线 1→2、上限 3→4（知足特质 energy=-0.35 不再导致 maxActions=0）
- ✅ `transferVassalBehavior.findTransferPairs` 增加品级检查（receiver 品级 > vassal 品级，防止同级节度使互转）
- ✅ `[overlord变更]` 永久日志：isRuler 角色 overlordId 变化时打印（CharacterStore.updateCharacter）

**外放内调（调任）系统**（2026-04-06）：
- ✅ 京官↔有地臣属调任交互（双向入口：点击京官或有地者均可）
- ✅ 品级匹配三档（≤12↔州、13-24↔道、25-29↔国）
- ✅ 有地者交出所有领地只身入京，京官继承全部直辖领地/臣属/军队/副岗
- ✅ 拒绝机制：有地者可拒绝（发动独立战争），成功率公式复用剥夺领地结构
- ✅ NPC 皇帝行为（skip，制衡地方：长期任职/低好感/强军力+理性/多疑/勤奋性格驱动）
- ✅ NPC 宰相行为（skip，忠诚型制衡+自私型政斗外放政敌）
- ✅ 宰相提案→NPC 皇帝骰子评估/玩家皇帝 StoryEvent 审批
- ✅ 纯函数分离：`reassignCalc.ts`（品级匹配/候选人/成功率）+ `reassignAction.ts`（执行+提案）
- ✅ 辟署权保护：任一岗位有辟署权则整体不可调任

**Bug 修复：净粮草估算遗漏贡奉收支**（2026-04-06）：
- ✅ `estimateNetGrain` 加入臣属贡奉收入和向上级缴纳支出（`tributeCtx` 可选参数）
- ✅ 修复皇帝/节度使因遗漏贡奉收入导致的错误裁军

**逼迫授权系统**（2026-04-06）：
- ✅ 玩家交互：`demandRightsAction.ts`（点击领主→选择岗位+权利→成功率预览→骰子判定）
- ✅ 成功率公式：基础5% + 好感(>30才有正加成,+25上限) + 兵力(±25) + 性格(±15)，总体clamp(5,70)
- ✅ 好感后果：成功-20、失败-35（overlord→vassal）
- ✅ 1年冷却（`lastDemandRightsDay`）
- ✅ NPC行为：`demandRightsBehavior.ts`（2倍兵力门控+胆量/贪婪驱动）
- ✅ 玩家是上级时：StoryEvent弹窗（授予+5感激 / 拒绝-25）
- ✅ UI：`DemandRightsFlow.tsx`（岗位选择+预览+结果三阶段）
- ✅ NPC路径用 `holderIndex` 优化，O(N_post_held)

**议定进奉系统 + 赋税好感双向化 + overlord变动重置**（2026-04-06）：
- ✅ 玩家交互：`negotiateTaxAction.ts`（点击领主→选择升/降→成功率预览→骰子判定）
- ✅ 双向：臣属可请求降低（base 0，靠好感/兵力/性格）或提高（base 100，仅多疑领主小幅拒绝）
- ✅ 半年冷却（`lastNegotiateTaxDay`），好感后果：成功±5、失败-15
- ✅ NPC行为：`negotiateTaxBehavior.ts`（centralization≥3时请求降低，胆量/贪婪驱动）
- ✅ 玩家是领主时：StoryEvent弹窗（同意+5 / 拒绝-15）
- ✅ 赋税好感双向化：臣属→领主（高税=不满）+ 领主→臣属（高税=满意），无地臣属不适用
- ✅ overlord变动自动重置centralization：CharacterStore updateCharacter/batchMutate 两处拦截
- ✅ 转移臣属品级检查修复：改用岗位模板minRank（非个人rankLevel），防止同级节度使互转
- ✅ CharacterPanel 内联弹窗统一重构为 `<Modal>` + `<ModalHeader>` + `<Button>`（9处）

**自身政策调整 + 授予领地优化**（2026-04-06）：
- ✅ 玩家UI：RealmPanel 体制Tab 继承体制区域改为可交互按钮（独立统治者/皇帝可切换继承法和辟署权）
- ✅ NPC行为：`adjustOwnPolicyBehavior.ts`（独立统治者自愿提升自身权力：流官→宗法、无辟署→有辟署，honor驱动/greed抑制）
- ✅ 授予领地优化：`grantTerritoryBehavior` 排序优先流官/无辟署权州（−100/−50评分），授出前先改后授（clan→bureaucratic + 移除辟署权）
- ✅ 移除 eraSystem 月结 ensureAppointRight 全量扫描（保留乱世转换+事件触发点），允许辟署权持久变更

**归附交互**（2026-04-06）：
- ✅ 玩家交互：`pledgeAllegianceAction.ts`（点击独立统治者→成功率预览→骰子判定）
- ✅ 前置：玩家独立 + 目标独立 + 目标tier严格高于玩家 + 领地相邻（势力范围穿透） + 不在对立战争中 + 半年冷却
- ✅ 成功率：base 70 + 法理附庸(+20)/非法理(-10) + 好感(±15) + 性格(±10)
- ✅ 法理检查沿parentId链向上穿透（州→道→天下）
- ✅ 邻接检查收集目标势力范围所有臣属的州级领地（递归vassalIndex）
- ✅ 成功：overlordId设为target + 好感+10 + centralization自动重置默认2级；失败：好感-5

**玩家通知补全**（2026-04-06）：
- ✅ reassignAction.ts 重构：提取 `executeReassignSuccess` / `executeReassignRebel` 独立函数
- ✅ StoryEvent弹窗：declareWar（纯通知）/ transferVassal（纯通知）/ usurp（纯通知）/ reassign（地方官双选项+京官纯通知，皇帝/宰相两路）
- ✅ EventToast右下角通知：withdrawWar（退出战争🏃）/ joinWar（参战🛡，区分敌我）
- ✅ 修复 reassignBehavior `registerBehavior(chancellorReassignBehavior)` 重复注册
- ✅ 移除 CharacterStore overlord变更日志的误导性 `new Error().stack`

**皇帝直辖膨胀+篡夺+独立辟署权批量修复**（2026-04-07）：
- ✅ 篡夺禁止臣属：`canUsurpPost` 增加 `isInActorRealm` 检查
- ✅ NPC剥夺排除治所州和道级岗位（`revokeBehavior.getVassalControlPosts`）
- ✅ 授予领地扩展道级：直辖上限只算州，超额先授州，治所州卡死则兜底授道
- ✅ 独立辟署权时序修正：宣战不授权→成功后 `ensureAppointRight`→失败收回+宗法改流官
- ✅ 修复 `heirIds` 变量作用域Bug（characterSystem 死亡继承 crash）
- ✅ overlord变更日志增加调用栈追踪；皇帝AI行为全量监测（`[皇帝AI]` 标签）
- ✅ 宣战UI区分宣战成本与战争后果，独立战争标注胜败结果

**调兵草拟-审批重构 + B 模式智能化 + postTransfer 占领者 BUG**（2026-04-08）：
- ✅ deploy 系统对齐 treasury 草拟-审批范式：NpcStore buffer 改 Submission 结构（带 drafterId）+ CD 改 drafter 维度
- ✅ deployDraftBehavior：playerMode `'standing'` → `'skip'`，消灭 standing 分桶 bug；新增"战时跳过"锁，战争 AI 归战争引擎
- ✅ deployApproveBehavior：概率审批（base 100，好感±5，兵力≥0.7/0.9 罚 -5/-10）+ 通过 toast / 拒绝 storyEvent + drafter CD
- ✅ DrafterTokenOverlay 多 token（金"职"国库 + 绿"兵"调兵），战时红边禁用；删除旧 DeployDraftFlow.tsx
- ✅ NpcEngine.handleExpiredPlayerTasks 加 deploy-approve 显式分支（玩家超时必定通过）
- ✅ 新建 `submitDeployDraftAction.ts`
- ✅ B 模式重写：威胁评估对象改为"沿overlord链向上第一个有辟署权的人"（真正能独立开战的最近独立势力）；planDeployments 按敌驻军兵力贪心匹配派兵（demand 排序，战力≤demand 取最大、否则取最小，仍受 deployRatio 上限）
- ✅ 性能优化：assessBorderThreats 一次性预聚合 `appointRightSet` + `strengthByLocation`，O(1) 查询
- ✅ 审批 behavior 过滤已死草拟人（deploy + treasury 同步）
- ✅ **postTransfer 边缘 BUG 修复**：`getTransferableChildren` 法理级联收集时，必须跳过"自身已有更高 tier 主岗"的占领者。复现路径：唐懿宗称王→新河东节度使于琮上任→占领潞州的魏博节度使韩允中被错误纳入河东级联。修复一行 `if (getHighestTierRank(holderId) > TIER_RANK[desc.tier]) continue;`，规约写入 CLAUDE.md §五。

**已完成（金钱系统重构）：**
- ✅ 金钱系统重构（区分私财与国库）— 5批次完成
  - Batch1：Territory.treasury + Character.capital 数据模型 + treasuryUtils 纯函数
  - Batch2：月结引擎重写（产出→州国库，俸禄→私产，贡奉/回拨路由到capital州）
  - Batch3：交互/决议消费者迁移（征兵/建设/赏赐/称王/称帝/篡夺从对应国库扣）
  - Batch4：10个NPC行为迁移到国库检查
  - Batch5：UI重构（ResourceBar/CharacterPanel/RealmPanel 国库/私产分离显示）+ 迁都/国库运输交互
- ✅ Console.log 梳理重构（2026-04-08）：删除15处调试残留 + 引入 `engine/debugLog.ts` 收敛30处NPC/交互/军编流水到6类开关，默认全关；保留压测脚本与BUG/FALLBACK warn/error。控制台从57→12
- ✅ 存档/读档系统 MVP（2026-04-08）：CK3 风格命名存档 + 自动续档双轨。`engine/persistence/` 5 文件（saveSchema/serialize/deserialize/migrations/saveManager）+ ESC/⚙ 唤起 SystemMenu/SaveDialog/LoadDialog UI。Stateful seedrandom 决定性 RNG（防 SL + bug 复现）。`SaveStorageBackend` 接口隔离 IndexedDB → 未来桌面端只换一个文件即可移植到真实文件系统。8 个 store 全部覆盖，索引由 initXxx 自动重建。
- ✅ GPT 5.4 外部评审 BugFix 第一批（2026-04-09）：
  - StoryEvent 存档恢复：数据驱动 effectKey + effectData + 中央 `storyEffectResolver.ts`（25 个 effectKey，执行前状态校验），全量迁移 22 个调用点
  - StoryEvent 快捷键屏蔽：TimeControl 键盘事件在弹窗期间 early return（Space/+/- 屏蔽，Escape 保留）
  - 绝嗣臣属跟随上交：新增 `escheatReceiver` 使臣属优先跟随法理上交接收人（`primaryHeir → escheatReceiver → overlordId`）
- ✅ GPT 5.4 外部评审 BugFix 第二批（2026-04-09，12处）：
  - 好感口径统一：`calculateBaseOpinion` 第三参数修正（negotiateTax + demandRights 共4处 overlordExpLeg → actorExpLeg）
  - 议定进奉边界：`||`/`&&` 逻辑运算符错误修正（3处恒真/恒假条件）
  - 改制漏设 reviewBaseline：`executeToggleSuccession` 宗法→流官时补设考课基线
  - 征兵粮草判断：`conscriptBehavior` 用本地递减替代循环内重读月初快照
  - 围城防守一致性：siegeCalc 三函数从单 defenderId → defenderIds Set，守方阵营全员参与
  - 审批任务校验：召集参战（validateCallToArms）+ 考课罢免（holderId 一致性）+ 任命（appointee 存活）
  - 审批零执行吞单：deploy/treasury 的 executeEntry 返回 boolean，仅通知有成功条目的草拟人
  - 调兵审批 UI：handleApprove 改用本地编辑后的 entries，玩家删除/改目标操作生效
  - 补给阻断双重扣粮：economyCalc 军费汇总跳过 blocked 项
  - NPC 建筑工期：`constructionMonths` → `constructionMonths * targetLevel`
- ✅ **2026-04-10 系统性 BugFix Wave**（"从 demo 到成品"的边缘 case 全面收口）：
  - **Phase A 死亡接续 P0**：① 战争领袖死亡自动转交（`WarStore.replaceLeader` + `successorByDead` Map），不再静默白和平 ② 玩家绝嗣 Game Over：`TurnManager.dynastyExtinct` + saveSchema v3→v4 + `GameOverScreen` 全屏覆盖 + `deserialize` 无条件覆盖 playerId（含 null）
  - **Phase B 即时弹窗执行层重校验**（18+ execute 函数）：统一契约 void→boolean / Result+stale / 判别联合。覆盖 Appoint / DemandFealty / PledgeAllegiance / CallToArms / NegotiateTax / DemandRights / Reassign（含 expectedTerritorialId 防"旧弹窗作用到新人"）/ DeclareWar / TransferVassal / Revoke / Usurp / Dismiss / Recruit / Reward / Replenish / CreateArmy / SetCommander / TransferBattalion / Build。每个 execute 重跑当前合法性 + UI 三态接住（成功/概率落败/stale 文案统一"局势已发生变化"）
  - **皇帝盲点系统化修复**：新建 `postQueries.ts:getSovereigntyTier`（含 `findEmperorId === charId → 4` 特判），归附交互 canShow / canPledgeAllegiancePure / isDejureVassalOf 三处全部修复（独立节度使原本看不到归附皇帝入口）
  - **治所州 cascade 漏洞收尾**：characterSystem NPC 半年留后改 `executeDesignateHeir`、eraSystem 时代切换改宗法改 `executeToggleSuccession`（最后两处绕过统一入口的 updatePost）
  - **events/chronicles 周目隔离**：DB v2→v3，复合主键 `${pid}::${id}`，新增 `purgePlaythroughArchives` 防跨周目串档
  - **CampaignPopup 集结/行军互斥**：incomingArmies>0 禁行军；marching 禁增援；addArmy 子界面状态切换兜底
  - **NpcEngine 4 处任命链接住 boolean**：executeTransferPlan / handleDraftSubmission(direct+imperial) / handleExpiredPlayerTasks(appoint-approve) 失败 continue 跳过 autoTransferChildrenAfterAppoint
  - **CLAUDE.md 4 条新硬约束**：① 即时交互执行层（升格自决议章节，覆盖 18+ 函数）② StoryEvent effectKey/effectData/resolver 数据化 ③ 玩家生命周期/Game Over 4 件事并发 ④ 测试原则改白名单（4 类高价值集成测试允许写）
  - **影响**：复盘文档 `docs/reference/项目诊断-已确认问题-2026-04-10.md` 列出的 14 条已确认问题 + 次一级风险 #1 全部闭合（剩 #2 populationSystem/socialSystem 死亡引用残存待下一轮）

**待做（后续系统）：**
- 更多个人交互
- 谋略系统（个人计谋 + 政治计谋，成功率积累）
- 活动系统（宴会/狩猎/压力释放）
- 派系系统（五大派系，廷议/弹劾/推举）
- 随机事件系统（事件包 + 事件链 + 多步选择）

### Phase 7：内容填充 — ⬜ 大部分未开始
- 已有：79 个史实角色、72 个领地（49 州）、43 军队、378 营
- 待做：扩展至 300-500 角色，建筑数据完善，事件文本，平衡性调参

### Phase 8：整合测试 + 打磨 — ⬜ 未开始
- 系统联动测试
- 性能优化
- UI 打磨（动画/音效/仿古风格）
- 新手引导
- 史书导出
- 多剧本支持

---

## 基础设施与辅助系统

| 项目 | 状态 | 说明 |
|:---|:---:|:---|
| 存档/读档后端 | ✅ | engine/storage.ts（IndexedDB） |
| 存档/读档 UI | ❌ | 缺少 SaveLoadPanel 界面 |
| 生育系统 | ❌ | 字段存在（childrenIds），无生育逻辑 |
| 人才自然生成 | ❌ | 无"进士及第"/"举孝廉"机制 |
| 单元测试 | ✅ | 16 文件 352 测试，覆盖纯函数+数据完整性 |

---

## 已知技术债务

| 优先级 | 问题 | 位置 | 状态 |
|:---:|:---|:---|:---:|
| 高 | WarStore 模块级自增 ID | engine/military/WarStore.ts | ✅ 已修复（已用 crypto.randomUUID()） |
| 中 | UI 组件直写 Store | CentralizationFlow / RealmPanel / BuildMenu / OfficialPanel / DeclareWarFlow | ✅ 已抽离到 Action 层 |
| 中 | 单元测试覆盖不足 | src/__tests__/ 14 文件 318 测试 | ✅ 已大幅补充 |
| 低 | 压力系统字段存在但无月度逻辑 | Character.stress | 待设计 |
| 中 | 皇帝建模为 central scope 特殊岗位（grantsControl=false、无 territoryId），导致每次写"按 ruler 找 tier / 找皇帝控制的领地 / grantsControl 扫描"时都要 if 特判，已重复踩坑多次（deployCalc / treasuryDraftCalc / postQueries 等） | data/positions.ts: pos-emperor | 待重构：给皇帝绑定一个 tier='tianxia' 的虚拟领地，pos-emperor 改为该领地的 grantsControl 主岗，统一所有 controllerIndex/holderIndex/tier 路径，消除特判 |

---

## 数据规模

| 实体 | 当前 |
|------|------|
| 角色 | ~160（79 史实 + ~80 随机生成） |
| 领地 | 72（1 天下 + 5 国 + 17 道 + 49 州） |
| 军队 | 41 |
| 营 | 366 |
