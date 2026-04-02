# Phase 4：继承系统 + 王朝周期律 — 系统设计

## 一、继承系统

### 1.1 继承法类型

每个持有 `grantsControl` 岗位的角色都有一种继承法。继承法决定角色死亡时谁获得其岗位、领地绑定军队和附庸。

| 继承法 | 适用范围 | 规则 | 历史对应 |
| :--- | :--- | :--- | :--- |
| 嫡长子继承 | 默认，皇帝 | 按 `childrenIds` 顺序取第一个存活男性后代。无子则兄弟→叔伯（父的存活子嗣） | 唐代正统 |
| 指定继承 | 集权4级解锁 | 角色生前通过交互指定 `designatedHeirId`。若指定人已死/不存在，fallback 到嫡长子 | 遗诏指定 |
| 牙兵推举 | 军事型藩镇默认 | 从该角色的直属军队兵马使（`commanderId`）中，选军事能力最高者。无兵马使则 fallback 嫡长子 | 河朔三镇 |

**数据结构变更：**

`Character` 新增字段：
```typescript
successionLaw: 'primogeniture' | 'designation' | 'military_election'
designatedHeirId?: string  // 仅 designation 法有效
```

**关键设计决策：**
- 继承法绑定在角色上而非领地上，因为同一领地可能被不同继承法的人持有。
- 军事型藩镇（`territoryType === 'military'` 的 `dao` 级 `grantsControl` 岗位持有者）初始为牙兵推举，民政型默认嫡长子。
- 玩家可在“调整权责”交互中修改自己的继承法（不是臣属的——臣属的继承法由臣属自己决定，集权4级时可帮臣属指定继承人）。

### 1.2 继承人决算函数

`resolveHeir(deadCharId) → string | null`

**优先级链：**
1. 按 `successionLaw` 执行对应规则。
2. 若规则返回 `null` → fallback 嫡长子。
3. 若仍 `null` → fallback 同族（`clan` 相同的存活角色中，年龄最大者）。
4. 若仍 `null` → 返回 `null`（无继承人 → 触发继承危机）。

### 1.3 死亡→继承流程

角色死亡时（`characterSystem` 中 `health ≤ 0`），按以下步骤：

1. **标记死亡**：`alive = false`, `deathYear = year`
2. **计算继承人**：`heir = resolveHeir(deadId)`
3. **如果 `heir` 存在**：
   - a. 转移岗位：`dead` 持有的所有 `grantsControl` 岗位 → `holderId = heir`
   - b. 军队自动跟随：`syncArmyOwnersByPost` 已保证（岗位换人→军队跟着走）
   - c. 附庸转移：所有 `overlordId === dead` 的角色 → `overlordId = heir`
   - d. 资源继承：`heir.resources += dead.resources`（钱粮）
   - e. 好感继承：对 `dead` 的好感 × 0.5 转为对 `heir` 的初始好感
   - f. 非 `grantsControl` 岗位：清空（幕僚不世袭）
4. **如果 `heir === null`**：
   - → 触发继承危机（见 1.4）
5. **如果 `dead.isPlayer`**：
   - a. 如果 `heir` 存在：切换玩家视角到 `heir`（`playerId = heir.id`）
   - b. 如果 `heir === null`：游戏结束（或让玩家选择一个角色继续）

### 1.4 继承危机

当 `resolveHeir` 返回 `null` 时：

**NPC 角色无继承人：**
- 岗位空缺，`overlord`（上级）自动接管岗位（类似罢免效果）。
- 附庸归属上级。
- 若无上级（独立势力），岗位空缺等待他人占领。

**多竞争者情况（Phase 4 简化版，不做内战事件链）：**
- 牙兵推举如果有多个军事能力相同的兵马使 → 取第一个（按 `armyId` 排序确定性）。
- 后续 Phase 可扩展为内战事件。

### 1.5 “留后”机制

角色需要有后代才能传承。当前 `childrenIds` 大多为空。

**生育机制（简化版）：**
- 每年正月检查：有配偶（`spouseId`）且配偶存活的角色。
- 生育概率：基于年龄。20-35岁 = 30%/年，35-45岁 = 15%/年，45+ = 5%/年。
- 生成子嗣：随机性别，继承父母 `clan`，调用 `generateAbilities(father, mother)` 生成能力值。
- 子嗣加入 character pool，6岁获得性格特质，16岁获得教育特质（现有机制自动生效）。

**数据**：需要一个名字池（男名/女名），按 `clan` 或随机取名。

