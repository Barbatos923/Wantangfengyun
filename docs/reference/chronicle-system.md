# 史书系统参考

> CLAUDE.md 的"史书 emit 纪律"章节指向此文档。写入/调整任何政治格局类交互时读此文档。

## emit 纪律

任何会改变政治格局的 interaction / decision / NPC behavior，**execute 真正成功后（stale 校验通过且状态已写入）必须调 `emitChronicleEvent({...})` 推送 GameEvent**（在 `engine/chronicle/emitChronicleEvent.ts`，封装了 id / date / priority 样板）。

### priority 分级

- **主权变动**（归附 / 逼迫授权 / 称王称帝 / 继位 / 王朝覆灭 / 抗命剥夺） → `EventPriority.Major`
- **人事变动**（任命 / 罢免 / 调任 / 剥夺 / 转移臣属 / 留后指定 / 议定进奉 / 要求效忠） → `EventPriority.Normal` + 必须在 `chronicleService.ts:CHRONICLE_TYPE_WHITELIST` 加 type 字串
- **高频流水**（铨选 / 考课 / 政策调整 / 建造） → 默认不 emit；如需写入观察日志走 `debugLog`

### 自检三件事

1. **emit 在 stale 校验之后、状态写入之后**——否则会写出"成功但 store 未变"的虚假事件
2. **同一逻辑动作只 emit 一次**：上层（如 `executeRevoke` 成功）若已 emit 更精确事件，下层（如 `executeDismiss`）需用 `skipChronicleEmit` opt 避免重复
3. **字串与白名单严格对账**（grep `chronicleService.ts:CHRONICLE_TYPE_WHITELIST`）；NPC 半年/月度扫描类调用必须只在状态真正变化时 emit（避免 noop 噪音，参考 `executeDesignateHeir` 的 previousHeirId 比对）

### worldSnapshot 头衔聚合

`worldSnapshot.newTitles / destroyedTitles` 由 `freezeWorldSnapshot` 扫年内事件聚合，依赖 `NEW_TITLE_TYPES / DESTROYED_TITLE_TYPES` 两个 Set——新增头衔类事件时同步更新这两个 Set。

### 单月上限

单月事件超过 `MAX_EVENTS_PER_MONTH = 30` 会按 priority 倒序 + 时间正序截断，不必担心 prompt token 爆炸；但仍应避免高频流水类事件污染。

## 事件上下文卡片引擎

`engine/chronicle/chronicleEventContext.ts` 按事件类型为每个 actor 选取不同的上下文字段（**事件驱动，非全景灌注**）：

- **10 种字段**：`mainPost`（含皇帝特判） / `age` / `traits` / `abilities`（≥7 标签化） / `territory` / `military` / `allegiance` / `vassals` / `wars` / `family`
- **`EVENT_FIELD_MAP`**：22 种事件类型各有独立映射（如野战只给主将的性格 + 能力 + 效忠；归附给辖境 + 兵力 + 臣属）
- **`EventContextSnapshot`** 接口从 Store 冻结快照传入，纯函数不读 Store
- **`formatActorRoles()`**（在 `chroniclePromptBuilder.ts`）替代原来的扁平 `人物:X、Y`，按事件类型输出带角色标签

### 扩展规则

- 新增事件类型时：① `EVENT_FIELD_MAP` 加映射 ② `formatActorRoles` 加 case
- 新增字段类型时在 `FIELD_RENDERERS` 加渲染器

## 双层架构（起居注 → 年史）

- **月稿（起居注）**：起居注官人格，直接按事件 + 上下文卡片写文言编年体，允许适当发挥细节与延展
- **年稿（年史）**：史官人格，基于 12 篇起居注做汇总整理（合并叙述 / 主线提炼 / 史臣注 / 按语），**不重新翻译**
- 年稿 user prompt 仅含跨年按语 + 逐月起居注，**无 topPowers / dossiers**（token 全部留给起居注内容）
- **月稿缺失兜底（rawFallback）**：`waitForMonthDrafts` 30 秒超时后，缺失月稿的月份由 `collectMonthEvents` + `buildMonthPrompt` 构建原始事件文本，直接注入年稿 prompt（标注"原始事件记录"），YEAR_SYSTEM 已指示 LLM 以同等文言笔法处理

### 为什么保留月稿层

历史上试过合并为一次年稿调用反而更慢——双层保留，优化方向是分层模型（月稿用快模型、年稿用强模型）。
