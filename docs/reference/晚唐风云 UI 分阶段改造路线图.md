# 《晚唐风云》UI 分阶段改造路线图

更新时间：2026-04-12
定位：执行路线 / 范围拆解

---

## 1. 目的

这份文档用于回答两个问题：

- 目前项目的 UI 到底有哪些地方需要改造？
- 这些改造应该按什么阶段推进，才能减少返工并稳定提升品质？

本路线图基于当前项目代码结构梳理，不是抽象建议，而是面向后续开发排期的执行文档。

---

## 2. 当前 UI 的主要问题

从整体上看，当前 UI 的问题不是“功能不够”，而是“视觉体系尚未建立”。

具体表现为：

- 全局视觉基础还停留在原型阶段。
- 地图、面板、弹窗、流程页之间缺少统一语言。
- 高频区已经可用，但缺乏产品感和仪表感。
- 核心面板的信息组织还比较“数据堆叠”。
- 业务流程面板较多，但样式模板未统一。
- 地图覆盖层已有雏形，但还没有与整体美术方向整合。
- 图标系统仍大量依赖 emoji，严重影响完成度。

因此，本次改造必须以“建立系统”而不是“局部美容”为原则。

---

## 3. 需要改造的 UI 范围

建议把当前 UI 改造范围分为 8 个板块。

## 3.1 全局视觉基础

相关位置：

- `src/index.css`
- 基础颜色变量
- 基础字体与字号
- 阴影、边框、圆角、间距规则
- 全局 icon 规范

当前问题：

- 只有基础 token，没有完整设计系统
- 整体仍偏“深蓝原型面板风”
- 缺乏晚唐题材应有的材质与语义层级

改造目标：

- 建立全局视觉规范
- 为后续所有页面统一提供设计基础

---

## 3.2 主界面外框

相关位置：

- `src/ui/layouts/GameLayout.tsx`

当前问题：

- 功能区域已经齐全，但整体更像拼装容器
- 主次关系还不够明确
- 缺少“成品主界面”的结构节奏

改造目标：

- 明确整屏层级关系
- 让地图区、左栏、右栏、顶部、底部形成统一主界面壳子

---

## 3.3 高频仪表区

相关位置：

- `src/ui/components/ResourceBar.tsx`
- `src/ui/components/BottomBar.tsx`
- `src/ui/components/TimeControl.tsx`
- `src/ui/components/SideMenu.tsx`
- `src/ui/components/SystemMenu.tsx`

当前问题：

- 高频入口都可用，但缺少强辨识度
- 资源栏和底栏更像开发期状态区
- 右侧菜单更像普通工具栏，不像核心系统入口

改造目标：

- 建立“仪表系统”与“系统入口”的成品感
- 提升玩家第一眼的完成度感受

---

## 3.4 核心信息面板

相关位置：

- `src/ui/components/CharacterPanel.tsx`
- `src/ui/components/TerritoryPanel.tsx`
- `src/ui/components/RealmPanel.tsx`
- `src/ui/components/GovernmentPanel.tsx`
- `src/ui/components/OfficialPanel.tsx`
- `src/ui/components/MilitaryPanel.tsx`

当前问题：

- 信息很多，但视觉叙事弱
- 层级不足，模块像并排堆叠
- 没有形成“档案感 / 官署感 / 军政感”

改造目标：

- 把核心面板做成项目视觉代表作
- 强化人物、领地、军政的身份表达与信息秩序

---

## 3.5 系统弹窗与基础组件

相关位置：

- `src/ui/components/base/Button.tsx`
- `src/ui/components/base/Modal.tsx`
- `src/ui/components/base/ModalHeader.tsx`
- `src/ui/components/EventModal.tsx`
- `src/ui/components/SystemMenu.tsx`

当前问题：

- 基础组件视觉表达还比较通用
- 弹窗之间缺乏风格分型
- 没有形成“系统弹窗 / 事件弹窗 / 决策弹窗”的区别

改造目标：

- 先统一最底层组件风格
- 为流程面板和业务弹窗提供统一样式基座

---

## 3.6 流程型面板

相关位置：

- 各类 `*Flow.tsx`
- `SelectionFlow.tsx`
- `TransferPlanFlow.tsx`
- `DeployApproveFlow.tsx`
- `TreasuryApproveFlow.tsx`
- `ReviewPlanFlow.tsx`
- 以及任命、调兵、审批、提案等流程组件

当前问题：

- 数量很多
- 功能很强，但样式模式还没统一
- 如果逐页单独重做，后期极易失控

改造目标：

- 把流程 UI 收敛成有限的几种模板
- 提高后续扩展效率，降低视觉碎片化风险

---

## 3.7 地图覆盖层 UI

相关位置：

- `src/ui/components/GameMap.tsx`
- `src/ui/components/AlertBar.tsx`
- `src/ui/components/EventToast.tsx`
- `src/ui/components/WarOverlay.tsx`
- `src/ui/components/DrafterTokenOverlay.tsx`

当前问题：

- 功能覆盖层已经不少
- 但地图表现与覆盖层风格尚未真正统一
- 与未来 `100州 + 30道` 的结构升级高度耦合

改造目标：

- 让地图不仅“能交互”，还具备强产品感
- 让战争、提醒、行军、重点信息与新版地图统一气质

