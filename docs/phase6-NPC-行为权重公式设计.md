# 《晚唐风云》NPC 行为权重公式设计（基于 CK3 模式）

本文档基于 CK3 的 `Base + Modifiers` 权重设计模式，为《晚唐风云》Phase 6 缺失的六个核心 NPC 行为模块设计了完整的权重计算公式。

所有公式均遵循以下标准化结构：
`Weight = (Base + Sum(AddModifiers)) * Product(FactorModifiers)`

其中，八维人格（`boldness`, `greed`, `rationality`, `honor`, `vengefulness`, `compassion`, `zeal`, `energy`）的值域为 `[-1.0, 1.0]`。

---

## 1. 宣战行为（declareWarBehavior）

**触发前提**：角色是统治者（`isRuler`），且存在合法的宣战理由（相邻或有宣称）。

**设计意图**：宣战是极高风险行为，基础权重必须为 0。只有在胆识过人、极度贪婪或实力绝对碾压时才会触发。理性高的人会压制冲动。
根据对 CK3 `war_goals` 系统的分析，宣战行为应区分不同的宣战理由（Casus Belli），并引入频率控制（ai_check_interval）。

*   **频率控制 (ai_check_interval)**: 节度使级别 NPC 每 24 个月检查一次宣战意愿，刺史级别每 36 个月检查一次，以避免频繁的战争判定消耗性能并导致天下大乱。
*   **Base Weight (按宣战理由区分)**:
    *   武力兼并 (Conquest): `0` (高风险，完全依赖人格和实力驱动)
    *   法理宣称 (De Jure Claim): `20` (有合法性背书，基础意愿较高)
    *   独立战争 (Independence): `0` (极高风险)
*   **Add Modifiers (人格连续值驱动 - ai_value_modifier 风格)**:
    *   `+ (boldness * 50)` (如果 boldness > 0)
    *   `+ (greed * 30)` (如果 greed > 0)
    *   `+ (vengefulness * 40)` (如果 vengefulness > 0)
    *   `- (rationality * 40)` (如果 rationality > 0，理性压制战争冲动)
    *   `- (compassion * 30)` (如果 compassion > 0，仁慈压制战争冲动)
*   **Add Modifiers (实力与关系驱动)**:
    *   `+ 50` (如果己方兵力 > 敌方兵力 * 2)
    *   `+ 100` (如果己方兵力 > 敌方兵力 * 3)
    *   `- 50` (如果己方兵力 < 敌方兵力)
    *   `- (opinion * 0.5)` (如果对目标好感度 > 0，好感越高越不想打)
*   **Factor Modifiers (硬性否决)**:
    *   `* 0` (如果己方兵力 < 敌方兵力 * 0.5，绝对不打送死仗)
    *   `* 0` (如果国库资金 < 宣战花费，打不起)
    *   `* 0` (如果对目标好感度 > 80，绝对不打挚友)

---

## 2. 军事动员行为（mobilizeBehavior）

**触发前提**：角色处于战争状态（`isAtWar`），且作为攻方尚未创建行营，或作为防方领地被入侵。

**设计意图**：这是宣战后的**强制配套行为**。一旦开战，NPC 必须立刻动员，不需要考虑人格，权重应设为无限大。

*   **Base Weight**: `Infinity` (强制执行，且不消耗每月的 `maxActions` 额度)
*   **执行逻辑**：
    *   自动调用 `executeCreateCampaign` 组建行营。
    *   自动挑选军事能力最高的将领担任都统。
    *   攻方：自动将行军目标设定为最近的敌方州。
    *   防方：自动将行军目标设定为被围攻的己方州。

---

## 3. 征兵与补员行为（recruitBehavior）

**触发前提**：角色是统治者，且当前总兵力低于兵力上限的 80%。

**设计意图**：和平时期缓慢补兵，战争时期紧急爆兵。贪财的人会为了省钱而拒绝征兵。

*   **Base Weight**: `30`
*   **Add Modifiers (状态驱动)**:
    *   `+ 50` (如果处于战争状态 `isAtWar`)
    *   `+ 30` (如果当前兵力 < 上限的 50%)
*   **Add Modifiers (人格驱动)**:
    *   `- (greed * 50)` (如果 greed > 0，越贪财越不想花钱养兵)
    *   `+ (boldness * 20)` (如果 boldness > 0，尚武者喜欢扩军)
*   **Factor Modifiers (硬性否决)**:
    *   `* 0` (如果国库资金 < 征兵花费)
    *   `* 0` (如果粮食储备 < 征兵所需粮食)

---

## 4. 赏赐行为（rewardBehavior）

**触发前提**：角色是统治者，且麾下有军队士气低于 50。

**设计意图**：花钱买平安。理性的人会主动赏赐防止兵变，贪财的人宁可冒兵变风险也不发钱。

*   **Base Weight**: `40`
*   **Add Modifiers (状态驱动)**:
    *   `+ 40` (如果士气 < 30，兵变迫在眉睫)
    *   `+ 20` (如果处于战争状态，战时更需要士气)
