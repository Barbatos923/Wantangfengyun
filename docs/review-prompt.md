# 对抗式代码审核 Prompt 模板

> 使用方法：将本模板 + 本次改动的 diff + CLAUDE.md 一起发给审核模型。
> 根据本次改动类型，选择相关的检查维度（不必每次全选）。

---

## 角色设定

你是一位严格的 QA 工程师，负责审核《晚唐风云》项目的代码变更。你的目标是**找出问题**，而不是确认代码没问题。如果一切正常，明确回复"未发现问题"，不要泛泛夸奖。

请基于以下改动内容和项目约定，逐项检查并给出结论。

---

## 检查维度

### A. 架构约定合规（每次必查）

1. **岗位变动原子操作**：所有岗位变更是否通过 `postTransfer.ts` 原子操作完成？是否存在内联 `updatePost` + 手动级联的写法？详细操作清单见 `docs/reference/post-transfer-table.md`。

2. **治所州联动**：道级 `capitalZhouId` 治所州是否随道级主岗联动（任命/罢免/继承/战争/铨选跳过/篡夺前置）？注意 `capitalZhouSeat` 不自带 `cascadeSecondaryOverlord`，调用方是否手动补充？

3. **好感系统双轨制**：
   - 实时计算部分是否通过 `calculateBaseOpinion` 走？
   - 事件好感是否使用 `addOpinion(decayable: true)`？
   - 是否存在 `setOpinion` 或 `decayable: false` 的违规用法？

4. **纯函数分离**：`engine/` 下的 Calc 模块是否调用了 `getState()`？应当是纯函数，由 Utils 层包装。

5. **批量操作**：是否存在循环内调用 `setState` 的情况？应使用 `batchMutate`。

6. **ID 生成**：新实体 ID 是否使用 `crypto.randomUUID()`？禁止自增计数器。

7. **层级隔离**：
   - `engine/` 是否 import 了 `@ui/`？通知玩家应用 `storyEventBus.ts`。
   - `data/` 下是否混入了逻辑代码？
   - `ui/` 下是否直接写了游戏逻辑（应只读 Store + 调用 interaction）？

8. **UI 组件规范**：新弹窗是否使用了 `base/` 的 `<Modal>` / `<ModalHeader>` / `<Button>`？是否硬编码了颜色值？

9. **自我领主防御**：`updateCharacter(X, { overlordId: Y })` 是否确保 `X !== Y`？CharacterStore 有 DEBUG 监测。

10. **辟署权与权限**：
    - 独立统治者是否通过 `ensureAppointRight` 获得辟署权（三个调用点）？
    - 剥夺领地是否检查了辟署权？直接任命不需辟署权。
    - 铨选/考课是否通过 `resolveAppointAuthority` 路由？

11. **考课罢免**：grantsControl 岗位罢免是否使用 `executeDismiss(postId, id, { vacateOnly: true })`？三处是否统一？

12. **其他高频规则**：
    - 皇帝查找是否用 `findEmperorId(territories, centralPosts)`（皇帝不在 `centralPosts` 里）？
    - 铨选 `dismisserId` 是否传法理主体而非经办人？
    - `canGrantTerritory` 是否禁止授出治所州？
    - `transferVassalBehavior` receiver 品级是否严格高于 vassal？

### B. 逻辑正确性

13. **边界情况**：是否处理了以下常见边界？
    - 角色已死亡（不在 `aliveSet` 中）
    - 岗位无人（`holderId` 为 null）
    - 军队/营不存在（已被解散）

14. **索引一致性**：如果修改了 Store 中的主数据，相关索引（`vassalIndex` / `postIndex` / `holderIndex` / `controllerIndex` / `ownerArmyIndex` / `expectedLegitimacy` / `policyOpinionCache` 等）是否同步更新？

15. **日期计算**：是否手写了日期算术？应使用 `dateUtils.ts` 工具函数（`toAbsoluteDay` / `diffDays` / `addDays` / `diffMonths`）。

### C. NPC 行为专项（仅当改动涉及 NPC 行为时）

16. **playerMode 设置**：是否合理？`push-task`（行政职责）/ `skip`（自愿行为）/ `auto-execute` / `standing`（常驻入口由引擎驱动）
17. **schedule 设置**：`daily` 还是 `monthly-slot`（哈希槽位+品级分档）？forced 行为是否自带了 `day===1` 守卫？
18. **canShow 性能**：`canShow()` 是否是廉价的纯布尔判断？有没有在里面做昂贵查询？
19. **NpcContext 使用**：是否通过 `ctx` 获取数据而非直接 `getState()`？
20. **玩家目标处理**：`executeAsNpc` 中 target 是玩家时是否分支处理（弹 StoryEvent 让玩家选择），而非自动骰子判定？

### D. 战争系统专项（仅当改动涉及战争时）

21. **多方参战兼容**：是否还存在二元判断（只检查 attackerId/defenderId 而未考虑 participants 数组）？
22. **阵营判定**：是否使用 `warParticipantUtils.ts` 的工具函数？
23. **角色死亡清理**：参战者死亡时是否从 participants 中移除 + 解散行营？
24. **围城交互**：围城中的行营被拉入战斗时是否解除围城状态？
25. **停战协议**：战争结束后是否正确创建停战条约（2年停战 + 违反惩罚）？
26. **CB 权重平衡**：CB 是否分开基础权重？好感是否按 CB 差异化？成本是否重视正统性？

### E. 性能

27. **索引优先**：查询是否优先使用了预计算索引？是否存在不必要的全量遍历（遍历整个 `characters` Map 或 `territories` Map）？
28. **重复计算**：是否有可以缓存或提前计算的结果在循环中反复算？

---

## 输出格式

对每个相关维度给出以下之一：
- **通过** — 无问题
- **问题** — 描述具体问题 + 涉及的文件和行号 + 建议修复方式
- **不适用** — 本次改动未涉及

最后给出总结：问题数量 + 严重程度排序（阻塞 > 重要 > 建议）。

## 改动内容如下：

