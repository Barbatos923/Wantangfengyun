// ===== 月结算调度器 =====

import type { GameDate } from './types';
import type { Character } from './character/types';
import { useCharacterStore } from './character/CharacterStore';
import { useTerritoryStore } from './territory/TerritoryStore';
import {
  calculateMonthlyHealthChange,
  calculateMonthlyStressChange,
  decayOpinions,
  assignPersonalityTraits,
  assignEducationTrait,
  getEffectiveAbilities,
} from './character/characterUtils';
import {
  calculateAttributeDrift,
  applyAttributeDrift,
} from './territory/territoryUtils';
import {
  checkRankPromotion,
  calculateMonthlyVirtue,
  calculateMonthlyLedger,
  getActualController,
} from './official/officialUtils';
import { useLedgerStore } from './official/LedgerStore';
import { useMilitaryStore } from './military/MilitaryStore';
import { getConscriptionCap } from './military/militaryCalc';
import { useWarStore } from './military/WarStore';
import * as siegeUtils from './military/siegeCalc';
import * as battleEngine from './military/battleEngine';
import { ALL_EDGES as mapEdges } from '@data/mapTopology';
import { positionMap } from '@data/positions';
import { useTurnManager } from './TurnManager';
import { EventPriority } from './types';

/** 限制值在min~max之间 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 执行月结算。在 TurnManager.advanceMonth() 回调中调用。
 */
