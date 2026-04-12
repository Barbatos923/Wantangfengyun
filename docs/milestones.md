# 《晚唐风云》开发里程碑与进度

> **最后更新**：2026-04-13
> **原始规划**：见 `archive/开发里程碑与阶段方案-原版.md`

---

## 总览

```
Phase 0  技术底座          ████████████  100%  ✅ 完成
Phase 1  角色 + 领地        ████████████  100%  ✅ 完成
Phase 2  官职 + 经济        ████████████  100%  ✅ 完成（含 Post 架构重构）
Phase 3  军事系统           ████████████  100%  ✅ 完成
Phase 4  继承 + 王朝周期    ████████████  100%   ✅ 完成
Phase 5  AI 史书            ██████████░░   85%  🔧 v1完成，v2精修完成，年稿不等月稿+史书可编辑
Phase 6  谋略 + 派系 + 事件 ██████████░░   97%  ⬜ NPC Engine 35 行为 + 军事编制AI + 决议 + 多方参战 + 好感实时化 + 留后指定 + 停战协议 + 宣战平衡 + 外放内调 + 逼迫授权 + 自身政策调整 + 议定进奉 + 归附 + 玩家通知补全 + 04-10 系统性 BugFix Wave + 角色地理位置 + 指挥官唯一性 + 同盟系统 + 计谋系统v1（拉拢+离间）+ 计谋 v1.1 频率/权重/成功率精修 + 计谋 v2 AI 方法（自拟妙计）+ 时代系统中兴路径
Phase 7  UI美术 + 地图升级   █████░░░░░░░   40%  🔧 第一批（全局色+资源栏+Tooltip+侧栏）+ 第二批（CK3式底部浮动：身份牌+时间管理器）+ 第三批（CharacterPanel CK3式重构）
Phase 8  内容填充           ██░░░░░░░░░░   15%  ⬜ 已有初始数据集
Phase 9  整合测试 + 发布    ░░░░░░░░░░░░    0%  ⬜ 未开始
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
| 王朝兴衰时代（eraSystem.ts，含危世→乱世崩溃 + 危世→治世中兴双向路径） | ✅ |
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
- ✅ 跨年记忆（史官按语提取 + 接续叙事指令）

**v2 精修（当前高优先级，进行中）：**

- ✅ **事件素材丰富化**：22 类事件逐个审计，军事类（宣战/野战/城破/战争结束/兵变/战争接续）+ 继承类（继位/绝嗣/王朝覆灭）description 大幅丰富（CB+目标领地/主将+兵力/围城天数/持续月数/享年+继承关系），BattleResult 加战前兵力
- ✅ **角色标签系统**：`formatActorRoles()` 替代扁平 `人物:X、Y`，22 种事件类型按 actor 位置输出带角色标签（宣战方/守方/任命者/被任命等）
- ✅ **事件驱动上下文卡片引擎**：新建 `chronicleEventContext.ts`，按事件类型为每个 actor 选取不同字段（10 种字段×22 种事件映射），纯函数不读 Store
- ✅ **月稿改起居注**：MONTH_SYSTEM 改为起居注官，直接写文言编年体，允许适当发挥细节
- ✅ **年稿改汇总点评**：YEAR_SYSTEM 改为基于起居注汇总整理，聚焦主线提炼+史臣注+按语
- ✅ **删除冗余素材**：年稿删除 topPowers（Top 5 势力）+ dossiers（关键人物档案），token 全部留给事件上下文
- ✅ **编译修复**：`chronicleEventContext.ts` 类型安全（`as Record` → `keyof Abilities`）+ `chronicleService.ts` 删未用 `buildEventContext` 导入
- ✅ **debugLog 收敛**：月稿和年稿两块 `console.group/log/table` 全部迁移到 `debugLog('chronicle', ...)`，chronicle 目录零裸 console
- ✅ **月稿缺失兜底（rawFallback）**：`waitForMonthDrafts` 超时后，缺失月稿的月份用 `collectMonthEvents` + `buildMonthPrompt` 构建原始事件文本注入年稿 prompt，YEAR_SYSTEM 指示 LLM 以同等文言笔法处理。含回归测试 1 条
- ✅ **Prompt 精简**：MONTH_SYSTEM 和 YEAR_SYSTEM 从冗长指令改为精练要求（~300字→~150字），去掉举例和冗余限定
- ✅ **年稿不等月稿**：`waitForMonthDrafts` timeoutMs 从 30 秒改为 0，1 月 1 日立即生成年稿，缺失月稿走 rawFallback
- ✅ **史书可编辑**：ChroniclePanel 新增编辑/保存/取消按钮，history 区域固定高度 `h-[70vh]`，编辑框与阅读区等大
- ⬜ **待做**：实战验证 prompt 效果、根据实际输出继续调优、探索月稿快模型+年稿强模型分层策略

### Phase 6：谋略 + 派系 + 事件 — ⬜ 继续补充

**已完成（按系统归类）：**

**NPC Engine（35 个行为）**：
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
- ✅ **跨战争交战 + 联吴抗曹**（2026-04-10）：
  - 战斗检测分组键从 `warId:locationId` 改为纯 `locationId`，`findEnemyWars` 跨 war 敌对检测
  - 种子选择：兵力最强者成为被围攻方（守方），其余与之敌对者联合为攻方
  - 对向行军拦截同步支持跨 war 敌对
  - 战争分数遍历所有参战 owner 对，给每个相关 war 正确加减分
  - 盟友围城重复 BUG：围城开始/AI 当前位置/AI 目标选择三处统一改为 `getWarSide(occupiedBy, war) === mySide` 检测己方阵营占领
- ✅ **反向政策好感 + 干涉战争阈值**（2026-04-10）：
  - 领主→臣属方向新增政策好感惩罚：辟署权(-20)/宗法(-15)/军镇(-5)，与正向一致
  - `calculateBaseOpinion` / `getOpinionBreakdown` 新增 `bPolicyOpinion` 参数，全部 UI 和 engine interaction 调用点（13+8处）统一传参
  - `joinWarBehavior` 硬阻断阈值从 `opinion < -20` 改为 `opinion < 0`
- ✅ **NPC 行为幽灵通知修复**（2026-04-10）：
  - declareWarBehavior / dismissBehavior / usurpBehavior 三处 `executeAsNpc` 接住 execute 返回值，失败不推通知
- ✅ **旧编译错误修复**（2026-04-10）：
  - battleEngine.ts 早期返回补 `initialAttackerTroops`/`initialDefenderTroops`
  - characterSystem.ts `mainPost` 作用域提升，皇帝路径不再访问未声明变量
- ✅ **政策削权反抗机制**（2026-04-11）：
  - 新增 `policyRebelCalc.ts` 纯函数：base 20% + opinion×0.5 + honor×15 - boldness×10 + 军力对比(±20)，clamp [5,95]
  - NPC→NPC 路径：收回辟署权/宗法→流官时骰子判定，失败→臣属独立战争 + -30好感
  - 玩家 UI（CentralizationFlow 重写）：削权操作弹确认+接受率+骰子判定；授权操作弹纯确认弹窗
  - 全部骰子改用确定性 `random()`（非 Math.random），保证存档一致性
- ✅ **战斗系统数值调整**（2026-04-11）：
  - 精锐度公式：`0.5 + (elite/100) × 1.5`（0→×0.5, 50→×1.25, 100→×2.0）
  - 势头 momentum ±0.15（原±0.1），下限 0.6
  - 弱方伤害下限 weakerRatio 从 0 提升到 0.5，胜方不再零损失
  - 追击阶段策略选择：基于主将性格选 纵兵追杀/穷寇勿追（胜方）、反戈一击/拼命逃窜（败方），四策略的 damageMultiplier/selfDamageMultiplier 全部生效
- ✅ **反攻夺回失地**（2026-04-11）：
  - 围城开始/AI当前位置/AI目标选择三处增加 `isOccupiedByEnemy` 判定，被敌方军事占领的己方失地可发起围城收复
- ✅ **初始数据调整**（2026-04-11）：
  - 神策军：100营→50营（100,000→50,000人），精锐度→0
  - 魏博/成德/幽州三镇所有军队精锐度→80
  - 张允伸新增营州军（10营/10,000人），王景崇新增冀州军（5营/5,000人）

- ✅ **指挥官唯一性约束**（2026-04-11）：
  - 新增 `commandRules.ts` 共享规则模块：`findArmyCommandedBy`/`findCampaignCommandedBy`/`canAssignArmyCommander`/`canAssignCampaignCommander`
  - 兵马使从"同 owner 唯一"升级为"全局唯一"：`executeSetCommander` + MilitaryPanel 候选列表
  - 都统全局唯一：`executeSetCampaignCommander` 加校验返回 boolean + CampaignPopup 候选过滤（含玩家自身）
  - `militaryAI.ts` 补将/换将改走 `executeSetCommander`，不再绕过规则
  - `executeCreateCampaign` 选都统排除已任都统者，无合法候选（含 ownerId）时创建失败
  - 允许兼任：同一角色可同时是某军兵马使 + 某行营都统
- ✅ **角色地理位置系统**（2026-04-11）：
  - Character 新增 `locationId?: string`（州级物理位置），CharacterStore 新增 `locationIndex`（territoryId → charIds）
  - `locationUtils.ts` 纯函数 `resolveLocation`：行营指挥官→行营位置 > 治所 > 领主治所 > undefined
  - **Category A（岗位变动）**：`refreshPostCaches` 统一挂载 `refreshLocation`，覆盖任命/罢免/剥夺/调任/篡夺/继承等全部岗位变动
  - **Category B（军事移动）**：行营创建/解散/换帅 + 行军到达/步进/拦截/零兵力解散/战败撤退，都统位置全程同步
  - 停战解散行营时都统回治所，初始化 + 存档读档全量 refreshLocation
- ✅ **battleEngine 测试修正**（2026-04-11）：
  - 精锐度公式变更后测试预期值未更新（elite=0: 1.0→0.5, ratio 1.5→4.0），3 个用例修正，371 测试全过
- ✅ **同盟系统**（2026-04-11）：
  - 数据层：`Alliance`（双向、3 年期限）+ WarStore 7 个方法镜像 truce 模式 + 存档三处对称
  - **缔盟资格**：`canEnterAlliance(char, territories)` = `isRuler && (独立 || 持有辟署权)`；禁止同一效忠链（直接领主↔直接臣属）
  - **背盟宣战**：`warCalc` 叠加 `ALLIANCE_BETRAYAL_PENALTY = -120/-80`；`executeDeclareWar` 成功后立即断盟 + 双向好感 -100/-50 + emit Major 史书；NPC `declareWarBehavior` weight -1000 硬禁背盟
  - **自动参战**：`autoJoinAlliesOnWarStart` 在战争创建时扫双方盟友；支持**反戈机制**——盟友直接领主若正是敌方领袖则切断 overlordId 再参战（河北三镇核心场景）；**三角同盟冲突裁决**预扫双侧合法盟友求交集，玩家走三选一 StoryEvent（援 A / 援 B / 两不相助），NPC 按好感站队或保持中立；不触发二次连锁，避免雪球
  - **玩家交互**：`proposeAllianceAction` + `breakAllianceAction`，外交 Tab 盟友区块、`DeclareWarFlow` 红字背盟行、三档 StoryEvent（结盟提议 / 盟约召唤 / 两盟相绞）全部通过 `storyEffectResolver` effectKey 路径恢复
  - **NPC 行为（2 个新增，总数 33）**：`proposeAllianceBehavior`（月度槽位，候选集含同一效忠链屏蔽，skip playerMode 改推 StoryEvent） + `breakAllianceBehavior`（仅 honor≤0.5 + opinion≤-50 + 兵力比≥3:1 + 过 1 年试用期 + 无共同参战，严格防频繁解盟）
  - **死亡清理**：`characterSystem` 死亡处理末尾清理死者所有同盟（个人契约不随继承转移）
  - **史书事件**：`缔结同盟 / 解除同盟 / 同盟到期 / 同盟参战 / 同盟反戈 / 两盟相绞 / 背盟宣战 / 背盟拒援` 共 8 种，白名单 + EVENT_FIELD_MAP + formatActorRoles 三处对齐
  - **初始数据**：`loadSampleData` 为魏博（韩允中）、成德（王景崇）、卢龙（张允伸）三镇两两预先缔结同盟，削藩战争中自然触发反戈
  - **测试**：新建 `src/__tests__/alliance.test.ts` 13 条不变量（CRUD/存档 round-trip/过期清理/冷却/双向查询），384 测试全过

- ✅ **计谋系统 v1**（2026-04-12）：
  - **架构**：`SchemeTypeDef<TParams>` 策略对象 + 自注册 registry，引擎/Store/日结/UI 不感知具体类型；新增 scheme 类型只加一个 `engine/scheme/types/<id>.ts` 文件 + import 一行
  - **强类型守卫**：`executeInitiateScheme(initiatorId, schemeTypeId, rawParams: unknown)` 入口由 `def.parseParams()` 一次性强类型化，下游 def 内部 0 个 `as`
  - **basic vs complex 分级**：basic 单阶段倒计时，complex 多阶段每段 +growth；共用同一 SchemeStore + runSchemeSystem
  - **快照原则**：`snapshot.spymasterStrategy / methodBonus / initialSuccessRate` 启动时冻结，外部变化不影响进行中计谋
  - **runSchemeSystem 双挂载**：非月初挂 daily（warSystem 之后），月初挂 monthly（characterSystem 之后），保证看到死亡/继承结果；mutation 全部走 store 接口
  - **拉拢（curryFavor，basic）**：单阶段 90 天 / 200 金 / diplomacy 主属性，成功双向加好感(+25/+15)
  - **离间（alienation，complex）**：3×30 天 / 500 金 / strategy 主属性，三种方法（散布谣言/伪造书信/美人计）**只在 calcBonus 条件加成上差异化**（统一参数：成本/时长/副作用），失败双方对发起人 -40 + -20 威望
  - **secondaryTarget 关系约束**：必须与 primary 存在关系（领主-臣属/亲属/同势力/同盟），用 `hasRelationship` 在 schemeCalc.ts
  - **AI 方法接口预留**：methodId 用 string + methodBonus 统一字段 + executeInitiateScheme 第 4 参 `precomputedMethodBonus?` + AlienationData 预留 customDescription/aiReasoning。v2 接 LLM 时核心引擎零改动
  - **NPC 行为（2 个新增，总数 35）**：`curryFavorBehavior` + `alienateBehavior`，monthly-slot + skip；候选池**从 actor 关系直接展开**（领主/臣属/家庭/同朝为官/邻居），禁止 N×N 全表扫描（之前 alienate 写 N×N 是 ~8M 步/天瓶颈，已修复 ~250×）
  - **岗位门槛**：拉拢 minRank ≥ 12（刺史），离间 ≥ 17（节度使）。用 holderIndex + postIndex + positionMap.minRank，皇帝 (pos-emperor minRank=29) 自动通过无需特判
  - **NPC speedFactor 按 actor rankLevel 缩放**：`0.10 + actorRank * 0.014`，rank 0 → 0.10, rank 29 → 0.51
  - **UI**：`SchemeInitFlow` 多阶段向导（pickType/pickSecondary/pickMethod/confirm）+ `SchemePanel` 总览 + `SchemeDetailPanel` 二级 modal；模糊成功率用 `s.snapshot.spymasterStrategy` 与 init 时口径一致
  - **存档**：SAVE_VERSION 5 → 6 + migrations.ts 加 v5→v6 注入空数组兜底（不走 optional 反模式）
  - **测试**：新建 `src/__tests__/scheme.test.ts` 19 条（CRUD/索引重建/parseParams 守卫/死亡终止/cancelScheme 权限/通用纯函数），20 文件 403 测试全过
  - **GPT 评审 + Bug 修复**：5 处反馈全部修复（runSchemeSystem 月初/非月初挂载、formatActorRoles 真实位置、parseParams 强类型守卫、mutation 纪律、SAVE_VERSION 升版本而非 optional），3 处 NPC fixes（opinion 方向反、SchemePanel 观察属性、generateTask 直读 SchemeStore），1 处性能修复（alienate N×N → 关系展开）
  - **CLAUDE.md 新硬约束 2 条**：「计谋系统」整节 + 「NPC behavior personality 使用纪律」（禁止 personality 硬门槛，性格倾向只能进 weight 公式）

- ✅ **计谋系统 v1.1 精修**（2026-04-13）：
  - **长测 sim**：新建 `src/__tests__/scheme-frequency-sim.test.ts`（默认 `describe.skipIf(!SCHEME_SIM)`，跑 24 个月出 `scheme-frequency-report.txt`），含 weight 分布直方图 + 初始成功率分桶 + TOP 发起人 + 月度分布。命令 `SCHEME_SIM=1 npx vitest run scheme-frequency-sim`
  - **关键认知修正**：NPC voluntary task 的 weight **直接作为概率百分比**（NpcEngine `chance = min(weight, 100) / 100`）。所有 weight 公式设计必须按 "10% 触发率 = weight 10" 来算，不是相对权重
  - **NpcEngine 槽位系统已按品级分档**（王公 2/月、节度使 1/月、刺史 0.5/月），behavior 内部**禁止**再写 `speedFactor = base + rank * k` 这种二次加成——curryFavor 初版犯过这个双重放大错误
  - **CK3 ai_will_do 风格 weight 公式哲学**：用加法基础惩罚（`add: -N`）而非全局乘法缩放（`factor: 0.3`）来压 mean、保留 tail。乘法修正只用来凸显"特别值得出手"的战略条件（CK3 的 `factor = x` 传统）。这样 mean 低 / tail 高的双峰分布是"有结构理由才出手"的表达
  - **拉拢 calibration**：
    - 去掉"政治地位 targetRank×0.6"均质化加分（导致每个高品 NPC 对所有高品目标都无差别发起）
    - 基础分压低到 2 + 基础惩罚 -8
    - 去 speedFactor 按 rank 二次加成
    - minWeight 10
    - 新增 CK3 风格乘法修正：反叛风险 ×3 / 强臣 ×1.5 / 修复上级 ×2.5 / 已亲近 ×0.3 / 社交性格 `1 + soc × 0.5` / 复仇心 `1 - veng × 0.3`
    - diplomacy 系数 1.5 → 4（dip 18 → ~82% 成功率，dip 4 → ~26%，让玩家外交能力有实感差距）
    - 结果：月均 5.67 → 1.96，mean 15%，max 28%，TOP 发起人从 6 次收敛到 4 次/24月
  - **离间 calibration**：
    - 候选池收窄为三类：直属上级 + 直接臣属 + 相邻同级统治者（`collectAlienationPrimaryCandidates`，用 `buildZhouAdjacency` + overlord 链上溯到 minRank ≥ 17）
    - `collectRelatedSecondary` 去掉家庭（父母/配偶/子女），加入盟友
    - 去 `factor: 0.3` 全局调速
    - CK3 风格乘法：目标敌视（primary→actor op < -15）×1.5 / 切断盟约（secondary 是 primary 盟友）×1.8 / 打击强臣（secondary 是 primary 强力直接臣属）×1.8 / 阴险特质 ×1.5 / 盟友豁免 ×0
    - 方法选择按能力分岔：`strategy ≥ 12` 稳定挑 best calcBonus；`< 12` 在三种方法中随机。让能力差距在方法命中度上体现实感
    - **方法不再计入 weight**，只影响成功率（之前 `方法对症 add: bestBonus*0.5` 去掉）
    - 成功率公式：`base 35 → 5`，`stratDiff × 1.5 → × 3`。Base 压低 30 点是"裸基线只有 5%"，谋略系数 3 让 ±10 差距拉开 ±30 百分点
    - 成功的互相好感扣分 `-30 → -100`（decayable），高风险高回报
    - 结果：谋略 10 皇帝 vs 河北三镇 final ~44%，谋略 20 高手 vs 河北三镇 final 53-59%，谋略 20 vs 性格弱点多的目标 final 可达 80-90%
  - **per-(initiator, primaryTarget, schemeType) CD 系统**：
    - `SchemeInstance.resolveDate?: GameDate`（success/failure 结算时写入，terminated 不写）
    - `SchemeStore.hasRecentScheme(initiator, target, typeId, currentAbsDay, cdDays)` + `SCHEME_PER_TARGET_CD_DAYS = 365`
    - `NpcContext.hasRecentSchemeOnTarget(...)` 快照接口，buildNpcContext 时预聚合 `schemeCdIndex: Map<key, resolveAbsDay|Infinity>`。behavior 不再直接 poke live store
    - `executeInitiateScheme` 内保留 live 校验兜底（execute 契约）
    - `SAVE_VERSION 6 → 7` + v6→v7 迁移：历史已结算 scheme 用 `startDate` 作为 `resolveDate` 近似回填
  - **NpcContext.getAllies(charId): string[]** 快照方法（闭包 `warState.getAllies + currentDay`）
  - **离间史书信息补全**：`executeInitiateScheme` emit 时带 `secondaryTargetId` + 方法名；`chroniclePromptBuilder.formatActorRoles` 新增 7 个 scheme 事件 case（主谋/直接目标/次要目标标签）
  - **CLAUDE.md 新约束**：「NPC weight = 概率百分比 / CK3 ai_will_do 风格 / 槽位不双重加成 / 候选池从已知关系展开」四条纪律落入「计谋系统」章节

- ✅ **计谋隐秘性收口**（2026-04-14）：
  - **EventToast 过滤**：新增 `SCHEME_HIDDEN_FROM_TOAST` 白名单，将 `发起/成功/失败拉拢` + `发起/成功/失败离间` 6 个 chronicle 事件从右下角 toast 屏蔽（此前经由"actor 是玩家直辖臣属→relevance=normal"路径泄露）。chronicle emit 仍保留，供年终 AI 史书开天眼叙述，但游戏中途玩家不可见
  - **notifySchemeResolved 收窄**：从"玩家是任一参与方"改为"**玩家是 initiator**"——玩家知晓自己行动的结果，作为 target 等未来发现机制接入。`notifySchemeTerminated` 同步收窄
  - **`计谋终止` dead case 清理**：v1 预留位真正接入前保持"不 emit"状态，索性从 `CHRONICLE_TYPE_WHITELIST` 和 `chroniclePromptBuilder` 删除对应条目 + 从 `SCHEME_HIDDEN_FROM_TOAST` 移除，语义宣示"scheme termination 不进 chronicle"（死者主条目已足够让史官叙述未竟之事）

- ✅ **计谋系统 v2：离间 AI 方法（自拟妙计）**（2026-04-14）：
  - **架构**：v1 预留的 `precomputedMethodBonus` 第 4 参正式接入 LLM 路径并重命名为 `precomputedRateOverride`。语义从"bonus 叠加在 base 上"改为"**绕过** `calcAlienationInitialRate` 公式直接覆盖最终 initial rate"——prompt 里已给主谋谋略，再叠加 stratDiff×3 会双重计数
  - **框架位**：`SchemeTypeDef.buildAiMethodPrompt?(initiator, params, customDescription, ctx): LlmPrompt` 只由支持 AI 方法的 scheme type 实现。v2 仅离间实现。允许 prompt builder 读 live Store（非热路径，每次发起一次调用），避免为 AI prompt 膨胀 SchemeContext 字段
  - **`canInitiate` 扩 options**：第 5 参 `options?: { skipAiGuard?: boolean }`，评估路径（`evaluateCustomSchemeRate`）传 true 跳过"AI 无 override"守卫但保留通用校验；执行路径（`executeInitiateScheme`）不传，AI 守卫正常生效。维持 execute 路径"失败返回 false 不抛"契约
  - **数值域**：AI 方法 initial clamp `[-20, 100]`（预设方法 `[5, 80]`）、final cap 100（预设方法 90）；天才妙计能突破预设方法硬顶，荒谬策略真的可能倒扣
  - **新文件 `engine/scheme/llm/schemeAiMethod.ts`**：LLM orchestration 单点。复用 chronicle 的 LlmProvider/createProvider/loadLlmConfig 栈。preflight 镜像 executeInitiateScheme 的 stale 序列（canInitiate + 并发上限 + 365天CD），**在调 LLM 之前**就拦下无效局面，避免白烧调用。严格 `parseRate`：整段 trim + 去百分号后必须完整匹配 `^-?\d+(?:\.\d+)?$`，"先说 3 点理由最终 45" 这种偏题会被拒而非误吃到 3。clamp + NaN 兜底兜住 LLM 胡言
  - **`alienation.ts` 实现**：
    - 解注释 `custom` 方法 def，放在 `ALIENATION_METHODS` 数组**首位**
    - `getAvailableAlienationMethods()`（NPC 用，过滤 `isAI`）+ `getAlienationMethodsForUI()`（玩家 UI 用，含 AI 方法）分离，防止 NPC 接触 AI 方法
    - `canInitiate` 检查"AI + 无 override → stale 字串"（不抛异常，options.skipAiGuard 允许跳过）
    - `initInstance` 分支：AI 路径 clamp 后直接作为 finalRate，`console.error` + rate=0 兜底（防御不抛）
    - `onPhaseComplete` 按 methodId 分支 final cap（100 vs 90）
    - `buildAiMethodPrompt` + 私有 helpers（`renderTraits / renderAbilities / renderMainPost / renderLocation / renderPower / renderAllegiance / renderAlliance`），构造三方完整上下文块
  - **UI `SchemeInitFlow.tsx`**：新增 3 个 phase（`writeCustom` / `waitingLlm` / `confirmCustom`）+ 双步确认流程。**cache 严格按 `(primaryId, secondaryId, description)` 三元组 key**——任一字段变动即失效，防止"把旧评估值塞给新局面"。`handleConfirm` 传 override 前再次比对 key。mount effect 探 `isAiMethodAvailable()`，mock 兜底时自拟卡片 disabled + tooltip 指向 LLM 配置。`AbortController` 覆盖 unmount + 取消按钮
  - **debugLog**：完整 prompt 仅在 `window.__DEBUG__.scheme = true` 时输出，避免持久泄露玩家自拟描述 + 三方上下文到 console / 日志采集环境
  - **CLAUDE.md 新约束**：「计谋系统」节追加 7 条（AI 方法预留接口、clamp 范围、canInitiate 是 stale 单点、NPC 过滤分流、UI 缓存 key、mock 兜底、prompt builder 允许读 Store）

- ✅ **时代系统：中兴路径（危世→治世）**（2026-04-14）：
  - **背景**：此前 `stabilityProgress` 字段早已在 saveSchema 和 EraPopup UI 就位，但 `eraSystem.ts` 从未累积过它，EraPopup 面板写"暂无恢复途径"占位。本次补全从危世回到治世的唯一路径
  - **两条结构性诱因**（纯函数 `calcRestorationState` 返回状态，供月结累积与 UI 预览复用）：
    - **条件 A**：皇帝所有**有地直属臣属**（`vassalIndex.get(emperorId)` 过滤 `isRuler`）都没有辟署权 → +10/年（月度 +10/12）
    - **条件 B**：所有有地直属臣属都没有宗法世袭的 grantsControl 主岗 → +5/年（月度 +5/12）
    - 两条独立，全满足 +15/年
  - **空集合 guard**：0 有地直属臣属 → 两条都不触发。realm 崩到没人称臣不该奖励中兴
  - **转换**：WeiShi 下 `stabilityProgress >= 100` → 切回 ZhiShi，镜像 ZhiShi→WeiShi 转换清零两个进度条（防止带着 90 分残余崩溃进度进新治世立刻 decay）
  - **转换优先级**：同一月结同时达标时崩溃（forward 路径）优先——通常意味着外力冲击（如独立战争胜利 `addCollapseProgress(10)`），应按崩溃处理
  - **UI**：`EraPopup.tsx` 新增 `getStabilityTriggers(era, emperorId)` 结构化返回，镜像 `getCollapseTriggers` 风格。替换"暂无恢复途径"占位为两条诱因 active/inactive + rate 文案列表（绿色高亮）；3 种 edge 情况兜底文案（皇位空悬 / 无有地直属臣属 / 乱世须一统）。"中兴进度" 条标题加 "→ 治世" 箭头

**待做（后续系统，优先级降低）：**
- 更多个人交互
- 更多计谋类型（伪造把柄 / 绑架 / 刺杀等）
- 活动系统（宴会/狩猎/压力释放）— 优先级后移，先做 UI/地图升级
- 派系系统（五大派系，廷议/弹劾/推举）— 优先级后移，先做 UI/地图升级
- 随机事件系统（事件包 + 事件链 + 多步选择）
- **旅行系统**（活动/侠客系统前置依赖）：
  - `Character.locationId` 从派生值改为独立真实状态，支持"人在路上"
  - 当前 `resolveLocation()` 纯函数保留为初始化/读档兜底，不再作为日常刷新
  - `postTransfer.ts` 岗位变动改为显式 `setLocation`（先瞬移，后续改发起旅行）
  - 军事移动的 `setLocation` 不变
  - 后续扩展：路径计算、在途状态、到达触发、途中事件

### Phase 7：UI 美术 + 地图升级 — 🔧 进行中（15%）

> 2026-04-12 决策：视频发布后收到反馈，UI/地图视觉效果对聚拢人气至关重要，优先于活动/派系系统。

**目标风格**：晚唐舆图 + 官府文书 + 漆木金石，暖黑墨色基调。详见 `reference/ui-upgrade-plan.md`。

**第一批：全局色 + 垂直切片（2026-04-12）— ✅ 完成**
- ✅ 全局色彩 token 从冷蓝(#1a1a2e)换为暖黑墨色(#12100e)，全 UI 自动跟随
- ✅ 地图专用 token 预留（`--color-map-bg/border/label`）
- ✅ ResourceBar 重做：书简浮层造型 + 4 组分隔 + SVG 图标(开元通宝/斗/官帽/玉玺/双剑/城池) + 单位(贯/斛) + 上下排列增量
- ✅ 自定义 Tooltip 组件（`base/Tooltip.tsx`）：4 方向 + 视口边界修正 + 延迟显示，替换原生 title
- ✅ ResourceTooltip：结构化收支明细浮层（8 项资源全部覆盖）
- ✅ SideMenu 重做：9 个 SVG 图标(殿堂/舆图/双剑/竹简/廷臣/暗棋/三旌/奏折/酒爵) + 金色选中侧条 + hover 反馈
- ✅ 史书/系统按钮整合入资源栏右端
- ✅ 顶部横梁布局：资源栏一右到底 + SideMenu 下移

**第二批：高频 HUD 区（待做）**
- ⬜ BottomBar 升级（玩家身份卡、头像预留位）
- ⬜ TimeControl 升级（统一材质、制度感）

**后续批次**
- ⬜ 核心面板（CharacterPanel 做样板 → 其他跟进）
- ⬜ 流程面板模板化（16 个 Flow 统一风格）
- ⬜ 地图数据扩展（72→100 州 + 30 道）
- ⬜ 地图分层重构（Voronoi 降级为逻辑骨架 + 地理表现层）
- ⬜ 角色头像（AI 生图素材池 + 程序化选取）
- ⬜ 存档/读档 UI
- ⬜ 新手引导

### Phase 8：内容填充 — ⬜ 大部分未开始
- 已有：79 个史实角色、72 个领地（49 州）、43 军队、378 营
- 待做：扩展至 300-500 角色，建筑数据完善，事件文本，平衡性调参

### Phase 9：整合测试 + 发布打磨 — ⬜ 未开始
- 系统联动测试
- 性能优化
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
| 单元测试 | ✅ | 19 文件 384 测试，覆盖纯函数+数据完整性 |

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
