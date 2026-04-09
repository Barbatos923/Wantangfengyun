// ===== 角色系统：健康/死亡/压力/成长 =====

import type { GameDate } from '@engine/types.ts';
import { EventPriority } from '@engine/types.ts';
import { useCharacterStore } from '@engine/character/CharacterStore.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';
import {
  calculateMonthlyHealthChange,
  calculateMonthlyStressChange,
  assignPersonalityTraits,
  assignEducationTrait,
  getEffectiveAbilities,
} from '@engine/character/characterUtils.ts';
import { clamp } from '@engine/utils.ts';
import { randInt } from '@engine/random.ts';
import { debugLog } from '@engine/debugLog';
import { resolveHeir, findParentAuthority, selectDesignatedHeir } from '@engine/character/successionUtils';
import { calcPersonality } from '@engine/character/personalityUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { positionMap } from '@data/positions';
import { useTurnManager } from '@engine/TurnManager';
import { useWarStore } from '@engine/military/WarStore';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { disbandParticipantCampaigns } from '@engine/interaction/withdrawWarAction';
import { executeDesignateHeir } from '@engine/interaction/centralizationAction';
import {
  seatPost,
  vacatePost,
  syncArmyForPost,
  capitalZhouSeat,
  capitalZhouVacate,
  refreshPostCaches,
  refreshLegitimacyForChar,
  ensureAppointRight,
} from '@engine/official/postTransfer';

