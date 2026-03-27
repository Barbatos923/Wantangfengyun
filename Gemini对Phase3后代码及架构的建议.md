《晚唐风云》Phase 3 架构审查与重构建议书
背景与目标
目前项目已成功推进至 Phase 3（军事系统），底层三层架构设计清晰，Zustand 状态管理与索引分离的实现表现良好。但在进入 Phase 4（继承与王朝周期）和 Phase 6（NPC 效用函数与指令驱动）之前，当前的单体结算架构存在严重的扩展性和性能隐患。

为确保系统在海量实体和复杂图灵完备逻辑下依然保持高可维护性与高性能，建议在当前阶段进行以下架构升级与代码重构。

一、 架构层面演进：重构结算管线 (Pipeline & Command Pattern)
1. 拆解巨型结算函数（Pipeline 模式）
现状：settlement.ts 中的 runMonthlySettlement 是一个长达数百行的上帝函数（God Function），包揽了从健康、压力、经济到战斗和围城的所有逻辑。
风险：系统间耦合过深。随着 Phase 4 和 Phase 6 的加入，该文件将极难维护。
建议：引入生命周期/管线（Pipeline）模式。将大结算拆分为独立的 System，按严格的优先级顺序调度。

TypeScript

// settlementScheduler.ts 架构示意
const settlementSystems = [
  runCharacterStatusSystem,    // 健康、压力、成长
  runTerritoryEconomySystem,   // 领地漂移、户数变化、经济结算
  runMilitaryMovementSystem,   // 行军、补给
  runMilitaryCombatSystem,     // 战斗与围城
  runNPCAISystem,              // Phase 6预留：AI决策
  runEventTriggerSystem        // 事件与清理
];

export function runMonthlySettlement(date: GameDate) {
  for (const sys of settlementSystems) {
    sys(date);
  }
}
2. 引入“读写分离”的指令队列（针对 Phase 6 预留）
风险：在未来的 NPC 决策循环中，如果直接修改 Store（例如 NPC A 决定向 NPC B 宣战并直接写入状态），会导致后续遍历到的 NPC 读取到突变后的状态，产生严重的“先手优势”和执行顺序依赖。
建议：采用指令（Command/Intent）模式。AI 决策阶段应只读取当前回合的只读快照（Snapshot），计算效用后生成并提交指令（如 DECLARE_WAR），在所有 AI 思考完毕后，由专门的执行器统一结算指令池并解决冲突。

二、 状态管理与性能优化
1. 优化 batchMutate 的全量索引重建
现状：CharacterStore 等模块中实现的 batchMutate，在执行回调后会触发 O(N) 级别的全量索引重建（如 aliveSet 和 vassalIndex）。
风险：在仅修改局部属性（如全员压力增加）而未涉及封臣变更或死亡时，全量重建索引会带来不必要的 CPU 开销。
建议：

引入增量更新机制，或让 mutator 标记发生了变动的字段类型。

推荐方案：在 Zustand 中引入 Immer 中间件，利用其 draft 机制自动处理结构共享，既能保持 mutate 写法的直观，又能避免手写且低效的深拷贝与全量索引重建。

2. 将领域计算逻辑从 Store 中剥离
现状：MilitaryStore 中的 mergeBattalions 方法内部包含了复杂的兵力、士气、精锐度的加权平均数学计算。
风险：Store 应该保持“轻量”和“愚蠢”，只负责数据的 CRUD。混合复杂业务计算不利于单元测试和代码复用。
建议：将所有数值计算逻辑提取为无副作用的纯函数（如放置在 militaryCalc.ts 中），Store 仅负责调用该函数并赋值。

3. 规避闭包快照导致的状态不一致
现状：在当前的 settlement.ts 结算长链条中，存在多次调用 getState() 的情况。
风险：如果在链条前部（如健康结算）发生角色死亡，链条后部的批量获取逻辑如果不严格重新获取最新状态，可能会读取到旧的快照，引发脏数据崩溃。
建议：在 Pipeline 拆分后，严格保证每个 System 在执行之初向 Store 获取最新提交（Committed）的状态，不要跨系统复用状态变量。

三、 游戏机制底层规范化
1. GameEvent 内存泄漏预警
现状：TurnManager 中的 events: GameEvent[] 数组将所有历史事件留存在内存中。
风险：大战略游戏一局可能产生数万至十万级事件。长期存在 Zustand 中会导致严重的内存泄漏、React 重渲染卡顿以及存档体积爆炸。
建议：Store 中仅保留用于 UI 展示的“最近一年”或“最近 N 条”事件。历史事件在月结/年结时，异步 flush（持久化）至 IndexedDB（结合 Phase 5 的史书管线需求）。

2. 引入伪随机数生成器（Seeded PRNG）
现状：代码中多处使用了原生的 Math.random()（如兵变概率、特质剥夺）。
风险：大战略游戏必须保证一定的可复现性（用于 Debug 或约束 S/L 行为），原生随机数无法通过 Seed 重建相同的随机序列。
建议：引入 Seeded PRNG 库（如 seedrandom）。将全局 seed 存入存档数据中，所有概率判定均使用该实例。

3. 规范化实体 ID 生成
现状：创建新军队等实体时，使用 `army-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` 的方式生成 ID。
建议：引入工业级发号器如 nanoid（体积小且极快）或 uuid，以彻底规避极小概率下的哈希碰撞，并统一项目内的实体标识规范。