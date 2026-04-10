// ===== 战争系统：行营推进/战斗/围城/战争分数 =====

import type { GameDate } from '@engine/types.ts';
import type { Campaign } from '@engine/military/types.ts';
import { getDaysInMonth, diffDays } from '@engine/dateUtils.ts';
import { EventPriority } from '@engine/types.ts';
import { useCharacterStore } from '@engine/character/CharacterStore.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';
import { useMilitaryStore } from '@engine/military/MilitaryStore.ts';
import { useWarStore } from '@engine/military/WarStore.ts';
import { useTurnManager } from '@engine/TurnManager.ts';
import * as siegeUtils from '@engine/military/siegeCalc.ts';
import { settleWar } from '@engine/military/warSettlement.ts';
import * as battleEngine from '@engine/military/battleEngine.ts';
import { ALL_EDGES as mapEdges } from '@data/mapTopology.ts';
import { getRealmZhouCount } from '@engine/official/postQueries.ts';
import { findPath } from '@engine/military/marchCalc.ts';
import { getArmyMarchSpeed } from '@engine/military/militaryCalc.ts';
import { unitTypeMap } from '@data/unitTypes.ts';
import {
  isOnAttackerSide, isOnDefenderSide, getWarSide,
} from '@engine/military/warParticipantUtils.ts';

// ── 辅助函数 ─────────────────────────────────────────────

/**
 * 判断领地是否属于战争中己方的敌对阵营。
 *
 * 沿领地控制者的效忠链向上查找，找到第一个战争参与者后判断其阵营。
 * 这样即使效忠链上层有对方参战者（如皇帝在守方但下级在攻方），
 * 也能正确按最近参与者的阵营判断，不会误把己方领地当敌方。
 */
function isEnemyTerritoryInWar(
  territory: import('@engine/territory/types').Territory,
  mySide: import('@engine/military/warParticipantUtils').WarSide,
  war: import('@engine/military/types').War,
  characters: Map<string, import('@engine/character/types').Character>,
): boolean {
  const ctrl = siegeUtils.getTerritoryController(territory);
  if (!ctrl) return false;
  let current = ctrl;
  const visited = new Set<string>();
  while (current) {
    const side = getWarSide(current, war);
    if (side) return side !== mySide; // 找到参战者 → 判断是否敌方
    if (visited.has(current)) break;
    visited.add(current);
    const char = characters.get(current);
    if (!char?.overlordId) break;
    current = char.overlordId;
  }
  return false; // 效忠链上无任何参战者 → 非敌方领地
}

// ── 主系统 ────────────────────────────────────────────────

