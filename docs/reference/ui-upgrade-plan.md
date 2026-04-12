# 《晚唐风云》UI 美术升级执行方案

> 更新时间：2026-04-12
> 定位：执行方案 / 决策记录

---

## 1. 目标风格

**晚唐舆图 + 官府文书 + 漆木金石**

- 地图区：古地图 / 舆图 / 行军图风格
- 系统面板：案牍 / 文书 / 军报风格
- 交互控件：木框 / 铜饰 / 印鉴 / 令牌
- 信息展示：保持策略游戏清晰度，包装为"制度化信息"

避免：
- 深蓝+圆角卡片的通用原型风格
- 纯欧式 CK3 复刻
- 大面积花纹堆叠导致可读性下降
- 高饱和糖果色势力配色

---

## 2. 色彩方案（已确认）

### 基础色（已应用）

```css
--color-bg: #12100e;           /* 墨黑 */
--color-bg-panel: #1c1713;     /* 暗木褐 */
--color-bg-surface: #2a2520;   /* 烟墨灰 */
--color-text: #ddd2bf;         /* 旧绢白 */
--color-text-muted: #9d917d;   /* 灰褐 */
--color-accent-gold: #b89a53;  /* 泥金 */
--color-accent-red: #a84535;   /* 朱砂（提亮版） */
--color-accent-green: #7a9e6d; /* 铜绿（提亮版） */
--color-accent-blue: #58718a;  /* 石青 */
--color-border: #4a3e31;       /* 暗铜褐 */
```

### 地图专用（预留，当前同通用值）

```css
--color-map-bg: #12100e;
--color-map-border: #4a3e31;
--color-map-label: #ddd2bf;
```

### 势力色原则

- 低饱和，偏矿物颜料/染料感
- 政治色像"罩染"，不是整块纯色填充
- 玩家势力独享较亮金色或暖金边界

---

## 3. 技术约束（已确认）

| 项目 | 决策 |
|------|------|
| 纹理 | PNG tile (256px seamless) + CSS 程序化，当前暂不全局铺开 |
| SVG 图标 | 统一 viewBox="0 0 24 24"，stroke=currentColor，strokeWidth=1.8 |
| 角色头像 | AI 批量生图(40-60张素材池) + 程序化选取，放最后批次 |
| 动画 | 纯 CSS transition/keyframe，不引入 framer-motion |
| SVG 滤镜 | 限小面积装饰，地图上不用 |
| 新依赖 | 禁止引入新 npm 依赖 |
| 字体 | 暂保持 Noto Serif SC，后期可分层（标题楷体/数字等宽） |

---

## 4. 已完成组件

### 4.1 全局色 Token（index.css）

10 个颜色变量从冷蓝换为暖黑墨色。所有组件通过 CSS 变量自动跟随。

### 4.2 ResourceBar（资源栏）

- 书简浮层造型（右上角浮在地图上，左侧渐隐露出地图）
- 4 组分隔：国库 / 私产 / 声望 / 军事
- 6 种 SVG 图标：开元通宝(钱) / 斗(粮) / 官帽(名望) / 玉玺印面(正统) / 交叉双剑(兵力) / 城池(领地)
- 单位：钱=贯，粮=斛
- 上下排列：主值在上，月变动在下（正白色半透明，负红色）
- hover 反馈：浅色底高亮
- 史书/系统按钮整合入右端

### 4.3 Tooltip（base/Tooltip.tsx）

- 通用 passive tooltip，支持 top/bottom/left/right 四方向
- 视口边界自动翻转
- 150ms 显示延迟，即时隐藏
- Portal 渲染避免 overflow 裁切
- pointer-events: none（只读，可交互浮层未来建 Popover）

### 4.4 ResourceTooltip

- 资源栏专用 tooltip 内容
- 标题行 + 收支明细行（正绿负红）+ 可选合计行
- 支持 neutral 模式（白色数字，不带正负色）

### 4.5 SideMenu（侧边栏）