*   **Add Modifiers (人格驱动)**:
    *   `+ (rationality * 40)` (如果 rationality > 0，理性者懂得花钱消灾)
    *   `+ (compassion * 20)` (如果 compassion > 0，体恤下属)
    *   `- (greed * 80)` (如果 greed > 0，极度贪财者宁死不拔毛)
*   **Factor Modifiers (硬性否决)**:
    *   `* 0` (如果国库资金 < 赏赐花费)

---

## 5. 建设行为（buildBehavior）

**触发前提**：角色是统治者，且领地内有空余建筑槽位。

**设计意图**：和平时期的日常发展行为。勤勉（energy 高）和理性的人更喜欢种田。

*   **Base Weight**: `50`
*   **Add Modifiers (人格驱动)**:
    *   `+ (energy * 30)` (如果 energy > 0，勤政爱民)
    *   `+ (rationality * 30)` (如果 rationality > 0，注重长远发展)
    *   `- (greed * 40)` (如果 greed > 0，守财奴不愿投资基建)
*   **Add Modifiers (状态驱动)**:
    *   `- 50` (如果处于战争状态，战时无心种田)
*   **Factor Modifiers (硬性否决)**:
    *   `* 0` (如果国库资金 < 建筑花费 * 1.5，必须留有余钱才建设)

---

## 6. 要求效忠行为（demandFealtyBehavior）

**触发前提**：角色是统治者，且目标领地在自己的法理管辖范围内，或目标无主。

**设计意图**：通过外交手段扩张势力。贪婪和胆识高的人喜欢扩张，但如果实力不够，会被理性压制。

*   **Base Weight**: `20`
*   **Add Modifiers (人格驱动)**:
    *   `+ (greed * 40)` (如果 greed > 0，渴望更多附庸和税收)
    *   `+ (boldness * 30)` (如果 boldness > 0)
    *   `- (honor * 30)` (如果 honor > 0，尊崇礼法，不愿强迫他人)
*   **Add Modifiers (实力与关系驱动)**:
    *   `+ 50` (如果己方兵力 > 敌方兵力 * 3，绝对威压)
    *   `+ (opinion * 0.3)` (如果对目标好感度 > 0，更倾向于和平收编而非武力兼并)
*   **Factor Modifiers (硬性否决)**:
    *   `* 0` (如果己方兵力 < 敌方兵力，弱者无权要求效忠)
    *   `* 0` (如果处于战争状态，战时无暇顾及外交)

---

## 7. 和谈/求和行为（peaceBehavior）- P1 优先级

**触发前提**：角色处于战争状态（`isAtWar`）。

**设计意图**：战争不能无限进行，当战局不利或战争目标已达成时，AI 必须能够主动提出和谈。

*   **频率控制 (ai_check_interval)**: 战争状态下每 3 个月检查一次。
*   **Base Weight**: `0`
*   **Add Modifiers (战局驱动)**:
    *   `+ (warScore * 1)` (如果作为攻方且 warScore > 50，倾向于见好就收)
    *   `+ (-warScore * 1.5)` (如果作为防方且 warScore < -30，战局不利倾向于求和)
    *   `+ (warDurationMonths * 2)` (战争持续时间越长，厌战情绪越高)
*   **Add Modifiers (人格驱动)**:
    *   `+ (rationality * 30)` (理性者更懂得止损)
    *   `- (boldness * 20)` (胆识高者更倾向于死战到底)
    *   `- (vengefulness * 30)` (复仇心重者不愿轻易放过敌人)
*   **Factor Modifiers (硬性否决)**:
    *   `* 0` (如果 warScore 在 -20 到 20 之间，且战争持续时间 < 12 个月，双方都在观望，不急于和谈)

---

## 8. 罢免行为（dismissBehavior）- P2 优先级

**触发前提**：角色是统治者，且麾下有官员。

**设计意图**：清理不合格或不忠诚的官员。

*   **Base Weight**: `0`
*   **Add Modifiers (关系与能力驱动)**:
    *   `+ 50` (如果官员对君主好感度 < -50，极度不忠)
    *   `+ 30` (如果官员能力远低于岗位要求)
*   **Add Modifiers (人格驱动)**:
    *   `+ (rationality * 20)` (理性者更看重能力)
    *   `- (compassion * 30)` (仁慈者不忍心罢免)
*   **Factor Modifiers (硬性否决)**:
    *   `* 0` (如果官员是权臣且君主实力不足，不敢罢免)

---

## 9. 指定继承人行为（designateHeirBehavior）- P2 优先级

**触发前提**：角色是统治者，且尚未指定继承人，或对当前继承人不满意。

**设计意图**：确保政权平稳过渡。

*   **Base Weight**: `10`
*   **Add Modifiers (年龄与健康驱动)**:
    *   `+ (age - 40) * 2` (年龄越大，越急于指定继承人)
    *   `+ 50` (如果身患重病)
*   **Add Modifiers (人格驱动)**:
    *   `+ (rationality * 30)` (理性者更注重传承)
*   **Factor Modifiers (硬性否决)**:
    *   `* 0` (如果没有合适的候选人)
