# 《晚唐风云》开发里程碑与进度

> **最后更新**：2026-04-05
> **原始规划**：见 `archive/开发里程碑与阶段方案-原版.md`

---

## 总览

```
Phase 0  技术底座          ████████████  100%  ✅ 完成
Phase 1  角色 + 领地        ████████████  100%  ✅ 完成
Phase 2  官职 + 经济        ████████████  100%  ✅ 完成（含 Post 架构重构）
Phase 3  军事系统           ████████████  100%  ✅ 完成
Phase 4  继承 + 王朝周期    ████████████  100%   ✅ 完成
Phase 5  AI 史书            ░░░░░░░░░░░░    0%  ⬜ 未开始
Phase 6  谋略 + 派系 + 事件 █████████░░░   70%  ⬜ NPC Engine 21 个行为 + 决议系统 + 多方参战 + 战争UI，NPC-玩家同权收尾中
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

### Phase 5：AI 史书管线 — ⬜ 未开始
- GameEvent 系统（各系统写入关键事件）
- 年度筛选器 + ChronicleProvider 抽象层
- AI 文言文生成（Moonshot / Anthropic / Local 后端）
- 起居注面板 + 仿古史书展示 UI
- 一生总结（纪传体传记）

### Phase 6：谋略 + 派系 + 事件 — ⬜ 继续补充

**已完成：**
- ✅ NPC Engine 框架 + 21 个行为模块（铨选/考课/宣战/要求效忠/动员/补员/征兵/赏赐/建设/和谈/授予领地/剥夺领地/转移臣属/调兵草拟/调兵批准/召集参战/干涉战争/退出战争/称王建镇/称帝/篡夺）
- ✅ 日结时间系统（2026-04-02）：战争系统日结，其余月结，现实平年日历，dateUtils 工具库
  - 行军使用 marchSpeed 日累积器，骑兵快于步兵
  - 围城/损耗/分数按日推进
- ✅ NPC Engine 日结化（2026-04-03）：哈希槽位+品级分档调度
  - daily 行为（push-task）每天检测，monthly-slot 行为（skip）按槽位分散
  - 品级分档：王公 2次/月，节度使 1次/月，刺史 1次/2月，县令 1次/3月
- ✅ CK3 风格时间控制 UI（2026-04-03）：播放键+三档毛边色块+快捷键
- ✅ NPC 授予领地 + 剥夺领地行为（2026-04-04）：
  - `grantTerritoryBehavior`：直辖超额时自动授予臣属，受赠者按好感(60%)+属性总和(40%)评分
  - `revokeBehavior`：对仇敌臣属剥夺领地，性格驱动权重
  - `revokeAction` + `RevokeFlow`：玩家剥夺交互，成功率判定（`calcRevokeChance`），失败→免费独立战争
- ✅ 罢免/剥夺分离（2026-04-04）：dismiss 仅限非 grantsControl 岗位（京官/地方副岗），revoke 针对 grantsControl 岗位（有风险）；罢免条件改为"直接臣属"
- ✅ 效忠关系级联更新（2026-04-04）：
  - `executeDismiss` 主岗免职时，法理下级主岗持有人 + 本领地副岗持有人的 overlordId 回退给接管者
  - `executeDismiss` 新增 `skipOpinion` 选项，铨选调动等合规场景跳过好感惩罚
  - `executeAppoint` 铨选调动（`vacateOldPost=true`）改用 `executeDismiss` 复用级联逻辑
  - `executeAppoint` 铨选调动主岗时，新任者 overlordId 沿 parentId 找法理上级主岗持有人
  - `executeAppoint` 就任 grantsControl 岗位时，本领地副岗持有人自动归附新任者
  - `demandFealtyBehavior` 权重调整：基础权重 0→50，荣誉感改为正向修正
- ✅ NPC 转移臣属行为（2026-04-04）：`transferVassalBehavior`，节度使及以上主动将法理下级臣属转给对应的下级领主
- ✅ 三层通知系统重构（2026-04-04）：
  - 顶部通知栏（AlertBar）：仅行政任务（铨选/审批/考课）
  - 侧边栏通知（EventToast）：CK3 风格右侧卡片流，羊皮纸材质，头像集成，边框颜色编码，入场动画
  - 中心弹出框（EventModal）：重大决策事件框架（角色卡+叙事+决策按钮+hover效果预览）
- ✅ 事件系统改进（2026-04-04）：事件在引擎层无条件记录（为 AI 史书准备），UI 层按玩家关联度筛选显示；新增宣战/战争结束事件
- ✅ 征兵/补员金钱消耗（2026-04-05）：新增每兵 20 贯征募费用（`RECRUIT_COST_PER_SOLDIER`），征兵和补员均扣除金钱
- ✅ NPC 征兵行为（2026-04-05）：`conscriptBehavior`，NPC 自主新建营扩军
  - 权重：基础 + 战时/兵力/金钱/粮草/性格（boldness/greed/honor/vengefulness）多维驱动
  - 粮草评估：轻量纯函数 `estimateNetGrain`（领地粮产出 - 军费粮耗），征兵后净粮草为负则硬切
  - 执行：每次最多 2 营，优先往营数最少的军队扩编，兵种按性格选择
- ✅ 调兵草拟人四级拆分（2026-04-05）：`resolveDeployDrafter` 重写
  - 天下 → 兵部尚书，国 → 国司马，道 → 都知兵马使，州 → 录事参军
  - ruler 不再自己兼任草拟人，修复皇帝持有刺史岗位时草拟按钮误显示的 bug
- ✅ 岗位调整（2026-04-05）：新增 `pos-guo-sima`（国司马），删除 `pos-sima`（州司马）和 `pos-zhangshi`（州长史）
- ✅ NpcContext 扩展（2026-04-05）：新增 `armies`/`battalions`/`controllerIndex` 快照字段
- ✅ 多方参战系统（2026-04-05）：
  - War 扩展 `attackerParticipants`/`defenderParticipants`，两阵营联盟制
  - `warParticipantUtils.ts`：8 个纯函数替换全部二元判断
  - 合兵战斗方案：同阵营行营合并 armyIds，统帅取 military 最高者
  - 围城解除：援军到达正在被围城的领地时，围城方被拉入野战
  - 领地阵营判定：`isEnemyTerritoryInWar` 沿效忠链找第一个参战者判断阵营
  - 角色死亡自动清理参战状态 + 解散行营
  - 战争自动结算：仅领袖是玩家时跳过，参战者不阻止
  - `WarStore.addParticipant` 兜底校验：拒绝领袖加入/去重
- ✅ 召集参战交互（2026-04-05）：
  - `callToArmsBehavior`（NPC）：领袖 daily 召集臣属，接受概率 = 60 + 好感×1 + 荣誉×15 - 胆识×10，拒绝好感-30
  - 玩家被召集：AlertBar push-task 通知（接受/拒绝），超时 30 天自动接受
  - 玩家主动召集：角色交互"召集参战"二级弹窗（概率预览→结果）
- ✅ 干涉战争交互（2026-04-05）：
  - `joinWarBehavior`（NPC）：领主 monthly-slot 主动加入臣属战争，playerMode=skip
  - 玩家通过角色交互"干涉战争"发起，选择战争+加入阵营
- ✅ 退出战争（2026-04-05）：`withdrawWarBehavior`（NPC），参战者 monthly-slot 评估退出；玩家从 MilitaryPanel/WarOverlay 操作
- ✅ 战争 UI 增强（2026-04-05）：
  - `WarOverlay`：右下角虎符悬浮图标 + 我方视角战分；点击展开详情面板（双方头像/战分条/兵力/盟友头像/操作按钮）；多场战争切换
  - 战分显示改为我方视角（+绿-红）
  - 地图行营颜色四态（我军金/友军绿/敌军红/中立灰）
  - CampaignPopup：非我军行营统一提示"这不是我军行营，无法操作"
  - MilitaryPanel 新增"臣属的战争"区域（可直接加入）
- ✅ 性能优化（2026-04-05）：`buildZhouAdjacency` 模块级缓存；`DeployApproveFlow` 打开时过滤已失效 entries
- ✅ 调兵机制改进（2026-04-05）：执行前校验军队存在性和归属；驳回后 180 天冷却
- ✅ 决议系统（2026-04-05）：`engine/decision/` 框架 + 4 个决议
  - 称王决议：guo 级，控制 50% 法理州，可选体制/继承法/辟署权，创建时一并生成国司马+国长史副岗
  - 建镇决议：dao 级，控制 50% 法理州 + 治所州，治所失陷后重建节度使/观察使
  - 称帝决议：乱世限定，控制 80% 全国州，触发乱世→治世
  - 销毁头衔决议：guo 级，非唯一主岗，好感-40
  - 控制比例统一以州为最小单位（`calcRealmControlRatio` 递归收集法理 zhou）
  - UI：SideMenu"决议"按钮 → DecisionPanel 列表 → DecisionDetailModal 详情弹窗（含建制配置）
- ✅ 篡夺头衔交互（2026-04-05）：`usurpPostAction`，guo+dao 级，控制 50% 法理州，dao 需控制治所州，好感-40，本领地副岗归附
- ✅ 治所州失陷联动（2026-04-05）：战争转移治所州 → 自动销毁父道主岗 + 副岗清空 + 军队变私兵；`executeAppoint` 不再强覆盖被敌方占领的治所
- ✅ 时代钩子（2026-04-05）：危世→乱世自动销毁皇帝岗位
- ✅ NPC 称王/称帝/篡夺行为（2026-04-05）：3 个新 NPC 行为完成王朝兴衰自动循环
- ✅ TerritoryStore 扩展（2026-04-05）：`addPost()` / `removePost()` 方法
- ✅ 岗位模板新增（2026-04-05）：`pos-guo-changshi`（国长史）
- ✅ 自我领主防御（2026-04-05）：修复4处 overlordId=操作者 的自我领主bug；CharacterStore 加 DEBUG console.error 监测；demandFealtyPure 加防环检查；characterSystem 继承加自我领主防御
- ✅ 同战争多行营合围（2026-04-05）：同阵营多行营共同参与围城，合算兵力；城破后所有参与行营回 idle；跨战争围城仍互斥
- ✅ 行营AI跨战争寻路（2026-04-05）：idle行营在被其他战争围城的领地继续寻路；目标选择排除被其他战争围城的领地
- ✅ 删除防守方惰性加分（2026-04-05）：移除战争分数中防守方惰性加分机制（bug多，100%占领后仍扣分）
- ✅ 危世→乱世全面改革（2026-04-05）：销毁皇帝岗位 + 有地臣属解除效忠独立 + 所有道/国级 grantsControl 主岗改为辟署权+宗法继承（割据体制）
- ✅ 铨选候选池修复（2026-04-05）：排除辟署权持有者；继承时高品不继承低品岗位；连锁铨选只选fresh候选人+接受underRank
- ✅ 铨选草案去重（2026-04-05）：handleDraftSubmission 执行前按 appointeeId 去重
- ✅ 铨选调动vacateOnly（2026-04-05）：executeDismiss 新增 vacateOnly 选项，防止罢免者接管 grantsControl 岗位
- ✅ 赏赐行为改进（2026-04-05）：一次赏赐所有低士气军队；去除 isRuler 限制
- ✅ 授予领地改进（2026-04-05）：executeAsNpc 一次授出所有超额州
- ✅ 城破守军解散（2026-04-05）：城破后解散守军而非转移给攻方
- ✅ DeployDraftFlow hooks修复（2026-04-05）：修复提前return导致React hooks数量变化的崩溃

**待做（NPC-玩家同权收尾）：**
- ⬜ 战争停战协议期限（战争结束后一定时间内不可再次宣战）
- ⬜ NPC 罢免行为（`dismissBehavior`）：NPC 主动罢免不满/低能副岗官员
- ⬜ NPC 政策行为（`policyBehavior`）：集权/放权决策
  - 正统性高+实力强 → 提高税率、收回辟署权、改流官制
  - 正统性低+臣属不满 → 降税、给辟署权、给宗法继承权
  - 核心叙事：晚唐皇帝正统性下降 → 被迫逐步向藩镇让权
- ⬜ NPC 军事编制 AI（`militarySystem` 内通用函数）：
  - 建军：领地扩张后拆分军队覆盖多州
  - 换将：都统死亡/能力差时替换
  - 调营：两军兵力悬殊时均衡
  - 裁营：财政/粮草吃紧时裁减弱营
- ⬜ NPC 指定继承人（`characterSystem` 内扩展）：NPC 根据性格偏好选择继承人

**待做（新系统）：**
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

---

## 数据规模

| 实体 | 当前 |
|------|------|
| 角色 | ~160（79 史实 + ~80 随机生成） |
| 领地 | 72（1 天下 + 5 国 + 17 道 + 49 州） |
| 军队 | 41 |
| 营 | 366 |