---

## 二、王朝周期律

### 2.1 状态机

治世 (ZhiShi) ←→ 危世 (WeiShi) ←→ 乱世 (LuanShi)

转换由诱因积分（instability score）驱动，月度累积，达阈值触发。

### 2.2 诱因积分

`instabilityScore: number`，存储在 `TurnManager` 中，每月结算时更新。

**月度积分变化来源：**

| 诱因 | 每月积分 | 说明 |
| :--- | :--- | :--- |
| 活跃战争数 | +2/场 | 有 active 状态的战争 |
| 空缺 grantsControl 岗位 | +1/个 | `holderId === null` 的控制岗位 |
| 破产角色数 | +1/人 | `resources.money < -50000` 或 `grain < -50000` |
| 平均民心 < 40 | +3 | 所有州 `populace` 均值低于 40 |
| 皇帝健康 < 30 | +2 | 玩家/天子角色健康低 |
| 无战争且无空缺 | -3 | 稳定局面恢复分 |
| 平均民心 > 70 | -2 | 民心高恢复分 |

### 2.3 时代转换阈值

| 当前时代 | 转换方向 | 阈值条件 |
| :--- | :--- | :--- |
| 治世 → 危世 | `instabilityScore ≥ 150` | 累积不稳定 |
| 危世 → 乱世 | `instabilityScore ≥ 300` | 持续恶化 |
| 危世 → 治世 | `instabilityScore ≤ 50` | 局面稳定 |
| 乱世 → 危世 | `instabilityScore ≤ 150` | 局面好转 |

**初始值**：游戏开始时 `instabilityScore = 100`（危世起步）。

### 2.4 时代全局效果

| 效果 | 治世 | 危世 | 乱世 |
| :--- | :--- | :--- | :--- |
| 人口增长率修正 | +50% | 0 | -30% |
| 税收修正 | +20% | 0 | -20% |
| 士气衰减修正 | -0.5/月（额外） | 0 | +1/月（额外） |
| 征兵恢复速度 | +30% | 0 | -20% |
| 宣战声望惩罚 | 重（已实现） | 中（已实现） | 轻（已实现） |
| 兵变概率修正 | ×0.5 | ×1 | ×1.5 |

这些修正需要注入到现有的各 System 中——`populationSystem`、`economySystem`、`militarySystem`。由于已经拆好了 Pipeline，每个 System 入口处读取当前 Era 并应用修正即可。

### 2.5 时代转换事件

**危世 → 乱世：“天下大乱”**
- GameEvent 记录
- 所有角色士气 -10
- 所有州 populace -5

**乱世 → 危世：“渐归安定”**
- GameEvent 记录

**危世 → 治世：“天下太平”**
- GameEvent 记录
- 所有角色士气 +10

---

## 三、“天下”头衔与新朝

### 3.1 规则

目前皇帝（`char-yizong`）隐式拥有“天下”。Phase 4 中显式化：

- “天下”是一个特殊的 Post：`post-emperor`，绑定在 `guo-tang`（唐国）上。
- 任何角色如果控制了全部 5 国中的 3 国以上的首府州（法理领地 50%+），可以“创设天下”头衔 → 建立新朝。
- 新朝建立：创建新的 `post-emperor`，旧朝 post 废除。
- 简化版 Phase 4 中不实现创设，只保留现有唐朝天子，继承正常走。

### 3.2 玩家死亡 → 游戏结束条件

- 玩家角色死亡 + 无继承人 → 弹出“王朝覆灭”界面。
- 提供选项：选择一个存活角色继续游戏（类似 CK3 的 game over 但可切角色）。

---

## 四、实施分阶段建议

### 4a：核心继承（最优先）

- `Character` 新增 `successionLaw`, `designatedHeirId` 字段。
- 实现 `resolveHeir()` 纯函数。
- 改造 `characterSystem` 死亡流程：岗位/军队/附庸/资源转移。
- 玩家死亡 → 视角切换。
- 最简生育（每年概率生子，名字池）。

### 4b：王朝周期律

- `TurnManager` 新增 `instabilityScore` 字段。
- 新建 `eraSystem.ts`（插入 settlement pipeline）。
- 诱因月度计算 + 阈值触发时代转换。
- 各 System 读取 Era 应用修正。

### 4c：UI + 交互完善

- 继承法切换（在“调整权责”或领地面板中）。
- 指定继承人交互。
- 时代转换事件弹窗。
- 角色死亡/继承动画/通知。
- 王朝覆灭界面。
