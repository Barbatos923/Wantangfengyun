# 《晚唐风云》UI 完整清单

更新时间：2026-04-12
定位：现状盘点 / 改造基线

---

## 1. 整体布局结构

```
GameLayout (全屏 flex-col)
├─ ResourceBar (顶栏，常驻)
├─ 主容器 (flex-row, flex-1)
│  ├─ LeftPanel (360px，条件显示)
│  │  └─ CharacterPanel
│  ├─ MapPlaceholder (flex-1，中央)
│  │  ├─ GameMap (SVG 交互地图)
│  │  ├─ AlertBar (左上浮层)
│  │  ├─ EventToast (右中偏下浮层)
│  │  ├─ WarOverlay (右下浮层)
│  │  └─ DrafterTokenOverlay (左下浮层)
│  └─ SideMenu (右侧，常驻)
├─ BottomBar (底栏，常驻)
├─ EventModal (中央弹窗，最高层)
├─ ChronicleButton (右上角，常驻)
├─ SystemMenu (ESC 触发)
└─ GameOverScreen (全屏覆盖，条件)
```

---

## 2. 常驻 HUD 层（永远可见）

| # | 组件 | 文件 | 显示内容 |
|---|------|------|----------|
| 1 | ResourceBar | ResourceBar.tsx | 8 项资源：国库钱/粮、私产钱/粮、名望、正统性、兵力、领地数；hover 显示收支明细 |
| 2 | BottomBar | BottomBar.tsx | 玩家头像(金色圆圈+首字)、姓名、官职、年龄/健康/压力；角色切换下拉 |
| 3 | TimeControl | TimeControl.tsx | 年号日期(大唐 咸通X年 X月X日) + 时代标签(治世/危世/乱世色块) + 播放/暂停 + 3 档速度色块 |
| 4 | SideMenu | SideMenu.tsx | 9 个 emoji 图标按钮(政体/领地/军事/官职/廷臣/计谋/派系/决议/活动)，打开各大面板 |
| 5 | ChronicleButton | ChronicleButton.tsx | 📜 图标，点击打开史书面板 |

---

## 3. 地图层

| # | 组件 | 文件 | 显示内容 |
|---|------|------|----------|
| 6 | GameMap | GameMap.tsx (533行) | Voronoi SVG 地图：州填色(60+势力色) + 道/州边境线 + 道路/水路虚线 + 关隘标注 + 行营兵棋(方块+状态图标) + 行军路线 + hover tooltip + 点击选中(金边) |

### 地图视觉层次（底→顶）

1. 势力底色背景
2. 州填色多边形
3. 边境线(玩家金色/主要暗色/次要浅色)
4. 道路/水路网络
5. 文字标注(州名 + 关隘名)
6. 行军路线(虚线 + 目的圆圈)
7. 行营兵棋(方块 + 状态 → ⚑ ⊕)
8. Hover tooltip

---

## 4. 地图浮层

| # | 组件 | 文件 | 位置 | 内容 |
|---|------|------|------|------|
| 7 | AlertBar | AlertBar.tsx | 左上 | 行政任务通知：空缺官职/铨选审批/调兵审批/国库审批/召集参战 |
| 8 | EventToast | EventToast.tsx | 右中偏下 | 事件通知卡片(战斗/宣战/继位/城破/兵变等)，按性质着色边框，30天内最近5条 |
| 9 | WarOverlay | WarOverlay.tsx | 右下 | 当前战争状态：攻/守头像 + 战争分 + 参与方 |
| 10 | DrafterTokenOverlay | DrafterTokenOverlay.tsx | 左下 | 草拟人令牌(国库调度/调兵草拟)，仅草拟人可见 |

---

## 5. 主面板（SideMenu 触发，Modal 形式）

| # | 组件 | 文件 | 内容 |
|---|------|------|------|
| 11 | GovernmentPanel | GovernmentPanel.tsx | 政体：京官(中书门下/翰林/枢密等) + 地方官(按道→州层级树) |
| 12 | RealmPanel | RealmPanel.tsx | 领地：3 tab(领地列表/经济总览/体制政策)，含国库调拨行 |
| 13 | MilitaryPanel | MilitaryPanel.tsx | 军事：4 tab(军队总览/征兵/赏赐/战争)，含行营管理 |
| 14 | OfficialPanel | OfficialPanel.tsx | 官职：2 tab(我的官职/官署花名册)，含留后指定 |
| 15 | SchemePanel | SchemePanel.tsx | 计谋：活跃计谋列表 + 间谍信息 + 计谋限额 |
| 16 | DecisionPanel | DecisionPanel.tsx | 决议：可执行决议列表(称王/称帝/建镇/销毁等) |

---

## 6. 左侧人物面板

| # | 组件 | 文件 | 内容 |
|---|------|------|------|
| 17 | LeftPanel / CharacterPanel | LeftPanel.tsx + CharacterPanel.tsx | 人物详情：头像(金色块+首字)、姓名官职、能力六维(武/政/谋/外/学)、特质标签、Tab(家族/关系/臣属/外交)、交互按钮入口 |

---

## 7. 领地/行营弹窗

| # | 组件 | 文件 | 触发方式 | 内容 |
|---|------|------|----------|------|
| 18 | TerritoryPanel | TerritoryPanel.tsx | 点击地图州 | 州详情：控制者、人口、建筑、国库、岗位列表 |
| 19 | CampaignPopup | CampaignPopup.tsx | 点击地图兵棋 | 行营管理：军队组成/加减军/换帅/出征/战术 |

---

## 8. 交互流程（多步向导，Modal 形式）

