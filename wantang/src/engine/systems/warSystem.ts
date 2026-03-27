// ===== 战争系统：行营推进/战斗/围城/战争分数 =====

import type { GameDate } from '@engine/types.ts';
import { EventPriority } from '@engine/types.ts';
import { useCharacterStore } from '@engine/character/CharacterStore.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';
import { useMilitaryStore } from '@engine/military/MilitaryStore.ts';
import { useWarStore } from '@engine/military/WarStore.ts';
import { useTurnManager } from '@engine/TurnManager.ts';
import * as siegeUtils from '@engine/military/siegeCalc.ts';
import * as battleEngine from '@engine/military/battleEngine.ts';
import { ALL_EDGES as mapEdges } from '@data/mapTopology.ts';

export function runWarSystem(date: GameDate): void {
  const warStore = useWarStore.getState();

  // ===== 行营推进 =====
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

  // ===== 战斗检测：同一州的敌对行营 =====
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
      campaign.phaseStrategies as Record<string, string | undefined>,
      enemyCampaign.phaseStrategies as Record<string, string | undefined>,
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
      if (campaign.ownerId === war!.attackerId) {
        useWarStore.getState().updateWar(war!.id, {
          attackerWarScore: Math.min(100, war!.attackerWarScore + result.warScoreChange),
        });
      } else {
        useWarStore.getState().updateWar(war!.id, {
          defenderWarScore: Math.min(100, war!.defenderWarScore + result.warScoreChange),
        });
      }
    } else {
      if (enemyCampaign.ownerId === war!.attackerId) {
        useWarStore.getState().updateWar(war!.id, {
          attackerWarScore: Math.min(100, war!.attackerWarScore + result.warScoreChange),
        });
      } else {
        useWarStore.getState().updateWar(war!.id, {
          defenderWarScore: Math.min(100, war!.defenderWarScore + result.warScoreChange),
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

  // ===== 围城：开始 + 推进 + 城破 =====
  const terrStore = useTerritoryStore.getState();

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
      const warForScore = useWarStore.getState().wars.get(siege.warId);
      if (warForScore) {
        const isTarget = warForScore.targetTerritoryIds.includes(siege.territoryId);
        const scoreGain = isTarget ? 30 : 15;
        if (campaign.ownerId === warForScore.attackerId) {
          useWarStore.getState().updateWar(warForScore.id, {
            attackerWarScore: Math.min(100, warForScore.attackerWarScore + scoreGain),
          });
        } else {
          useWarStore.getState().updateWar(warForScore.id, {
            defenderWarScore: Math.min(100, warForScore.defenderWarScore + scoreGain),
          });
        }

        // e. 检查是否所有目标领地都已被占领 → 直接100分
        const allTargetsTaken = warForScore.targetTerritoryIds.every((tid) => {
          const t = useTerritoryStore.getState().territories.get(tid);
          return t?.occupiedBy === campaign.ownerId;
        });
        if (allTargetsTaken) {
          if (campaign.ownerId === warForScore.attackerId) {
            useWarStore.getState().updateWar(warForScore.id, { attackerWarScore: 100 });
          } else {
            useWarStore.getState().updateWar(warForScore.id, { defenderWarScore: 100 });
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

  // ===== 防守方战争分数累积 =====
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
}