export function runCharacterSystem(date: GameDate): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();

  // ===== 1. 角色健康结算（批量） =====
  const deadIds: string[] = [];
  charStore.batchMutate((chars) => {
    for (const char of chars.values()) {
      if (!char.alive) continue;
      const healthChange = calculateMonthlyHealthChange(char, date.year);
      const newHealth = clamp(char.health + healthChange, 0, 100);

      if (newHealth <= 0) {
        chars.set(char.id, { ...char, alive: false, deathYear: date.year });
        deadIds.push(char.id);
      } else if (newHealth !== char.health) {
        chars.set(char.id, { ...char, health: newHealth });
      }
    }
  });

  // ===== 死亡角色：岗位自治继承 =====
  const heirIds = new Set<string>(); // 收集所有继承人，统一刷新正统性（提升到外层作用域供后续使用）
  // 战争领袖接续用：每位死者的"主权继承人"。优先级与 vassalReceiver 一致：
  // primaryHeir → escheatReceiver → deadChar.overlordId → null。死者在战争中是领袖时
  // 由后续 war 清理循环转交 attackerId/defenderId。
  const successorByDead = new Map<string, string | null>();
  if (deadIds.length > 0) {
    const territories = terrStore.territories;
    const milStore = useMilitaryStore.getState();
    const turnMgr = useTurnManager.getState();
    const TIER_ORDER: Record<string, number> = { tianxia: 4, guo: 3, dao: 2, zhou: 1 };

    for (const deadId of deadIds) {
      const deadChar = charStore.getCharacter(deadId);
      if (!deadChar) continue;

      const allPosts = terrStore.getPostsByHolder(deadId);

      // 按 tier 降序排列（高层级 clan 岗位先处理，确定 primaryHeir）
      const sorted = [...allPosts].sort((a, b) => {
        const ta = a.territoryId ? territories.get(a.territoryId) : undefined;
        const tb = b.territoryId ? territories.get(b.territoryId) : undefined;
        return (TIER_ORDER[tb?.tier ?? ''] ?? 0) - (TIER_ORDER[ta?.tier ?? ''] ?? 0);
      });

      // 收集治所州 ID → 治所主岗由道级联动处理，不独立继承
      const capitalZhouIds = new Set<string>();
      for (const t of territories.values()) {
        if (t.tier === 'dao' && t.capitalZhouId) capitalZhouIds.add(t.capitalZhouId);
      }

      // 一、每个岗位根据自身 successionLaw 独立处理
      let primaryHeir: string | null = null;
      let escheatReceiver: string | null = null; // 绝嗣上交时最高 tier 岗位接收人
      let hadClanPost = false;
      const vacantPostNames: string[] = [];

      for (const post of sorted) {
        // 治所州 grantsControl 主岗跳过（由道级联动处理）
        if (post.territoryId && capitalZhouIds.has(post.territoryId)) {
          const tpl = positionMap.get(post.templateId);
          if (tpl?.grantsControl) continue;
        }
        if (post.successionLaw === 'clan') {
          // 宗法：resolveHeir → 继承 / 绝嗣上交 / 空缺
          let heir = resolveHeir(deadId, post, charStore.characters);
          // 继承人已持有更高品级的 grantsControl 岗位 → 视为放弃继承，走绝嗣上交
          if (heir && positionMap.get(post.templateId)?.grantsControl) {
            const postRank = positionMap.get(post.templateId)?.minRank ?? 0;
            const heirPosts = terrStore.getPostsByHolder(heir);
            const heirMaxRank = Math.max(0, ...heirPosts
              .filter(p => positionMap.get(p.templateId)?.grantsControl)
              .map(p => positionMap.get(p.templateId)?.minRank ?? 0));
            if (heirMaxRank > postRank) heir = null;
          }
          // 重新获取最新 territories（seatPost 会创建新 Map，旧引用过期）
          const latestTerritories = terrStore.territories;
          let receiver = heir ?? findParentAuthority(post, latestTerritories);
          // 防御：receiver 不能是死人
          if (receiver && !charStore.getCharacter(receiver)?.alive) receiver = null;

          // DEBUG: 继承/上交接收人定位
          if (receiver) {
            const tplName = positionMap.get(post.templateId)?.name ?? post.templateId;
            const terrName = post.territoryId ? territories.get(post.territoryId)?.name : '?';
            const receiverChar = charStore.getCharacter(receiver);
            debugLog('inheritance', `[继承] ${terrName} ${tplName}: 死者=${charStore.getCharacter(deadId)?.name} → receiver=${receiverChar?.name}(${receiver}) heir=${heir ? '宗法' : '绝嗣上交'}`);
          }
          if (receiver) {
            const appointedBy = heir ? 'succession' : 'escheat';
            seatPost(post.id, receiver, appointedBy, date);
            syncArmyForPost(post.id, receiver);
            heirIds.add(receiver);

            // 治所联动：道级岗位继承时，治所一并转给继承人
            if (post.territoryId) {
              capitalZhouSeat(post.territoryId, receiver, appointedBy, date, {
                oldHolderId: deadId,
              });
            }
          } else {
            vacatePost(post.id);

            // 治所联动：道级岗位无人继承时，治所也空缺
            if (post.territoryId) {
              capitalZhouVacate(post.territoryId, deadId);
            }
          }

          if (!primaryHeir && heir) primaryHeir = heir;
          if (!escheatReceiver && !heir && receiver) escheatReceiver = receiver;
          hadClanPost = true;

        } else {
          // 流官 / 副岗：一律空缺
          vacatePost(post.id);

          // 治所联动：道级流官空缺时，治所也空缺
          if (positionMap.get(post.templateId)?.grantsControl && post.territoryId) {
            capitalZhouVacate(post.territoryId, deadId);
          }

          // grantsControl 主岗位记录名称，稍后汇总发事件
          if (positionMap.get(post.templateId)?.grantsControl) {
            const tplName = positionMap.get(post.templateId)?.name ?? post.templateId;
            const terrName = post.territoryId ? territories.get(post.territoryId)?.name : undefined;
            vacantPostNames.push(terrName ? `${terrName}${tplName}` : tplName);
          }
        }
      }

      // 发事件：每位死者最多一条继位/绝嗣事件 + 一条空缺汇总事件
      if (hadClanPost) {
        turnMgr.addEvent({
          id: crypto.randomUUID(),
          date: { year: date.year, month: date.month, day: date.day },
          type: primaryHeir ? '继位' : '绝嗣',
          actors: primaryHeir ? [deadId, primaryHeir] : [deadId],
          territories: [],
          description: primaryHeir
            ? `${deadChar.name}薨，${charStore.getCharacter(primaryHeir)?.name ?? '?'}继位`
            : `${deadChar.name}薨，无人继承`,
          priority: EventPriority.Major,
        });
      }

      if (vacantPostNames.length > 0) {
        turnMgr.addEvent({
          id: crypto.randomUUID(),
          date: { year: date.year, month: date.month, day: date.day },
          type: '岗位空缺',
          actors: [deadId],
          territories: [],
          description: `${deadChar.name}薨，${vacantPostNames.join('、')}出缺`,
          priority: EventPriority.Normal,
        });
      }

      // 二、附庸转移（一次性，给 primaryHeir；绝嗣上交则跟随最高 tier 岗位接收人；兜底给 overlord）
      const vassalReceiver = primaryHeir ?? escheatReceiver ?? deadChar.overlordId ?? null;
      // 战争领袖接续用同一接收人链；存活检查在使用处再做（此刻 receiver 还未必存在）
      successorByDead.set(deadId, vassalReceiver);
      if (vassalReceiver) {
        charStore.batchMutate(chars => {
          for (const [id, c] of chars) {
            if (id === primaryHeir) continue; // 继承人自身不转移，单独处理
            if (c.overlordId === deadId && c.alive) {
              chars.set(id, { ...c, overlordId: vassalReceiver });
            }
          }
        });
      } else {
        // 独立统治者绝嗣：臣属全部独立
        const freedIds: string[] = [];
        charStore.batchMutate(chars => {
          for (const [id, c] of chars) {
            if (c.overlordId === deadId && c.alive) {
              chars.set(id, { ...c, overlordId: undefined });
              freedIds.push(id);
            }
          }
        });
        for (const fid of freedIds) {
          ensureAppointRight(fid);
        }
      }

      // 继承人的 overlordId 继承死者的效忠关系（皇帝→undefined，节度使→皇帝）
      // 防御：避免自我领主（当死者 overlordId 恰好是继承人自己时，清空为 undefined）
      if (primaryHeir) {
        const inheritedOverlord = deadChar.overlordId === primaryHeir ? undefined : deadChar.overlordId;
        charStore.updateCharacter(primaryHeir, { overlordId: inheritedOverlord });
        if (inheritedOverlord === undefined) {
          ensureAppointRight(primaryHeir);
        }
      }

      // 三、好感继承：对死者的好感 × 0.5 转为对继承人的初始好感
      if (primaryHeir) {
        charStore.batchMutate(chars => {
          for (const [id, c] of chars) {
            if (!c.alive || id === deadId || id === primaryHeir) continue;
            const rel = c.relationships.find(r => r.targetId === deadId);
            if (!rel || rel.opinions.length === 0) continue;

            const totalOpinion = rel.opinions.reduce((sum, o) => sum + o.value, 0);
            if (totalOpinion === 0) continue;

            const inheritedValue = Math.round(totalOpinion * 0.5);
            const newEntry = { reason: '先辈余泽', value: inheritedValue, decayable: true };
            const existingRel = c.relationships.find(r => r.targetId === primaryHeir);

            if (existingRel) {
              const newRelationships = c.relationships.map(r =>
                r.targetId === primaryHeir
                  ? { ...r, opinions: [...r.opinions, newEntry] }
                  : r
              );
              chars.set(id, { ...c, relationships: newRelationships });
            } else {
              chars.set(id, {
                ...c,
                relationships: [...c.relationships, { targetId: primaryHeir!, opinions: [newEntry] }],
              });
            }
          }
        });
      }

      // 四、资源继承（仅给 primaryHeir，绝嗣不继承）
      if (primaryHeir) {
        const heirChar = charStore.getCharacter(primaryHeir);
        if (heirChar) {
          charStore.updateCharacter(primaryHeir, {
            resources: {
              money: heirChar.resources.money + deadChar.resources.money,
              grain: heirChar.resources.grain + deadChar.resources.grain,
              prestige: heirChar.resources.prestige,
              legitimacy: heirChar.resources.legitimacy,
            },
          });
        }

        // 私兵继承：postId 为 null 的军队随人继承
        for (const army of milStore.armies.values()) {
          if (army.ownerId === deadId && !army.postId) {
            milStore.updateArmy(army.id, { ownerId: primaryHeir });
          }
        }
      } else {
        // 绝嗣：解散无主私兵
        for (const army of [...milStore.armies.values()]) {
          if (army.ownerId === deadId && !army.postId) {
            milStore.disbandArmy(army.id);
          }
        }
      }

      // 五、玩家死亡处理
      if (deadChar.isPlayer) {
        if (primaryHeir) {
          charStore.setPlayerId(primaryHeir);
          charStore.updateCharacter(primaryHeir, { isPlayer: true });
          charStore.updateCharacter(deadId, { isPlayer: false });
        } else {
          // 玩家绝嗣：清玩家位 + 标记王朝覆灭，UI 渲染 GameOverScreen
          charStore.setPlayerId(null);
          charStore.updateCharacter(deadId, { isPlayer: false });
          useTurnManager.setState({ dynastyExtinct: true, isPaused: true });
          turnMgr.addEvent({
            id: crypto.randomUUID(),
            date: { year: date.year, month: date.month, day: date.day },
            type: '王朝覆灭',
            actors: [deadId],
            territories: [],
            description: `${deadChar.name}薨，后继无人，${deadChar.clan}一脉断绝`,
            priority: EventPriority.Major,
          });
        }
      }
    }
  }

  // 死亡角色：解散其行营 + 战争领袖接续 / 参战者移除
  if (deadIds.length > 0) {
    const warStore = useWarStore.getState();
    for (const deadId of deadIds) {
      for (const war of warStore.getActiveWars()) {
        if (!isWarParticipant(deadId, war)) continue;
        disbandParticipantCampaigns(deadId, war.id);

        // 死者是战争领袖：尝试把领袖位移交给主权继承人
        // （继承人已经接走了死者的领地，war 的 getRealmZhouCount 必须看新领袖才不会被静默白和平）
        const isLeader = war.attackerId === deadId || war.defenderId === deadId;
        if (isLeader) {
          const successor = successorByDead.get(deadId);
          const successorChar = successor ? charStore.getCharacter(successor) : null;
          if (successor && successorChar?.alive) {
            const ok = warStore.replaceLeader(war.id, deadId, successor);
            if (ok) {
              // 接续成功：发事件，保留战争状态由 warSystem 后续按新领袖结算
              const turnMgr = useTurnManager.getState();
              turnMgr.addEvent({
                id: crypto.randomUUID(),
                date: { year: date.year, month: date.month, day: date.day },
                type: '战争接续',
                actors: [deadId, successor],
                territories: [],
                description: `${charStore.getCharacter(deadId)?.name ?? '?'}薨于战时，${successorChar.name}承其大义，继续与敌交战`,
                priority: EventPriority.Major,
              });
              continue;
            }
            // replaceLeader 返回 false（继承人在敌对方等罕见情况）→ 退回常规移除路径
          }
        }
        // 非领袖 / 无继承人 / 接续失败：从参战者列表中移除
        warStore.removeParticipant(war.id, deadId);
      }
    }
  }

  // 死亡/继承完成后刷新缓存（全量）+ 继承人正统性刷新
  if (deadIds.length > 0) {
    refreshPostCaches(undefined, true);
    for (const heirId of heirIds) {
      refreshLegitimacyForChar(heirId);
    }
  }

  // ===== 2. 角色压力结算（批量） =====
  charStore.batchMutate((chars) => {
    for (const char of chars.values()) {
      if (!char.alive) continue;
      const stressChange = calculateMonthlyStressChange(char);
      let newStress = clamp(char.stress + stressChange, 0, 100);
      let traitIds = char.traitIds;

      // 压力=50：获得忧虑特质
      if (newStress >= 50 && char.stress < 50 && !traitIds.includes('trait-anxious')) {
        traitIds = [...traitIds, 'trait-anxious'];
      }

      // 压力=100：精神崩溃
      if (newStress >= 100) {
        const positiveTraits = traitIds.filter((t) =>
          ['trait-brave', 'trait-just', 'trait-social', 'trait-trusting', 'trait-content'].includes(t),
        );
        if (positiveTraits.length > 0) {
          const removeIdx = randInt(0, positiveTraits.length - 1);
          traitIds = traitIds.filter((t) => t !== positiveTraits[removeIdx]);
        } else if (!traitIds.includes('trait-anxious')) {
          traitIds = [...traitIds, 'trait-anxious'];
        }
        newStress = 50; // 重置
      }

      if (newStress !== char.stress || traitIds !== char.traitIds) {
        chars.set(char.id, { ...char, stress: newStress, traitIds });
      }
    }
  });

  // ===== 3. 角色成长（正月时，批量） =====
  if (date.month === 1) {
    charStore.batchMutate((chars) => {
      for (const char of chars.values()) {
        if (!char.alive) continue;
        const age = date.year - char.birthYear;
        let traitIds = char.traitIds;

        if (age === 6) {
          const newTraits = assignPersonalityTraits(traitIds);
          if (newTraits.length > 0) {
            traitIds = [...traitIds, ...newTraits];
          }
        }

        if (age === 16) {
          const effectiveAbilities = getEffectiveAbilities(char);
          const eduTraitId = assignEducationTrait(effectiveAbilities);
          traitIds = [...traitIds, eduTraitId];
        }

        if (traitIds !== char.traitIds) {
          chars.set(char.id, { ...char, traitIds });
        }
      }
    });
  }

  // ===== 4. NPC 留后指定（半年一次：正月/七月） =====
  if (date.month === 1 || date.month === 7) {
    const chars = charStore.characters;

    for (const charId of charStore.aliveSet) {
      const char = chars.get(charId);
      if (!char || char.isPlayer || !char.isRuler) continue;

      // 每角色只算一次
      const personality = calcPersonality(char);
      const bestHeir = selectDesignatedHeir(char, chars, personality.boldness, personality.honor, date.year);

      // 走 executeDesignateHeir 统一入口：内部按"道为权威源"无条件级联到治所州，
      // 不再手写 updatePost + capPost.holderId === charId 的旧条件联动
      // （CLAUDE.md `### 治所州联动` 硬约束）。
      // executeDesignateHeir 一次调用会处理该 holder 的所有 clan grantsControl 主岗，
      // 所以只需找一个锚点 post id。
      const posts = terrStore.getPostsByHolder(charId);
      let anchorPostId: string | null = null;
      let needsUpdate = false;
      for (const post of posts) {
        const tpl = positionMap.get(post.templateId);
        if (!tpl?.grantsControl || post.successionLaw !== 'clan') continue;
        if (anchorPostId === null) anchorPostId = post.id;
        if (bestHeir !== post.designatedHeirId) needsUpdate = true;
      }
      if (anchorPostId && needsUpdate) {
        const heirName = bestHeir ? chars.get(bestHeir)?.name : '无';
        debugLog('inheritance', `[留后] ${char.name} 指定留后：${heirName}`);
        executeDesignateHeir(anchorPostId, bestHeir);
      }
    }
  }
}