| # | 组件 | 文件 | 场景 |
|---|------|------|------|
| 20 | AppointFlow | AppointFlow.tsx | 任命官员(选地方/中央→展开层级→选岗) |
| 21 | SelectionFlow | SelectionFlow.tsx | 候选人选择(升调/平调/新授分类) |
| 22 | DeclareWarFlow | DeclareWarFlow.tsx | 宣战(选CB→选目标→确认) |
| 23 | SchemeInitFlow | SchemeInitFlow.tsx | 发起计谋(选类型→选目标→选方法→AI评估→确认) |
| 24 | DismissFlow | DismissFlow.tsx | 罢免确认 |
| 25 | RevokeFlow | RevokeFlow.tsx | 剥夺领地确认 |
| 26 | ReassignFlow | ReassignFlow.tsx | 调任(选目标岗位) |
| 27 | UsurpPostFlow | UsurpPostFlow.tsx | 篡夺(花费/后果预览) |
| 28 | TransferVassalFlow | TransferVassalFlow.tsx | 转移臣属(选接收者) |
| 29 | DemandRightsFlow | DemandRightsFlow.tsx | 逼迫授权(成功率/后果) |
| 30 | CentralizationFlow | CentralizationFlow.tsx | 议定进奉(税级选择) |
| 31 | TransferChildrenFlow | TransferChildrenFlow.tsx | 法理下级转移确认 |
| 32 | TransferPlanFlow | TransferPlanFlow.tsx | 铨选方案审批(层级列表+逐条操作) |
| 33 | ReviewPlanFlow | ReviewPlanFlow.tsx | 考课罢免审批 |
| 34 | DeployApproveFlow | DeployApproveFlow.tsx | 调兵审批 |
| 35 | TreasuryApproveFlow | TreasuryApproveFlow.tsx | 国库调拨审批 |

---

## 9. 事件/对话

| # | 组件 | 文件 | 内容 |
|---|------|------|------|
| 36 | EventModal | EventModal.tsx | 故事事件决策：左侧角色卡(头像+好感+特质) + 右侧叙事 + 多选项(hover 预览效果) |
| 37 | InteractionMenu | InteractionMenu.tsx | 人物交互菜单(右键/按钮触发)：可用交互列表 |

---

## 10. 信息弹窗

| # | 组件 | 文件 | 内容 |
|---|------|------|------|
| 38 | BattleDetailModal | BattleDetailModal.tsx | 战斗详报：阵型/交锋/追击各阶段 + 伤亡 + 策略 |
| 39 | DecisionDetailModal | DecisionDetailModal.tsx | 决议详情：条件/花费/配置选项 |
| 40 | OpinionPopup | OpinionPopup.tsx | 好感度分解(家族/政策/正统性/事件等各项) |
| 41 | EraPopup | EraPopup.tsx | 时代详情(当前时代效果/触发条件) |
| 42 | TreasuryTransferModal | TreasuryTransferModal.tsx | 国库调拨(选源→选目标→填金额) |
| 43 | BuildMenu | BuildMenu.tsx | 建筑建造选择(可建列表+花费+工期) |
| 44 | ChroniclePanel | chronicle/ChroniclePanel.tsx | 史书浏览：年史内容 + AI 设置 + 编辑模式 |
| 45 | SchemeDetailPanel | SchemeDetailPanel.tsx | 计谋详情(进度/快照/成功率/方法) |

---

## 11. 系统界面

| # | 组件 | 文件 | 内容 |
|---|------|------|------|
| 46 | SystemMenu | SystemMenu.tsx | 系统菜单(ESC)：存档/读档/导出/导入/新游戏 |
| 47 | SaveDialog | SaveDialog.tsx | 命名存档(输入框 + 默认名) |
| 48 | LoadDialog | LoadDialog.tsx | 读取存档列表(名称+时间+删除) |
| 49 | GameOverScreen | GameOverScreen.tsx | 王朝覆灭全屏(⚱图标+死因+新游戏按钮) |
| 50 | SaveErrorToast | SaveErrorToast.tsx | 存档失败提示 |

---

## 12. 当前视觉技术栈

| 项目 | 现状 |
|------|------|
| 样式方案 | TailwindCSS 4.2 + CSS 变量(index.css) |
| 设计 token | 仅 :root 变量(颜色/字号/圆角/阴影)，无完整设计系统 |
| 字体 | Noto Serif SC / Source Han Serif CN / SimSun (宋体) |
| 图标 | 系统 emoji (🏛⚔📜🗺👤🎯🤝📋🎭💰🌾⭐⚔🏯等) |
| 颜色基调 | 深蓝黑底(#1a1a2e) + 暖金强调(#c9a959) + 米色文字(#e0d5c1) |
| 动画 | 仅 slide-in-right (350ms) + transition-colors |
| 头像 | 金色/深色方块 + 姓氏首字 |
| 面板风格 | 统一 modal-panel/ui-panel utility + 1px border |
| 地图 | d3-delaunay Voronoi + SVG clipPath + 60色填充 |
| 纹理/装饰 | 无 |
| 资源文件 | /public/favicon.svg + /public/icons/ (基本为空) |

---

## 13. 组件数量统计

| 分类 | 数量 |
|------|------|
| 常驻 HUD | 5 |
| 地图 | 1 |
| 地图浮层 | 4 |
| 主面板 | 6 |
| 人物面板 | 1 |
| 领地/行营弹窗 | 2 |
| 交互流程 | 16 |
| 事件/对话 | 2 |
| 信息弹窗 | 8 |
| 系统界面 | 5 |
| **合计** | **50** |