---

## 3.8 文字与叙事型界面

相关位置：

- `src/ui/components/chronicle/ChroniclePanel.tsx`
- 各类事件文字区
- tooltip 与说明文字

当前问题：

- 有一定功能基础
- 但尚未发挥题材优势

改造目标：

- 让文书、史书、事件成为项目差异化亮点

---

## 4. 改造阶段建议

建议按 5 个阶段推进，而不是同时铺开。

## 4.1 阶段 A：先建立设计系统

目标：

- 统一视觉规则
- 不急于全量改页面

主要工作：

- 重做 `index.css` 的 token 体系
- 明确颜色、字体、图标、边框、阴影、状态色
- 规定面板、按钮、tooltip、tab 的分型方式

原因：

- 如果没有设计系统，后面每改一个页面都容易重新发明一遍样式

产出物：

- 设计 token
- 组件样式规范
- 图标风格规范

---

## 4.2 阶段 B：优先重做主界面高频区

目标：

- 先提升玩家第一眼的完成度

建议优先改造：

1. `ResourceBar`
2. `SideMenu`
3. `BottomBar`
4. `TimeControl`
5. `SystemMenu`

原因：

- 这些区域出现频率最高
- 改完后，整体项目观感会立刻提升

这一阶段不追求：

- 全项目统一
- 所有业务面板同时翻新

---

## 4.3 阶段 C：重做核心面板

目标：

- 建立项目的“代表性页面”

建议顺序：

1. `CharacterPanel`
2. `TerritoryPanel`
3. `GovernmentPanel`
4. `MilitaryPanel`
5. `RealmPanel / OfficialPanel`

原因：

- 这些面板最能体现你们项目的题材和系统深度
- 也是玩家最容易记住的 UI 区域

这一阶段重点：

- 信息层级
- 模块分段
- 身份感、权力感、制度感

---

## 4.4 阶段 D：统一流程型面板

目标：

- 把业务流程 UI 系统化

建议方式：

- 先抽象出 3 到 4 类模板
- 再把各个 `Flow` 面板逐步迁移

建议模板：

- 选择型
- 审批型
- 提案型
- 结果/确认型

原因：

- 流程面板数量多，不适合逐个重新设计
- 模板化能显著降低长期维护成本

---

## 4.5 阶段 E：地图覆盖层与新版地图统一落地

目标：

- 把地图区打磨成真正的核心舞台

适合改造的前提：

- `100州 + 30道` 骨架基本稳定
- 地图标签密度、边界密度、图标密度已可预期

建议此阶段再改：

- `GameMap`
- `AlertBar`
- `EventToast`
- `WarOverlay`
- `DrafterTokenOverlay`

原因：

- 这些内容和地图规模强相关
- 如果太早重做，州数变化后会大量返工

---

## 5. 推荐的执行批次

如果要更具体地开工，建议分成以下批次。

### 第一批

- `src/index.css`
- `src/ui/components/base/Button.tsx`
- `src/ui/components/base/Modal.tsx`
- `src/ui/components/base/ModalHeader.tsx`

目标：

- 先打底层基础

### 第二批

- `ResourceBar.tsx`
- `SideMenu.tsx`
- `BottomBar.tsx`
- `TimeControl.tsx`
- `SystemMenu.tsx`

目标：

- 先改变主界面第一印象

### 第三批

- `CharacterPanel.tsx`

目标：

- 做出一个高质量样板页

### 第四批

- `TerritoryPanel.tsx`
- `GovernmentPanel.tsx`
- `MilitaryPanel.tsx`
- `RealmPanel.tsx`
- `OfficialPanel.tsx`

目标：

- 建立核心面板家族风格

### 第五批

- 各类 `Flow` 面板

目标：

- 把流程系统模板化

### 第六批

- `GameMap.tsx`
- `AlertBar.tsx`
- `EventToast.tsx`
- `WarOverlay.tsx`
- 地图相关覆盖层

目标：

- 与新版地图统一完成总整合

---

## 6. 阶段安排的原则

本路线图遵循以下原则：

### 6.1 先统一语言，再统一页面

先做基础设计系统，避免每个页面自己长一套风格。

### 6.2 先改高频区域，再改低频业务页

先让用户最常看到的部分变好，收益最高。

### 6.3 先改不依赖地图规模的部分

避免在 `100州 + 30道` 未稳定前，大规模重做地图相关 UI。

### 6.4 先做样板，再推广

尤其建议先把 `CharacterPanel` 做成标杆页面，后续其他核心面板按同一体系推进。

---

## 7. 不建议的推进方式

- 不建议所有组件一起动
- 不建议逐页零散修饰
- 不建议跳过设计系统直接做页面翻新
- 不建议在地图骨架未稳定前重做地图覆盖层细节
- 不建议让每个流程面板独立设计一套样式

---

## 8. 结论

《晚唐风云》的 UI 改造，适合采用“基础系统先行、高频区优先、核心面板树样板、流程页模板化、地图区后整合”的路线。

最推荐的阶段顺序是：

1. 设计系统
2. 主界面高频区
3. 核心面板
4. 流程面板
5. 地图覆盖层

这样推进的好处是：

- 返工少
- 效果稳定
- 团队能持续看到阶段性成果
- 最终能和新版地图实现统一落地