export function runMonthlySettlement(date: GameDate): void {
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

  // 死亡角色：清空岗位、转移军队
  if (deadIds.length > 0) {
    for (const deadId of deadIds) {
      // 清空该角色持有的所有岗位
      const posts = terrStore.getPostsByHolder(deadId);
      for (const post of posts) {
        terrStore.updatePost(post.id, { holderId: null, appointedBy: undefined, appointedDate: undefined });
      }
      // 驻扎在该角色控制领地的军队：清空 ownerId 对应的军队的兵马使
      // 军队 ownerId 仍指向死人，暂时保留（等继承系统处理）
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
          const removeIdx = Math.floor(Math.random() * positiveTraits.length);
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

  // ===== 3.5 户数自然变化（正月时） =====
  if (date.month === 1) {
    const zhouForPop = terrStore.getAllZhou();
    for (const terr of zhouForPop) {
      const p = terr.populace; // 0-100
      let annualRate: number;
      if (p <= 50) {
        // 0 → -1%, 50 → 0%  (线性)
        annualRate = (p - 50) / 50 * 0.01;
      } else if (p <= 80) {
        // 50 → 0%, 80 → 0.1%  (线性)
        annualRate = (p - 50) / 30 * 0.001;
      } else {
        // 80 → 0.1%, 100 → 0.5%  (线性)
        annualRate = 0.001 + (p - 80) / 20 * 0.004;
      }
      const delta = Math.round(terr.basePopulation * annualRate);
      if (delta !== 0) {
        terrStore.updateTerritory(terr.id, {
          basePopulation: Math.max(0, terr.basePopulation + delta),
        });
      }
    }
  }

  // ===== 4. 好感度衰减（批量） =====
  charStore.batchMutate((chars) => {
    for (const char of chars.values()) {
      if (!char.alive) continue;
      const decayed = decayOpinions(char);
      if (decayed.relationships !== char.relationships) {
        chars.set(char.id, { ...char, relationships: decayed.relationships });
      }
    }
  });

  // ===== 5. 领地属性漂移 =====
  const allZhou = terrStore.getAllZhou();
  for (const terr of allZhou) {
    const controllerId = getActualController(terr);
    const ruler = controllerId ? useCharacterStore.getState().getCharacter(controllerId) : undefined;
    const rulerTraitIds = ruler?.traitIds ?? [];
    const rulerAbilities = ruler ? getEffectiveAbilities(ruler) : undefined;
    const drift = calculateAttributeDrift(terr, rulerTraitIds, rulerAbilities);
    const patch = applyAttributeDrift(terr, drift);
    terrStore.updateTerritory(terr.id, patch);
  }

  // ===== 6. 统一经济结算 =====
  const updatedCharsForEcon = useCharacterStore.getState().getAliveCharacters();
  const territories = useTerritoryStore.getState().territories;
  const characters = useCharacterStore.getState().characters;

  // 先计算所有 ledger，再批量应用资源变化
  const resourcePatches: Array<{ id: string; money: number; grain: number }> = [];
  let playerLedger: ReturnType<typeof calculateMonthlyLedger> | null = null;

  for (const char of updatedCharsForEcon) {
    if (!char.official) continue;
    const ledger = calculateMonthlyLedger(char, territories, characters);
    if (ledger.net.money !== 0 || ledger.net.grain !== 0) {
      resourcePatches.push({
        id: char.id,
        money: Math.floor(ledger.net.money),
        grain: Math.floor(ledger.net.grain),
      });
    }
    if (char.id === charStore.playerId) {
      playerLedger = ledger;
    }
  }

  if (resourcePatches.length > 0) {
    charStore.batchMutate((chars) => {
      for (const p of resourcePatches) {
        const c = chars.get(p.id);
        if (!c) continue;
        chars.set(p.id, {
          ...c,
          resources: {
            ...c.resources,
            money: c.resources.money + p.money,
            grain: c.resources.grain + p.grain,
          },
        });
      }
    });
  }

  if (playerLedger) {
    useLedgerStore.getState().updatePlayerLedger(playerLedger);
  }

  // ===== 6.5 贤能积累与品位晋升（批量） =====
  charStore.batchMutate((chars) => {
    for (const char of chars.values()) {
      if (!char.alive || !char.official) continue;
      const virtueGain = calculateMonthlyVirtue(char);
      let official = char.official;

      if (virtueGain > 0) {
        official = { ...official, virtue: official.virtue + virtueGain };
      }

      // 检查晋升（用更新后的 virtue）
      const charWithUpdatedVirtue: Character = official !== char.official
        ? { ...char, official }
        : char;
      const newRank = checkRankPromotion(charWithUpdatedVirtue);
      if (newRank !== null) {
        official = { ...(official !== char.official ? official : { ...official }), rankLevel: newRank };
      }

      if (official !== char.official) {
        chars.set(char.id, { ...char, official });
      }
    }
  });

  // ===== 6.7 破产检查（批量） =====
  // 先收集需要处理的破产者，再批量应用
  const charsForBankruptcy = useCharacterStore.getState().getAliveCharacters();
  const bankruptIds: string[] = [];
  for (const char of charsForBankruptcy) {
    if (!char.official) continue;
    if (char.resources.money < -50000 || char.resources.grain < -50000) {
      bankruptIds.push(char.id);
    }
  }

  if (bankruptIds.length > 0) {
    charStore.batchMutate((chars) => {
      for (const id of bankruptIds) {
        const char = chars.get(id);
        if (!char) continue;
        // 增加压力
        const newStress = clamp(char.stress + 10, 0, 100);
        chars.set(id, { ...char, stress: newStress });
        // 所有附庸好感度-5
        for (const c of chars.values()) {
          if (c.alive && c.overlordId === id) {
            const rels = [...c.relationships];
            const existing = rels.find((r) => r.targetId === id);
            if (existing) {
              existing.opinions = [...existing.opinions, { reason: '财政困难', value: -5, decayable: true }];
            } else {
              rels.push({ targetId: id, opinions: [{ reason: '财政困难', value: -5, decayable: true }] });
            }
            chars.set(c.id, { ...c, relationships: rels });
          }
        }
      }
    });
  }

  // ===== 6.75 兵役人口月恢复 =====
  const zhouForConscription = useTerritoryStore.getState().getAllZhou();
  for (const terr of zhouForConscription) {
    const cap = getConscriptionCap(terr);
    if (terr.conscriptionPool < cap) {
      const regen = cap / 12;
      const newPool = Math.min(cap, terr.conscriptionPool + regen);
      terrStore.updateTerritory(terr.id, { conscriptionPool: newPool });
    }
  }

  // ===== 6.8 军队士气月结 + 精锐度训练 =====
  const milStore = useMilitaryStore.getState();
  const milArmies = milStore.armies;
  milStore.batchMutateBattalions((battalions) => {
    for (const bat of battalions.values()) {
      let moraleDelta = -0.5; // 基础衰减

      // 出籍贯地
      if (bat.locationId !== bat.homeTerritory) {
        moraleDelta -= 2;
      }

      const newMorale = clamp(bat.morale + moraleDelta, 0, 100);

      // 精锐度训练：兵马使军事能力 / 5，上限50（实战才能突破）
      let newElite = bat.elite;
      const army = milArmies.get(bat.armyId);
      if (army?.commanderId && bat.elite < 50) {
        const commander = useCharacterStore.getState().getCharacter(army.commanderId);
        if (commander) {
          const trainingGain = commander.abilities.military / 5;
          newElite = Math.min(50, bat.elite + trainingGain);
        }
      }

      if (newMorale !== bat.morale || newElite !== bat.elite) {
        battalions.set(bat.id, { ...bat, morale: newMorale, elite: newElite });
      }
    }
  });

  // ===== 6.9 兵变检查 =====
  const battalionsAfterMorale = useMilitaryStore.getState().battalions;
  for (const bat of battalionsAfterMorale.values()) {
    if (bat.morale < 20) {
      // 兵变概率：(20 - morale) / 100，即 morale=0 时 20% 概率
      const mutinyChance = (20 - bat.morale) / 100;
      if (Math.random() < mutinyChance) {
        // 查找所属 army 的 owner
        const army = useMilitaryStore.getState().getArmy(bat.armyId);
        if (army) {
          useTurnManager.getState().addEvent({
            id: `mutiny-${date.year}-${date.month}-${bat.id}`,
            date,
            type: '兵变',
            actors: [army.ownerId],
            territories: [bat.locationId],
            description: `${bat.name}士气极低，发生兵变！`,
            priority: EventPriority.Major,
          });
        }
      }
    }
  }

  // ===== 6.95 行营推进 =====
  const warStore = useWarStore.getState();

  // 赶赴中的军队：倒计时，到达后编入行营
  for (const campaign of warStore.campaigns.values()) {
    if (campaign.incomingArmies.length === 0) continue;
    const arrived: string[] = [];
    const stillComing = campaign.incomingArmies
      .map((ia) => ({ ...ia, turnsLeft: ia.turnsLeft - 1 }))
      .filter((ia) => {
        if (ia.turnsLeft <= 0) { arrived.push(ia.armyId); return false; }
        return true;
      });
    if (arrived.length > 0 || stillComing.length !== campaign.incomingArmies.length) {
      warStore.updateCampaign(campaign.id, {
        armyIds: [...campaign.armyIds, ...arrived],
        incomingArmies: stillComing,
      });
      // 移动到达军队的位置到行营所在地
      for (const armyId of arrived) {
        useMilitaryStore.getState().updateArmy(armyId, { locationId: campaign.locationId });
      }
    }
  }

  // 对向行军拦截：两个敌对行营相向而行时，拦截到同一州
  const intercepted = new Set<string>();
  for (const campA of warStore.campaigns.values()) {
    if (campA.status !== 'marching' || intercepted.has(campA.id)) continue;
    const war = warStore.wars.get(campA.warId);
    if (!war || war.status !== 'active') continue;

    const nextA = campA.route[campA.routeProgress + 1];
    if (!nextA) continue;

    for (const campB of warStore.campaigns.values()) {
      if (campB.id === campA.id || campB.warId !== campA.warId) continue;
      if (campB.status !== 'marching' || intercepted.has(campB.id)) continue;
      if (campB.ownerId === campA.ownerId) continue; // 同一方不拦截

      const nextB = campB.route[campB.routeProgress + 1];
      if (!nextB) continue;

      // 检测交叉：A→B的位置，B→A的位置
      if (nextA === campB.locationId && nextB === campA.locationId) {
        // 相向而行！在防守方（war.defenderId）所在位置相遇
        intercepted.add(campA.id);
        intercepted.add(campB.id);

        const defenderCamp = campA.ownerId === war.defenderId ? campA : campB;
        const attackerCamp = campA.ownerId === war.defenderId ? campB : campA;
        const meetLocation = defenderCamp.locationId;

        warStore.updateCampaign(defenderCamp.id, {
          status: 'idle', targetId: null, route: [], routeProgress: 0,
        });
        warStore.updateCampaign(attackerCamp.id, {
          locationId: meetLocation,
          status: 'idle', targetId: null, route: [], routeProgress: 0,
        });
        // 移动攻方军队到相遇点
        for (const armyId of attackerCamp.armyIds) {
          useMilitaryStore.getState().updateArmy(armyId, { locationId: meetLocation });
        }
        break;
      }
    }
  }

  for (const campaign of warStore.campaigns.values()) {
    // 集结中：倒计时
    if (campaign.status === 'mustering') {
      if (campaign.musteringTurnsLeft <= 1) {
        warStore.updateCampaign(campaign.id, { status: 'idle', musteringTurnsLeft: 0 });
      } else {
        warStore.updateCampaign(campaign.id, { musteringTurnsLeft: campaign.musteringTurnsLeft - 1 });
      }
    }
    // 行军中：每月推进一格
    else if (campaign.status === 'marching' && campaign.route.length > 0) {
      const nextProgress = campaign.routeProgress + 1;
      if (nextProgress >= campaign.route.length - 1) {
        // 到达目的地
        const destId = campaign.route[campaign.route.length - 1];
        warStore.updateCampaign(campaign.id, {
          locationId: destId,
          routeProgress: nextProgress,
          status: 'idle',
          targetId: null,
          route: [],
        });
        // 移动该行营下所有军的 locationId
        const campArmies = campaign.armyIds;
        for (const armyId of campArmies) {
          useMilitaryStore.getState().updateArmy(armyId, { locationId: destId });
        }
      } else {
        // 推进一格
        const nextLocId = campaign.route[nextProgress];
        warStore.updateCampaign(campaign.id, {
          locationId: nextLocId,
          routeProgress: nextProgress,
        });
        // 移动军队
        for (const armyId of campaign.armyIds) {
          useMilitaryStore.getState().updateArmy(armyId, { locationId: nextLocId });
        }
      }
    }
  }

  // ===== 6.955 战斗检测：同一州的敌对行营 =====
  const processedBattles = new Set<string>();
  for (const campaign of useWarStore.getState().campaigns.values()) {
    if (campaign.status !== 'idle' && campaign.status !== 'marching') continue;
    if (processedBattles.has(campaign.id)) continue;

    // 有warId时检查战争是否活跃
    const war = campaign.warId ? useWarStore.getState().wars.get(campaign.warId) : undefined;
    if (campaign.warId && (!war || war.status !== 'active')) continue;

    // 查找同一州的敌方行营（同战争或任意敌对）
    let enemyCampaign: typeof campaign | undefined;
    for (const other of useWarStore.getState().campaigns.values()) {
      if (other.id === campaign.id || other.ownerId === campaign.ownerId) continue;
      if (other.locationId !== campaign.locationId) continue;
      if (processedBattles.has(other.id)) continue;
      // 同战争的敌方，或双方都在战争中
      if (campaign.warId && other.warId === campaign.warId) {
        enemyCampaign = other;
        break;
      }
      // 独立行营遇到敌方行营
      if (!campaign.warId || !other.warId) {
        enemyCampaign = other;
        break;
      }
    }
    if (!enemyCampaign) continue;
    processedBattles.add(campaign.id);
    processedBattles.add(enemyCampaign.id);

    // 触发战斗（使用预设策略或AI自动选）
    const milState = useMilitaryStore.getState();
    const charState = useCharacterStore.getState();
    const batsClone = new Map(milState.battalions);

    const result = battleEngine.resolveBattle(
      campaign.commanderId,
      enemyCampaign.commanderId,
      campaign.armyIds,
      enemyCampaign.armyIds,
      milState.armies,
      batsClone,
      charState.characters,
      campaign.phaseStrategies,
      enemyCampaign.phaseStrategies,
    );

    // 写回伤亡到 store
    useMilitaryStore.getState().batchMutateBattalions((bats) => {
      for (const [id, bat] of batsClone) {
        const orig = bats.get(id);
        if (orig && orig.currentStrength !== bat.currentStrength) {
          bats.set(id, { ...orig, currentStrength: bat.currentStrength });
        }
      }
    });

    // 战争分数
    if (result.overallResult === 'attackerWin') {
      if (campaign.ownerId === war.attackerId) {
        useWarStore.getState().updateWar(war.id, {
          attackerWarScore: Math.min(100, war.attackerWarScore + result.warScoreChange),
        });
      } else {
        useWarStore.getState().updateWar(war.id, {
          defenderWarScore: Math.min(100, war.defenderWarScore + result.warScoreChange),
        });
      }
    } else {
      if (enemyCampaign.ownerId === war.attackerId) {
        useWarStore.getState().updateWar(war.id, {
          attackerWarScore: Math.min(100, war.attackerWarScore + result.warScoreChange),
        });
      } else {
        useWarStore.getState().updateWar(war.id, {
          defenderWarScore: Math.min(100, war.defenderWarScore + result.warScoreChange),
        });
      }
    }

    // 胜方行营保持idle
    const winnerCampaign = result.overallResult === 'attackerWin' ? campaign : enemyCampaign;
    useWarStore.getState().updateCampaign(winnerCampaign.id, { status: 'idle' });

    // 败方行营撤退：寻找相邻的己方领地，找到则撤退，找不到则解散
    const loserCampaign = result.overallResult === 'attackerWin' ? enemyCampaign : campaign;
    const loserOwnerId = loserCampaign.ownerId;

    // 败方若正在围城，撤退时取消围城
    for (const siege of useWarStore.getState().sieges.values()) {
      if (siege.campaignId === loserCampaign.id) {
        useWarStore.getState().endSiege(siege.id);
        break;
      }
    }

    let retreatTarget: string | null = null;

    // 从地图拓扑找相邻州
    for (const edge of mapEdges) {
      const neighborId = edge.from === loserCampaign.locationId ? edge.to
        : edge.to === loserCampaign.locationId ? edge.from
        : null;
      if (!neighborId) continue;
      const neighborTerr = useTerritoryStore.getState().territories.get(neighborId);
      if (!neighborTerr) continue;
      const controller = siegeUtils.getTerritoryController(neighborTerr);
      if (controller === loserOwnerId) {
        retreatTarget = neighborId;
        break;
      }
    }

    if (retreatTarget) {
      // 撤退到相邻己方领地
      useWarStore.getState().updateCampaign(loserCampaign.id, {
        status: 'idle',
        locationId: retreatTarget,
        targetId: null,
        route: [],
      });
      // 移动军队
      for (const armyId of loserCampaign.armyIds) {
        useMilitaryStore.getState().updateArmy(armyId, { locationId: retreatTarget });
      }
    } else {
      // 无处可退，解散行营
      useWarStore.getState().disbandCampaign(loserCampaign.id);
    }

    // 事件
    const attackerChar = charState.characters.get(campaign.commanderId);
    const defenderChar = charState.characters.get(enemyCampaign.commanderId);
    const winnerName = result.overallResult === 'attackerWin' ? attackerChar?.name : defenderChar?.name;
    const terrName = useTerritoryStore.getState().territories.get(campaign.locationId)?.name ?? '';

    useTurnManager.getState().addEvent({
      id: `battle-${date.year}-${date.month}-${campaign.locationId}`,
      date,
      type: '野战',
      actors: [campaign.ownerId, enemyCampaign.ownerId],
      territories: [campaign.locationId],
      description: `${terrName}之战！${winnerName ?? ''}获胜。攻方损失${result.totalAttackerLosses}，守方损失${result.totalDefenderLosses}`,
      priority: EventPriority.Major,
    });
  }

  // ===== 6.96 围城：开始 + 推进 + 城破 =====
  // 1. idle 的行营如果在敌方领地，自动开始围城
  for (const campaign of useWarStore.getState().campaigns.values()) {
    if (campaign.status !== 'idle') continue;
    const war = warStore.wars.get(campaign.warId);
    if (!war || war.status !== 'active') continue;

    const terr = useTerritoryStore.getState().territories.get(campaign.locationId);
    if (!terr) continue;
    const controller = siegeUtils.getTerritoryController(terr);
    // 行营在敌方领地 → 开始围城
    const enemyId = war.attackerId === campaign.ownerId ? war.defenderId : war.attackerId;
    if (controller === enemyId && !useWarStore.getState().getSiegeAtTerritory(campaign.locationId)) {
      useWarStore.getState().startSiege(war.id, campaign.id, campaign.locationId, date);
      useWarStore.getState().updateCampaign(campaign.id, { status: 'sieging' });
    }
  }

  // 2. 推进围城进度 + 守军损耗
  for (const siege of useWarStore.getState().sieges.values()) {
    const campaign = useWarStore.getState().campaigns.get(siege.campaignId);
    if (!campaign) continue;
    const terr = useTerritoryStore.getState().territories.get(siege.territoryId);
    if (!terr) continue;

    const war = useWarStore.getState().wars.get(siege.warId);
    if (!war) continue;
    const defenderId = war.attackerId === campaign.ownerId ? war.defenderId : war.attackerId;

    const milState = useMilitaryStore.getState();

    // 守军损耗
    const defStats = siegeUtils.calcDefenderStats(siege.territoryId, defenderId, milState.armies, milState.battalions);
    const attritionRate = siegeUtils.calcDefenderAttritionRate(defStats.avgElite, defStats.avgMorale);
    siegeUtils.applyDefenderAttrition(
      siege.territoryId, defenderId, attritionRate,
      milState.armies, milState.battalions,
      useMilitaryStore.getState().batchMutateBattalions,
    );

    // 重新获取 milState（损耗后数据已变）
    const milAfter = useMilitaryStore.getState();
    const troops = siegeUtils.calcCampaignTroops(campaign.armyIds, milAfter.armies, milAfter.battalions);
    const siegeValue = siegeUtils.calcTotalSiegeValue(campaign.armyIds, milAfter.armies, milAfter.battalions);
    const defenderTroops = siegeUtils.calcDefenderTroops(siege.territoryId, defenderId, milAfter.armies, milAfter.battalions);
    const progress = siegeUtils.calcMonthlyProgress(troops, siegeValue, terr, defenderTroops);
    const newProgress = Math.min(100, siege.progress + progress);

    if (newProgress >= 100) {
      // 城破！
      // a. 守军全灭
      siegeUtils.applyDefenderAttrition(
        siege.territoryId, defenderId, 1.0, // 100% 损耗 = 全灭
        useMilitaryStore.getState().armies, useMilitaryStore.getState().battalions,
        useMilitaryStore.getState().batchMutateBattalions,
      );

      // b. 标记为占领（不转移控制权，战争结束后结算）
      terrStore.updateTerritory(siege.territoryId, { occupiedBy: campaign.ownerId });

      // c. 驻军转移给占领者
      useMilitaryStore.getState().transferArmiesAtTerritory(siege.territoryId, campaign.ownerId);

      // d. 战争分数
      const war = useWarStore.getState().wars.get(siege.warId);
      if (war) {
        const isTarget = war.targetTerritoryIds.includes(siege.territoryId);
        const scoreGain = isTarget ? 30 : 15;
        if (campaign.ownerId === war.attackerId) {
          useWarStore.getState().updateWar(war.id, {
            attackerWarScore: Math.min(100, war.attackerWarScore + scoreGain),
          });
        } else {
          useWarStore.getState().updateWar(war.id, {
            defenderWarScore: Math.min(100, war.defenderWarScore + scoreGain),
          });
        }

        // e. 检查是否所有目标领地都已被占领 → 直接100分
        const allTargetsTaken = war.targetTerritoryIds.every((tid) => {
          const t = useTerritoryStore.getState().territories.get(tid);
          return t?.occupiedBy === campaign.ownerId;
        });
        if (allTargetsTaken) {
          if (campaign.ownerId === war.attackerId) {
            useWarStore.getState().updateWar(war.id, { attackerWarScore: 100 });
          } else {
            useWarStore.getState().updateWar(war.id, { defenderWarScore: 100 });
          }
        }
      }

      // f. 事件
      useTurnManager.getState().addEvent({
        id: `siege-fall-${date.year}-${date.month}-${siege.territoryId}`,
        date,
        type: '城破',
        actors: [campaign.ownerId],
        territories: [siege.territoryId],
        description: `${terr.name}城破！`,
        priority: EventPriority.Major,
      });

      // g. 清理围城，行营恢复idle
      useWarStore.getState().endSiege(siege.id);
      useWarStore.getState().updateCampaign(campaign.id, { status: 'idle' });
    } else {
      useWarStore.getState().updateSiege(siege.id, { progress: newProgress });
    }
  }

  // ===== 6.97 防守方战争分数累积 =====
  for (const war of warStore.wars.values()) {
    if (war.status !== 'active') continue;
    // 检查攻方是否有行营在进攻
    const attackerCampaigns = warStore.getCampaignsByWar(war.id)
      .filter((c) => c.ownerId === war.attackerId);
    const hasProgress = attackerCampaigns.some(
      (c) => c.status === 'marching' || c.status === 'sieging',
    );
    if (!hasProgress) {
      // 攻方无进展，防守方 +2
      warStore.updateWar(war.id, {
        defenderWarScore: Math.min(100, war.defenderWarScore + 2),
      });
    }
  }

  // ===== 7. 建筑施工进度 =====
  const finalZhou = useTerritoryStore.getState().getAllZhou();
  for (const terr of finalZhou) {
    if (terr.constructions.length > 0) {
      terrStore.advanceConstructions(terr.id);
    }
  }

  // ===== 8. UI 刷新由 Zustand 自动触发 =====
}
