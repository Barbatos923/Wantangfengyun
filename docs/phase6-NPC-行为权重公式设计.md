# 《晚唐风云》NPC 行为权重公式设计（基于 CK3 模式）

本文档基于 CK3 的 `Base + Modifiers` 权重设计模式，为《晚唐风云》Phase 6 缺失的六个核心 NPC 行为模块设计了完整的权重计算公式。

所有公式均遵循以下标准化结构：
`Weight = (Base + Sum(AddModifiers)) * Product(FactorModifiers)`

其中，八维人格（`boldness`, `greed`, `rationality`, `honor`, `vengefulness`, `compassion`, `zeal`, `energy`）的值域为 `[-1.0, 1.0]`。

---

## 1. 宣战行为（declareWarBehavior）

**触发前提**：角色是统治者（`isRuler`），且存在合法的宣战理由（相邻或有宣称）。

**设计意图**：宣战是极高风险行为，基础权重必须为 0。只有在胆识过人、极度贪婪或实力绝对碾压时才会触发。理性高的人会压制冲动。

*   **Base Weight**: `0`
*   **Add Modifiers (人格驱动)**:
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
