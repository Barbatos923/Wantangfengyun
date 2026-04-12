// ===== NpcContext 工厂：月结快照构建 =====

import type { NpcContext } from './types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { calcPersonality } from '@engine/character/personalityUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { useSchemeStore, SCHEME_PER_TARGET_CD_DAYS } from '@engine/scheme/SchemeStore';
import { toAbsoluteDay } from '@engine/dateUtils';
import { buildZhouAdjacency } from '@engine/military/deployCalc';
import { getActualController } from '@engine/official/postQueries';
import { positionMap } from '@data/positions';

/** 节度使级阈值（realm 主权层级的下限），getPeerNeighbors 返回值的硬过滤 */
const PEER_NEIGHBOR_MIN_RANK = 17;

/**
 * 一次性从所有 Store 读取快照，构建 NpcContext。
 * 此后 behavior 模块的 generateTask 只使用 context 参数，不直接调 getState()。
 */
export function buildNpcContext(): NpcContext {
  const charState = useCharacterStore.getState();
  const terrState = useTerritoryStore.getState();
  const turnState = useTurnManager.getState();
  const milState = useMilitaryStore.getState();
  const warState = useWarStore.getState();

  const { characters, vassalIndex, locationIndex } = charState;
  const { territories, centralPosts, expectedLegitimacy, controllerIndex, postIndex, holderIndex, policyOpinionCache } = terrState;
  const { armies, battalions } = milState;

  // ── 预计算缓存 ──

  const personalityCache = new Map<string, import('@data/traits').Personality>();
  const rankLevelCache = new Map<string, number>();

  for (const char of characters.values()) {
    if (!char.alive) continue;
    personalityCache.set(char.id, calcPersonality(char));
    rankLevelCache.set(char.id, char.official?.rankLevel ?? 0);
  }

  // ── lazy-cached 好感度 ──

  const opinionCacheMap = new Map<string, Map<string, number>>();

  function getOpinion(aId: string, bId: string): number {
    let innerMap = opinionCacheMap.get(aId);
    if (innerMap) {
      const cached = innerMap.get(bId);
      if (cached !== undefined) return cached;
    } else {
      innerMap = new Map();
      opinionCacheMap.set(aId, innerMap);
    }
    const a = characters.get(aId);
    const b = characters.get(bId);
    if (!a || !b) {
      innerMap.set(bId, 0);
      return 0;
    }
    const bExpectedLeg = expectedLegitimacy.get(bId) ?? null;
    const aPolicyOp = policyOpinionCache.get(aId) ?? null;
    const bPolicyOp = policyOpinionCache.get(bId) ?? null;
    const value = calculateBaseOpinion(a, b, bExpectedLeg, aPolicyOp, bPolicyOp);
    innerMap.set(bId, value);
    return value;
  }

  // ── lazy-cached 兵力 ──

  const militaryCache = new Map<string, number>();

  function getMilitaryStrength(charId: string): number {
    const cached = militaryCache.get(charId);
    if (cached !== undefined) return cached;
    const armies = milState.getArmiesByOwner(charId);
    let total = 0;
    for (const army of armies) {
      total += getArmyStrength(army, milState.battalions);
    }
    militaryCache.set(charId, total);
    return total;
  }

  // ── 活跃战争 ──

  const activeWars = warState.getActiveWars();

  // ── 停战 / 同盟检查（闭包捕获 warState + 当前绝对日） ──
  const currentDay = toAbsoluteDay(turnState.currentDate);
  const hasTruce = (a: string, b: string) => warState.hasTruce(a, b, currentDay);
  const hasAlliance = (a: string, b: string) => warState.hasAlliance(a, b, currentDay);
  const getAllies = (charId: string) => warState.getAllies(charId, currentDay);

  // ── 国库预聚合 ──

  const capitalTreasury = new Map<string, { money: number; grain: number }>();
  const totalTreasury = new Map<string, { money: number; grain: number }>();

  for (const char of characters.values()) {
    if (!char.alive) continue;
    // capital 州国库
    if (char.capital) {
      const t = territories.get(char.capital);
      if (t?.treasury) {
        capitalTreasury.set(char.id, { money: t.treasury.money, grain: t.treasury.grain });
      }
    }
    // 总国库
    const terrIds = controllerIndex.get(char.id);
    if (terrIds && terrIds.size > 0) {
      let money = 0, grain = 0;
      for (const tid of terrIds) {
        const t = territories.get(tid);
        if (t?.treasury) { money += t.treasury.money; grain += t.treasury.grain; }
      }
      totalTreasury.set(char.id, { money, grain });
    }
  }

  // ── 计谋预聚合（活跃数量 + per-target CD 索引） ──
  // 一次性快照，generateTask 阶段保持一致视图；executeInitiateScheme 内部仍做实时 stale 校验。
  const schemeCounts = new Map<string, number>();
  // schemeCdIndex：key = `initiatorId|primaryTargetId|schemeTypeId`，value = CD 解锁绝对日
  // active scheme 用 Number.POSITIVE_INFINITY 标记"永远阻塞"
  const schemeCdIndex = new Map<string, number>();
  for (const scheme of useSchemeStore.getState().schemes.values()) {
    if (scheme.status === 'active') {
      schemeCounts.set(scheme.initiatorId, (schemeCounts.get(scheme.initiatorId) ?? 0) + 1);
      const key = `${scheme.initiatorId}|${scheme.primaryTargetId}|${scheme.schemeTypeId}`;
      schemeCdIndex.set(key, Number.POSITIVE_INFINITY);
      continue;
    }
    if (scheme.status === 'terminated') continue;
    // success / failure / exposed：按 resolveDate 计 CD
    if (!scheme.resolveDate) continue;
    const resolveAbs = toAbsoluteDay(scheme.resolveDate);
    const key = `${scheme.initiatorId}|${scheme.primaryTargetId}|${scheme.schemeTypeId}`;
    const existing = schemeCdIndex.get(key);
    // 同 key 多次命中时保留最新（包括已经被 active 标为 Infinity 的情况）
    if (existing === undefined || (existing !== Number.POSITIVE_INFINITY && resolveAbs > existing)) {
      schemeCdIndex.set(key, resolveAbs);
    }
  }

  function hasRecentSchemeOnTarget(initiatorId: string, primaryTargetId: string, schemeTypeId: string): boolean {
    const key = `${initiatorId}|${primaryTargetId}|${schemeTypeId}`;
    const resolveAbs = schemeCdIndex.get(key);
    if (resolveAbs === undefined) return false;
    if (resolveAbs === Number.POSITIVE_INFINITY) return true;  // active scheme
    return currentDay - resolveAbs < SCHEME_PER_TARGET_CD_DAYS;
  }

  // ── lazy 缓存：相邻同级 ruler ──
  // 多个 NPC 行为（离间 / 未来的宣战 AI / 外交事件）会共用"某角色相邻的节度使级 rulers"查询。
  // 首次 ~500-1500 ops（realm 边界展开 + 一跳邻接 + overlord 链上溯），之后 O(1) 命中缓存。
  const peerNeighborsCache = new Map<string, ReadonlySet<string>>();
  const zhouAdjacency = buildZhouAdjacency();  // 模块级缓存，buildNpcContext 内引用一次

  /** 计算某角色的 realm zhou set：自己直辖 + 直属 vassal 直辖（都过滤 tier === 'zhou'） */
  function buildRealmZhouSet(charId: string): Set<string> {
    const realmZhouSet = new Set<string>();
    function addZhou(id: string): void {
      const terrIds = controllerIndex.get(id);
      if (!terrIds) return;
      for (const tid of terrIds) {
        const t = territories.get(tid);
        if (t?.tier === 'zhou') realmZhouSet.add(tid);
      }
    }
    addZhou(charId);
    const vassals = vassalIndex.get(charId);
    if (vassals) {
      for (const vId of vassals) addZhou(vId);
    }
    return realmZhouSet;
  }

  /** 沿 overlord 链上溯到第一个 minRank ≥ PEER_NEIGHBOR_MIN_RANK 的祖先 */
  function findPeerLeader(startId: string): string | null {
    let current: string | undefined = startId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      const c = characters.get(current);
      if (!c) return null;
      // 计算 maxMinRank
      const postIds = holderIndex.get(c.id) ?? [];
      let maxRank = 0;
      for (const pid of postIds) {
        const post = postIndex.get(pid);
        if (!post) continue;
        const tmpl = positionMap.get(post.templateId);
        if (tmpl && tmpl.minRank > maxRank) maxRank = tmpl.minRank;
      }
      if (maxRank >= PEER_NEIGHBOR_MIN_RANK) return c.id;
      visited.add(current);
      current = c.overlordId;
    }
    return null;
  }

  function getPeerNeighbors(charId: string): ReadonlySet<string> {
    const cached = peerNeighborsCache.get(charId);
    if (cached) return cached;

    const result = new Set<string>();
    const realmZhouSet = buildRealmZhouSet(charId);

    if (realmZhouSet.size > 0) {
      for (const z of realmZhouSet) {
        const neighbors = zhouAdjacency.get(z);
        if (!neighbors) continue;
        for (const n of neighbors) {
          if (realmZhouSet.has(n)) continue;  // realm 内部跳过
          const nTerr = territories.get(n);
          if (!nTerr) continue;
          const ctrl = getActualController(nTerr);
          if (!ctrl) continue;
          const peer = findPeerLeader(ctrl);
          if (peer && peer !== charId) result.add(peer);
        }
      }
    }

    peerNeighborsCache.set(charId, result);
    return result;
  }

  return {
    date: { ...turnState.currentDate },
    era: turnState.era,
    characters,
    territories,
    centralPosts,
    playerId: charState.playerId,
    personalityCache,
    rankLevelCache,
    expectedLegitimacyCache: expectedLegitimacy,
    getOpinion,
    getMilitaryStrength,
    hasTruce,
    hasAlliance,
    getAllies,
    vassalIndex,
    locationIndex,
    armies,
    battalions,
    controllerIndex,
    postIndex,
    holderIndex,
    activeWars,
    capitalTreasury,
    totalTreasury,
    schemeCounts,
    hasRecentSchemeOnTarget,
    spymasters: useSchemeStore.getState().spymasters,
    getPeerNeighbors,
    ledgers: useLedgerStore.getState().allLedgers,
    treasuryHistory: useLedgerStore.getState().treasuryHistory,
    appointedThisRound: new Set(),
  };
}