- 9 个 SVG 图标替换 emoji
- 暖黑渐变背景 + 内阴影
- 金色选中侧条 + hover 图标变金色
- 布局：顶部横梁一右到底，SideMenu 在横梁下方

---

## 5. 待做批次

### ~~第二批：高频 HUD 区~~ ✅

- ✅ BottomBar 拆解为 CK3 式左右浮动模块（不再全宽底栏）
- ✅ PlayerIdentityCard（左下浮动）：168×168 大头像 + 姓名/头衔双行 + 健康/压力条 + 家族/生活预留图标
- ✅ TimeControl（右下浮动）：时代标签 + 双行日期 + 色块速度控制，整合为一个令牌模块
- ✅ 空格暂停/恢复记忆上次速度（CK3 行为）

### 第三批：核心面板

- CharacterPanel 做样板 → TerritoryPanel / GovernmentPanel / MilitaryPanel / RealmPanel / OfficialPanel 跟进
- 信息层级强化，模块分段，身份感/权力感/制度感

### 第四批：流程面板模板化

- 16 个 Flow 收敛为 3-4 种模板：选择型 / 审批型 / 提案型 / 确认型

### 第五批：地图数据扩展

- 72 → 100 州 + 30 道
- 新增州数据（位置/邻接/所属道/初始角色）

### 第六批：地图分层重构

- Voronoi 降级为逻辑骨架（碰撞/邻接/归属）
- 新增地理表现层：底图纹理 / 政治罩染 / 边界线 / 河流山脉 / 标注层
- 新增地图锚点层：标签/军队/州府/关隘位置独立于 Voronoi 质心

### 第七批：角色头像

- AI 批量生图（统一构图：正面/微侧、肩以上、唐代服饰官帽）
- 40-60 张素材池，按性别 × 年龄段 × 品级分配
- 色调偏移避免重复

---

## 6. 参考游戏

| 学什么 | 参考 |
|--------|------|
| 地图层级与权力结构 | Crusader Kings III |
| 中国权力气质 | Total War: THREE KINGDOMS |
| 信息密度控制 | Old World |
| 材质与文书感 | Pentiment |
| 中国大地图空间感 | Oriental Empires |

详见 `reference/晚唐风云美术参考游戏清单.md`。

---

## 7. 面板分型规范

| 类型 | 适用 | 特征 |
|------|------|------|
| 主面板 | CharacterPanel / TerritoryPanel / GovernmentPanel / RealmPanel | 厚重，头部明确，允许装饰性边框 |
| 次级面板 | Flow 面板 / 列表 / 选择 | 克制，装饰少，重可读性 |
| 浮层 | Tooltip / Toast / 小悬浮框 | 轻快，阴影浅，不抢戏 |
| 仪表条 | ResourceBar / TimeControl / WarOverlay | 横向结构，数值优先 |

---

## 8. 关键文件路径

| 文件 | 用途 |
|------|------|
| `src/index.css` | 全局 token（颜色/字号/圆角/阴影/utility） |
| `src/ui/components/base/Tooltip.tsx` | 通用 tooltip 基础组件 |
| `src/ui/components/base/Button.tsx` | 按钮基础组件 |
| `src/ui/components/base/Modal.tsx` | 弹窗基础组件 |
| `src/ui/components/base/ModalHeader.tsx` | 弹窗头部 |
| `src/ui/components/icons/ResourceIcons.tsx` | 资源栏图标（6 个） |
| `src/ui/components/icons/MenuIcons.tsx` | 侧栏图标（9 个） |
| `src/ui/components/ResourceBar.tsx` | 资源栏 |
| `src/ui/components/ResourceTooltip.tsx` | 资源 tooltip 内容 |
| `src/ui/components/SideMenu.tsx` | 侧边栏 |
| `src/ui/components/PlayerIdentityCard.tsx` | 左下玩家身份牌（CK3 式） |
| `src/ui/components/TimeControl.tsx` | 右下时间管理器（浮动模块） |
| `src/ui/layouts/GameLayout.tsx` | 主布局 |
| `docs/reference/ui-inventory.md` | UI 完整清单（50 个组件） |