export function runWarSystem(date: GameDate): void {
  const warStore = useWarStore.getState();

  // ===== 行营推进 =====
  // 赶赴中的军队：倒计时，到达后编入行营
  // BUG 修复：原来的 if 只在"有人到达"或"长度变了"时才 updateCampaign，
  // 导致 turnsLeft > 1 的集结永远不会被持久化（每天减 1 算出来后直接丢弃，
  // 下一天又从 store 读出原值），军队卡死在出发地。现在只要 incomingArmies
  // 非空就无条件写回，让 turnsLeft 真正持久化递减。
  for (const campaign of warStore.campaigns.values()) {
    if (campaign.incomingArmies.length === 0) continue;
    const arrived: string[] = [];
    const stillComing = campaign.incomingArmies
      .map((ia) => ({ ...ia, turnsLeft: ia.turnsLeft - 1 }))
      .filter((ia) => {
        if (ia.turnsLeft <= 0) { arrived.push(ia.armyId); return false; }
        return true;
      });
    warStore.updateCampaign(campaign.id, {
      armyIds: arrived.length > 0 ? [...campaign.armyIds, ...arrived] : campaign.armyIds,
      incomingArmies: stillComing,
    });
    for (const armyId of arrived) {
      useMilitaryStore.getState().updateArmy(armyId, { locationId: campaign.locationId });
    }
  }

  // 记录行军前的行营位置，供行军后的交叉拦截检测使用
  const marchStartLocations = new Map<string, string>();
  for (const c of useWarStore.getState().campaigns.values()) {
    if (c.status === 'marching') {
      marchStartLocations.set(c.id, c.locationId);
    }
  }

  for (const campaign of useWarStore.getState().campaigns.values()) {

    // 行军中：每日按 marchSpeed 累积推进
    if (campaign.status === 'marching' && campaign.route.length > 0) {
      const milStore = useMilitaryStore.getState();
      let minSpeed = Infinity;
      for (const armyId of campaign.armyIds) {
        const army = milStore.armies.get(armyId);
        if (army) {
          const speed = getArmyMarchSpeed(army, milStore.battalions, unitTypeMap);
          if (speed < minSpeed) minSpeed = speed;
        }
      }
      if (minSpeed === Infinity) minSpeed = 1.0;
      const dailyRate = minSpeed / 10;

      let mp = campaign.marchProgress + dailyRate;
      let rp = campaign.routeProgress;

      while (mp >= 1.0 && rp < campaign.route.length - 1) {
        mp -= 1.0;
        rp += 1;
      }

      if (rp >= campaign.route.length - 1) {
        const destId = campaign.route[campaign.route.length - 1];
        for (const armyId of campaign.armyIds) {
          useMilitaryStore.getState().updateArmy(armyId, { locationId: destId });
        }
        if (!campaign.warId) {
          useWarStore.getState().disbandCampaign(campaign.id);
        } else {
          useWarStore.getState().updateCampaign(campaign.id, {
            locationId: destId,
            routeProgress: rp,
            marchProgress: 0,
            status: 'idle',
            targetId: null,
            route: [],
          });
        }
      } else if (rp !== campaign.routeProgress) {
        const nextLocId = campaign.route[rp];
        useWarStore.getState().updateCampaign(campaign.id, {
          locationId: nextLocId,
          routeProgress: rp,
          marchProgress: mp,
        });
        for (const armyId of campaign.armyIds) {
          useMilitaryStore.getState().updateArmy(armyId, { locationId: nextLocId });
        }
      } else {
        useWarStore.getState().updateCampaign(campaign.id, { marchProgress: mp });
      }
    }
  }

  // ===== 对向行军拦截（后置交叉检测）=====
  {
    const interceptedCrossing = new Set<string>();
    for (const [campAId, fromA] of marchStartLocations) {
      if (interceptedCrossing.has(campAId)) continue;
      const campA = useWarStore.getState().campaigns.get(campAId);
      if (!campA || campA.locationId === fromA) continue;
      const warA = warStore.wars.get(campA.warId);
      if (!warA || warA.status !== 'active') continue;

      for (const [campBId, fromB] of marchStartLocations) {
        if (campBId === campAId || interceptedCrossing.has(campBId)) continue;
        const campB = useWarStore.getState().campaigns.get(campBId);
        if (!campB || campB.locationId === fromB) continue;
        // 同战争 + 不同阵营
        if (campB.warId !== campA.warId) continue;
        const sideA = getWarSide(campA.ownerId, warA);
        const sideB = getWarSide(campB.ownerId, warA);
        if (!sideA || !sideB || sideA === sideB) continue;

        if (campA.locationId !== fromB || campB.locationId !== fromA) continue;

        interceptedCrossing.add(campAId);
        interceptedCrossing.add(campBId);

        // 相遇在防守方的原始位置
        const meetLoc = isOnDefenderSide(campA.ownerId, warA) ? fromA : fromB;

        useWarStore.getState().updateCampaign(campA.id, {
          locationId: meetLoc, status: 'idle',
          targetId: null, route: [], routeProgress: 0, marchProgress: 0,
        });
        useWarStore.getState().updateCampaign(campB.id, {
          locationId: meetLoc, status: 'idle',
          targetId: null, route: [], routeProgress: 0, marchProgress: 0,
        });
        for (const armyId of campA.armyIds) {
          useMilitaryStore.getState().updateArmy(armyId, { locationId: meetLoc });
        }
        for (const armyId of campB.armyIds) {
          useMilitaryStore.getState().updateArmy(armyId, { locationId: meetLoc });
        }
        break;
      }
    }
  }

  // ===== 零兵力行营自动解散 =====
  {
    const milStore = useMilitaryStore.getState();
    for (const campaign of useWarStore.getState().campaigns.values()) {
      if (campaign.armyIds.length === 0 && campaign.incomingArmies.length === 0) {
        useWarStore.getState().disbandCampaign(campaign.id);
        continue;
      }
      // 所有军队总兵力为 0 → 解散
      let totalStrength = 0;
      for (const armyId of campaign.armyIds) {
        const army = milStore.armies.get(armyId);
        if (!army) continue;
        for (const batId of army.battalionIds) {
          totalStrength += milStore.battalions.get(batId)?.currentStrength ?? 0;
        }
      }
      if (totalStrength === 0 && campaign.incomingArmies.length === 0) {
        useWarStore.getState().disbandCampaign(campaign.id);
      }
    }
  }

  // ===== 战斗检测：合兵方案 =====
  // 同一州、同一战争的敌对阵营行营合并 armyIds 打一场
  {
    const processedBattles = new Set<string>();

    // 按(warId, locationId)分组战斗就绪的行营
    const groupKey = (c: Campaign) => `${c.warId}:${c.locationId}`;
    const groups = new Map<string, Campaign[]>();
    for (const campaign of useWarStore.getState().campaigns.values()) {
      if (campaign.status !== 'idle' && campaign.status !== 'marching' && campaign.status !== 'sieging') continue;
      if (!campaign.warId) continue;
      const war = useWarStore.getState().wars.get(campaign.warId);
      if (!war || war.status !== 'active') continue;
      const key = groupKey(campaign);
      let list = groups.get(key);
      if (!list) { list = []; groups.set(key, list); }
      list.push(campaign);
    }

    for (const campaigns of groups.values()) {
      if (campaigns.length < 2) continue;
      const war = useWarStore.getState().wars.get(campaigns[0].warId)!;

      // 分成两阵营
      const attackerCamps: Campaign[] = [];
      const defenderCamps: Campaign[] = [];
      for (const c of campaigns) {
        if (processedBattles.has(c.id)) continue;
        if (isOnAttackerSide(c.ownerId, war)) attackerCamps.push(c);
        else if (isOnDefenderSide(c.ownerId, war)) defenderCamps.push(c);
      }
      if (attackerCamps.length === 0 || defenderCamps.length === 0) continue;

      // 标记已处理
      for (const c of attackerCamps) processedBattles.add(c.id);
      for (const c of defenderCamps) processedBattles.add(c.id);

      // 围城中的行营被拉入战斗前，先取消围城
      for (const c of [...attackerCamps, ...defenderCamps]) {
        if (c.status === 'sieging') {
          for (const siege of useWarStore.getState().sieges.values()) {
            if (siege.campaignId === c.id) {
              useWarStore.getState().endSiege(siege.id);
              break;
            }
          }
          useWarStore.getState().updateCampaign(c.id, { status: 'idle' });
        }
      }

      // 合并 armyIds
      const attackerArmyIds: string[] = [];
      for (const c of attackerCamps) attackerArmyIds.push(...c.armyIds);
      const defenderArmyIds: string[] = [];
      for (const c of defenderCamps) defenderArmyIds.push(...c.armyIds);

      // 选统帅：military 能力最高者
      const charState = useCharacterStore.getState();
      const pickCommander = (camps: Campaign[]) => {
        let best = camps[0].commanderId;
        let bestMil = -1;
        for (const c of camps) {
          const cmd = charState.characters.get(c.commanderId);
          if (cmd && cmd.abilities.military > bestMil) {
            bestMil = cmd.abilities.military;
            best = c.commanderId;
          }
        }
        return best;
      };
      const attackerCmd = pickCommander(attackerCamps);
      const defenderCmd = pickCommander(defenderCamps);

      // 合并策略（取第一个有预设策略的行营）
      const pickStrategies = (camps: Campaign[]) => {
        for (const c of camps) {
          if (Object.keys(c.phaseStrategies).length > 0) return c.phaseStrategies;
        }
        return {};
      };

      const milState = useMilitaryStore.getState();
      const batsClone = new Map(milState.battalions);

      const result = battleEngine.resolveBattle(
        attackerCmd,
        defenderCmd,
        attackerArmyIds,
        defenderArmyIds,
        milState.armies,
        batsClone,
        charState.characters,
        pickStrategies(attackerCamps) as Record<string, string | undefined>,
        pickStrategies(defenderCamps) as Record<string, string | undefined>,
      );

      // 写回伤亡
      useMilitaryStore.getState().batchMutateBattalions((bats) => {
        for (const [id, bat] of batsClone) {
          const orig = bats.get(id);
          if (orig && orig.currentStrength !== bat.currentStrength) {
            bats.set(id, { ...orig, currentStrength: bat.currentStrength });
          }
        }
      });

      // 战争分数
      const winnerIsAttacker = result.overallResult === 'attackerWin';
      const delta = winnerIsAttacker ? result.warScoreChange : -result.warScoreChange;
      const newScore = Math.max(-100, Math.min(100, war.warScore + delta));
      useWarStore.getState().updateWar(war.id, { warScore: newScore });

      // 胜方行营保持 idle
      const winnerCamps = winnerIsAttacker ? attackerCamps : defenderCamps;
      for (const c of winnerCamps) {
        useWarStore.getState().updateCampaign(c.id, { status: 'idle' });
      }

      // 败方所有行营统一撤退
      const loserCamps = winnerIsAttacker ? defenderCamps : attackerCamps;
      for (const loserCampaign of loserCamps) {
        const loserOwnerId = loserCampaign.ownerId;

        // 取消围城
        for (const siege of useWarStore.getState().sieges.values()) {
          if (siege.campaignId === loserCampaign.id) {
            useWarStore.getState().endSiege(siege.id);
            break;
          }
        }

        let retreatTarget: string | null = null;
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
          useWarStore.getState().updateCampaign(loserCampaign.id, {
            status: 'idle',
            locationId: retreatTarget,
            targetId: null,
            route: [],
          });
          for (const armyId of loserCampaign.armyIds) {
            useMilitaryStore.getState().updateArmy(armyId, { locationId: retreatTarget });
          }
        } else {
          let fallbackLocation: string | null = null;
          for (const t of useTerritoryStore.getState().territories.values()) {
            if (t.tier !== 'zhou') continue;
            const ctrl = siegeUtils.getTerritoryController(t);
            if (ctrl === loserOwnerId) { fallbackLocation = t.id; break; }
          }
          if (fallbackLocation) {
            for (const armyId of loserCampaign.armyIds) {
              useMilitaryStore.getState().updateArmy(armyId, { locationId: fallbackLocation });
            }
          }
          useWarStore.getState().disbandCampaign(loserCampaign.id);
        }
      }

      // 事件
      const attackerChar = charState.characters.get(attackerCmd);
      const defenderChar = charState.characters.get(defenderCmd);
      const winnerName = winnerIsAttacker ? attackerChar?.name : defenderChar?.name;
      const terrName = useTerritoryStore.getState().territories.get(attackerCamps[0].locationId)?.name ?? '';
      const atkName = attackerChar?.name ?? '?';
      const defName = defenderChar?.name ?? '?';
      const atkTroops = result.initialAttackerTroops;
      const defTroops = result.initialDefenderTroops;

      useTurnManager.getState().addEvent({
        id: `battle-${date.year}-${date.month}-${date.day}-${attackerCamps[0].locationId}`,
        date,
        type: '野战',
        actors: [...attackerCamps.map(c => c.ownerId), ...defenderCamps.map(c => c.ownerId)],
        territories: [attackerCamps[0].locationId],
        description: `${terrName}之战！攻方主将${atkName}率兵${atkTroops}人，守方主将${defName}率兵${defTroops}人，${winnerName ?? '?'}获胜，攻损${result.totalAttackerLosses}守损${result.totalDefenderLosses}`,
        priority: EventPriority.Major,
        payload: {
          battleResult: result,
          attackerCommanderId: attackerCmd,
          defenderCommanderId: defenderCmd,
          attackerArmyIds,
          defenderArmyIds,
        },
      });
    }
  }

  // ===== 围城：开始 + 推进 + 城破 =====
  const terrStore = useTerritoryStore.getState();

  // 1. idle 的行营如果在敌方领地，自动开始围城（或加入已有同战争围城）
  for (const campaign of useWarStore.getState().campaigns.values()) {
    if (campaign.status !== 'idle') continue;
    const war = warStore.wars.get(campaign.warId);
    if (!war || war.status !== 'active') continue;

    const terr = useTerritoryStore.getState().territories.get(campaign.locationId);
    if (!terr) continue;
    const mySide = getWarSide(campaign.ownerId, war);
    const chars = useCharacterStore.getState().characters;
    if (!mySide || !isEnemyTerritoryInWar(terr, mySide, war, chars) || terr.occupiedBy === campaign.ownerId) continue;

    const existingSiege = useWarStore.getState().getSiegeAtTerritory(campaign.locationId);
    if (!existingSiege) {
      // 无围城 → 创建新围城
      useWarStore.getState().startSiege(war.id, campaign.id, campaign.locationId, date);
      useWarStore.getState().updateCampaign(campaign.id, { status: 'sieging' });
    } else if (existingSiege.warId === war.id) {
      // 同战争围城已存在 → 同阵营则加入合围
      const siegeCamp = useWarStore.getState().campaigns.get(existingSiege.campaignId);
      if (siegeCamp && getWarSide(siegeCamp.ownerId, war) === mySide) {
        useWarStore.getState().updateCampaign(campaign.id, { status: 'sieging' });
      }
    }
    // 不同战争的围城 → 保持 idle
  }

  // 2. 推进围城进度 + 守军损耗
  for (const siege of useWarStore.getState().sieges.values()) {
    const campaign = useWarStore.getState().campaigns.get(siege.campaignId);
    if (!campaign) continue;
    const terr = useTerritoryStore.getState().territories.get(siege.territoryId);
    if (!terr) continue;

    const war = useWarStore.getState().wars.get(siege.warId);
    if (!war) continue;

    const milState = useMilitaryStore.getState();

    // 收集该州内所有守方阵营军队的 owner（含盟友驻军），统一参与守城计算
    const attackerSide = getWarSide(campaign.ownerId, war);
    const defenderIds = new Set<string>();
    const armiesHere = milState.locationArmyIndex.get(siege.territoryId);
    if (armiesHere) {
      for (const aId of armiesHere) {
        const a = milState.armies.get(aId);
        if (!a) continue;
        const side = getWarSide(a.ownerId, war);
        if (side && side !== attackerSide) defenderIds.add(a.ownerId);
      }
    }

    const dim = getDaysInMonth(date.month);

    const defStats = siegeUtils.calcDefenderStats(siege.territoryId, defenderIds, milState.armies, milState.battalions);
    const monthlyAttritionRate = siegeUtils.calcDefenderAttritionRate(defStats.avgElite, defStats.avgMorale);
    siegeUtils.applyDefenderAttrition(
      siege.territoryId, defenderIds, monthlyAttritionRate / dim,
      milState.armies, milState.battalions,
      useMilitaryStore.getState().batchMutateBattalions,
    );

    const milAfter = useMilitaryStore.getState();
    // 合围：汇总同战争同位置所有 sieging 行营的兵力
    const allArmyIds: string[] = [];
    for (const c of useWarStore.getState().campaigns.values()) {
      if (c.warId === siege.warId && c.locationId === siege.territoryId && c.status === 'sieging') {
        allArmyIds.push(...c.armyIds);
      }
    }
    const troops = siegeUtils.calcCampaignTroops(allArmyIds, milAfter.armies, milAfter.battalions);
    const siegeValue = siegeUtils.calcTotalSiegeValue(allArmyIds, milAfter.armies, milAfter.battalions);
    // 损耗后重新收集守方 IDs（可能有人被清空，但 Set 不变即可）
    const defenderTroops = siegeUtils.calcDefenderTroops(siege.territoryId, defenderIds, milAfter.armies, milAfter.battalions);
    const monthlyProgress = siegeUtils.calcMonthlyProgress(troops, siegeValue, terr, defenderTroops);
    const dailyProgress = monthlyProgress / dim;
    const newProgress = Math.min(100, siege.progress + dailyProgress);

    if (newProgress >= 100) {
      // 城破！
      siegeUtils.applyDefenderAttrition(
        siege.territoryId, defenderIds, 1.0,
        useMilitaryStore.getState().armies, useMilitaryStore.getState().battalions,
        useMilitaryStore.getState().batchMutateBattalions,
      );

      terrStore.updateTerritory(siege.territoryId, { occupiedBy: campaign.ownerId });
      // 城破：仅解散和围攻方处于不同战争阵营的守军（敌方），不动盟友 / 第三方过境军队
      const milForDisband = useMilitaryStore.getState();
      const armiesAtLocation = milForDisband.locationArmyIndex.get(siege.territoryId);
      const warForSiege = useWarStore.getState().wars.get(siege.warId);
      const besiegerSide = warForSiege ? getWarSide(campaign.ownerId, warForSiege) : null;
      if (armiesAtLocation && warForSiege && besiegerSide) {
        for (const armyId of [...armiesAtLocation]) {
          const army = milForDisband.armies.get(armyId);
          if (!army) continue;
          const armySide = getWarSide(army.ownerId, warForSiege);
          // 严格判定：必须明确属于对面阵营才解散；同阵营盟友 / 与本战争无关的中立第三方均不动
          if (armySide && armySide !== besiegerSide) {
            useMilitaryStore.getState().disbandArmy(armyId);
          }
        }
      }

      // 战争分数：占领领地占主防御者总州数的比例（只看领袖领土，非全阵营）
      const warForScore = useWarStore.getState().wars.get(siege.warId);
      if (warForScore) {
        const attackerSide = isOnAttackerSide(campaign.ownerId, warForScore);
        // 敌方领袖的领土规模作为分母
        const enemyLeaderId = attackerSide ? warForScore.defenderId : warForScore.attackerId;
        const chars = useCharacterStore.getState().characters;
        const terrs = useTerritoryStore.getState().territories;

        const enemyRealmSize = getRealmZhouCount(enemyLeaderId, chars, terrs);
        // 己方阵营所有人的占领数
        const alliedIds = attackerSide
          ? [warForScore.attackerId, ...warForScore.attackerParticipants]
          : [warForScore.defenderId, ...warForScore.defenderParticipants];
        const alliedOccupySet = new Set(alliedIds);
        let occupiedCount = 0;
        for (const t of terrs.values()) {
          if (t.tier === 'zhou' && t.occupiedBy && alliedOccupySet.has(t.occupiedBy)) occupiedCount++;
        }
        const occupyRatio = occupiedCount / Math.max(1, enemyRealmSize);
        const occupyScore = Math.round(occupyRatio * 100);

        const newWarScore = attackerSide
          ? Math.max(warForScore.warScore, occupyScore)
          : Math.min(warForScore.warScore, -occupyScore);
        const clampedScore = Math.max(-100, Math.min(100, newWarScore));
        useWarStore.getState().updateWar(warForScore.id, { warScore: clampedScore });
      }

      // 围城天数 + 守方领袖姓名
      const siegeDays = diffDays(siege.startDate, date);
      const charStoreNow = useCharacterStore.getState();
      const attackerName = charStoreNow.getCharacter(campaign.ownerId)?.name ?? '?';
      // 守方：优先取领地原控制者（terr 的 holder/controller），其次取 defenderIds 第一个
      const defLeaderId = war.attackerId === campaign.ownerId ? war.defenderId : war.attackerId;
      const defLeaderName = charStoreNow.getCharacter(defLeaderId)?.name ?? '?';
      const defenderActors = [...defenderIds];

      useTurnManager.getState().addEvent({
        id: `siege-fall-${date.year}-${date.month}-${date.day}-${siege.territoryId}`,
        date,
        type: '城破',
        actors: [campaign.ownerId, ...defenderActors],
        territories: [siege.territoryId],
        description: `${attackerName}围${terr.name}${siegeDays}日，城破，守方${defLeaderName}失守`,
        priority: EventPriority.Major,
        payload: { siegeDays, attackerId: campaign.ownerId, defenderLeaderId: defLeaderId },
      });

      useWarStore.getState().endSiege(siege.id);
      // 城破：所有参与合围的行营回到 idle
      for (const c of useWarStore.getState().campaigns.values()) {
        if (c.warId === siege.warId && c.locationId === siege.territoryId && c.status === 'sieging') {
          useWarStore.getState().updateCampaign(c.id, { status: 'idle' });
        }
      }
    } else {
      useWarStore.getState().updateSiege(siege.id, { progress: newProgress });
    }
  }

  // ===== 行营 AI：idle 行营自动寻找下一个目标 =====
  {
    const ws = useWarStore.getState();
    const territories = useTerritoryStore.getState().territories;
    const aiPlayerId = useCharacterStore.getState().playerId;
    for (const campaign of ws.campaigns.values()) {
      if (campaign.status !== 'idle') continue;
      if (campaign.ownerId === aiPlayerId) continue;
      const war = ws.wars.get(campaign.warId);
      if (!war || war.status !== 'active') continue;

      const currTerr = territories.get(campaign.locationId);
      if (!currTerr) continue;
      const mySide = getWarSide(campaign.ownerId, war);
      const chars = useCharacterStore.getState().characters;
      if (!mySide) continue;

      // 在敌方领地且未被己方占领 → 通常留下围城，但如果已有别的战争在围城则继续寻路
      if (isEnemyTerritoryInWar(currTerr, mySide, war, chars) && currTerr.occupiedBy !== campaign.ownerId) {
        const siegeHere = useWarStore.getState().getSiegeAtTerritory(campaign.locationId);
        if (!siegeHere || siegeHere.warId === war.id) continue; // 无围城或本战争围城 → 留下
        // 有别的战争的围城 → 不等待，继续寻路找下一个目标
      }

      let bestTarget: string | null = null;
      let bestPath: string[] | null = null;
      let bestLen = Infinity;

      for (const t of territories.values()) {
        if (t.tier !== 'zhou') continue;
        if (!isEnemyTerritoryInWar(t, mySide, war, chars) || t.occupiedBy === campaign.ownerId) continue;
        // 跳过已被其他战争围城的领地（去了也围不了）
        const siegeThere = useWarStore.getState().getSiegeAtTerritory(t.id);
        if (siegeThere && siegeThere.warId !== war.id) continue;

        const path = findPath(campaign.locationId, t.id, campaign.ownerId, territories, chars);
        if (path && path.length < bestLen) {
          bestLen = path.length;
          bestTarget = t.id;
          bestPath = path;
        }
      }

      if (bestTarget && bestPath && bestPath.length > 1) {
        useWarStore.getState().setCampaignTarget(campaign.id, bestTarget, bestPath);
      }
    }
  }

  // ===== 战争自动结算 =====
  const playerId = useCharacterStore.getState().playerId;
  for (const war of useWarStore.getState().wars.values()) {
    if (war.status !== 'active') continue;

    const isPlayerWar = playerId && (war.attackerId === playerId || war.defenderId === playerId);

    const chars = useCharacterStore.getState().characters;
    const terrs = useTerritoryStore.getState().territories;

    const attackerRealm = getRealmZhouCount(war.attackerId, chars, terrs);
    const defenderRealm = getRealmZhouCount(war.defenderId, chars, terrs);
    if (defenderRealm === 0 || attackerRealm === 0) {
      settleWar(war.id, 'whitePeace');
      continue;
    }

    if (war.warScore >= 100) {
      // 玩家是攻方（占优）时让玩家手动强制媾和
      if (isPlayerWar && war.attackerId === playerId) continue;
      settleWar(war.id, 'attackerWin');
    } else if (war.warScore <= -100) {
      // 玩家是守方（占优）时让玩家手动强制媾和
      if (isPlayerWar && war.defenderId === playerId) continue;
      settleWar(war.id, 'defenderWin');
    }
  }

}
