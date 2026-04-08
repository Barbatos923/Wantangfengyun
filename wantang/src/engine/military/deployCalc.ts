// ===== 调兵部署计算（纯函数） =====

import type { Army, Battalion } from './types';
import type { Territory, Post } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import type { Personality } from '@data/traits';
import { positionMap } from '@data/positions';
import { ALL_EDGES } from '@data/mapTopology';
import { getArmyStrength } from './militaryCalc';

// ── 类型 ────────────────────────────────────────────────

/** 部署方案条目 */
export interface DeploymentEntry {
  armyId: string;
  fromLocationId: string;
  targetLocationId: string;
}

/** 一次草拟人提交：携带草拟人 id 用于审批时定向 CD/好感计算 */
export interface DeploySubmission {
  drafterId: string;
  entries: DeploymentEntry[];
}

// ── 辅助纯函数 ─────────────────────────────────────────

/** 获取领地的 grantsControl 主岗持有人 */
function getController(territory: Territory): string | null {
  const mainPost = territory.posts.find((p) => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.grantsControl === true;
  });
  return mainPost?.holderId ?? null;
}

/**
 * 计算军队的"归属州"：下辖营的 homeTerritory 中出现最多的州。
 * 若军队无营，fallback 到当前驻地。
 */
export function getArmyHomeTerritory(
  army: Army,
  battalions: Map<string, Battalion>,
): string {
  const count = new Map<string, number>();
  for (const batId of army.battalionIds) {
    const bat = battalions.get(batId);
    if (!bat) continue;
    count.set(bat.homeTerritory, (count.get(bat.homeTerritory) ?? 0) + 1);
  }
  let best = army.locationId;
  let bestCount = 0;
  for (const [tid, c] of count) {
    if (c > bestCount) {
      bestCount = c;
      best = tid;
    }
  }
  return best;
}

/** 构建州级邻接表（模块级缓存，ALL_EDGES 为静态数据只需构建一次） */
let _zhouAdjCache: Map<string, string[]> | null = null;
export function buildZhouAdjacency(): Map<string, string[]> {
  if (_zhouAdjCache) return _zhouAdjCache;
  const adj = new Map<string, string[]>();
  for (const edge of ALL_EDGES) {
    let fromList = adj.get(edge.from);
    if (!fromList) { fromList = []; adj.set(edge.from, fromList); }
    fromList.push(edge.to);

    let toList = adj.get(edge.to);
    if (!toList) { toList = []; adj.set(edge.to, toList); }
    toList.push(edge.from);
  }
  _zhouAdjCache = adj;
  return adj;
}

/**
 * 判断某个控制者是否是 rulerId 本人或其效忠链下属。
 */
function isOwnOrVassal(
  controllerId: string,
  rulerId: string,
  characters: Map<string, Character>,
): boolean {
  if (controllerId === rulerId) return true;
  let current = controllerId;
  const visited = new Set<string>();
  while (current) {
    const c = characters.get(current);
    if (!c?.overlordId) return false;
    if (c.overlordId === rulerId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = c.overlordId;
  }
  return false;
}

/** 获取 ruler 控制（含臣属控制）的所有 zhou */
function getRulerZhou(
  rulerId: string,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
): Territory[] {
  const result: Territory[] = [];
  for (const t of territories.values()) {
    if (t.tier !== 'zhou') continue;
    const ctrl = getController(t);
    if (ctrl && isOwnOrVassal(ctrl, rulerId, characters)) {
      result.push(t);
    }
  }
  return result;
}

// ── 边境威胁评估 ────────────────────────────────────────

export interface BorderThreat {
  territoryId: string;
  threatLevel: number; // 0~100，越高越危险
  /** 产生最大威胁的那个相邻敌方州 ID */
  enemyNeighborId: string;
  /** 该相邻敌方州当前的驻军总战力（用于按兵力匹配派兵） */
  enemyGarrisonStrength: number;
}

/**
 * 一次扫描所有领地，构建持有辟署权岗位的角色 Set。
 * O(territories × posts)，调用方可复用结果做 O(1) 查询。
 */
function buildAppointRightSet(territories: Map<string, Territory>): Set<string> {
  const set = new Set<string>();
  for (const t of territories.values()) {
    for (const p of t.posts) {
      if (p.holderId && p.hasAppointRight) set.add(p.holderId);
    }
  }
  return set;
}

/**
 * 沿 overlordId 链向上找第一个拥有辟署权的角色（含 startId 自身）。
 * 这是"真正可能向你发起攻击的最近独立势力"——半独立藩镇可以自主开战，
 * 但完全臣服于上级的州刺史无独立军事意志，应跨过他评估上级。
 * 链上找不到时回退到链顶（接近"顶级领主"语义）。
 */
function findFirstAppointRightAncestor(
  startId: string,
  characters: Map<string, Character>,
  appointRightSet: Set<string>,
): string {
  let cur = startId;
  const visited = new Set<string>();
  while (true) {
    if (appointRightSet.has(cur)) return cur;
    const c = characters.get(cur);
    if (!c?.overlordId || visited.has(cur)) return cur; // 到顶或环路 → 回退用当前
    visited.add(cur);
    cur = c.overlordId;
  }
}

/**
 * 一次扫描所有军队，按 locationId 累加战力。
 * 调用方拿到 Map 后查询是 O(1)，避免每个威胁州都做一次全量扫描。
 */
function buildStrengthByLocation(
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const army of armies.values()) {
    const s = getArmyStrength(army, battalions);
    if (s <= 0) continue;
    m.set(army.locationId, (m.get(army.locationId) ?? 0) + s);
  }
  return m;
}

/**
 * 评估边境威胁：遍历 ruler 领地的边境州，
 * 检查相邻的非己方势力，根据好感度评定威胁。
 * 好感 < -30 → 威胁，越低威胁越高。
 *
 * 同时记录产生最大威胁的相邻敌方州 + 该州当前驻军总战力，
 * 供 planDeployments 按兵力匹配派兵使用。
 */
export function assessBorderThreats(
  rulerId: string,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  getOpinion: (aId: string, bId: string) => number,
  armies: Map<string, Army>,
  battalions: Map<string, Battalion>,
): BorderThreat[] {
  const adj = buildZhouAdjacency();
  const rulerZhou = getRulerZhou(rulerId, territories, characters);
  const rulerZhouIds = new Set(rulerZhou.map((t) => t.id));

  // 一次性构建辟署权 Set，链上溯查询 O(1)
  const appointRightSet = buildAppointRightSet(territories);
  // 一次性构建 location → 驻军战力 索引，避免每个威胁州做全量扫描
  const strengthByLocation = buildStrengthByLocation(armies, battalions);

  const threats: BorderThreat[] = [];

  for (const zhou of rulerZhou) {
    const neighbors = adj.get(zhou.id) ?? [];
    let maxThreat = 0;
    let maxNeighborId = '';

    for (const nId of neighbors) {
      if (rulerZhouIds.has(nId)) continue; // 己方领地，跳过
      const nTerr = territories.get(nId);
      if (!nTerr) continue;
      const nCtrl = getController(nTerr);
      if (!nCtrl) continue;
      if (isOwnOrVassal(nCtrl, rulerId, characters)) continue; // 己方臣属

      // 沿效忠链向上找第一个有辟署权的人——即真正能独立发起进攻的对象。
      // 完全臣服的下级（无辟署权）没有独立军事意志，跳过评估其上级。
      const threatActor = findFirstAppointRightAncestor(nCtrl, characters, appointRightSet);

      const opinion = getOpinion(rulerId, threatActor);
      if (opinion < -30) {
        // 好感 -30~-100 → 威胁 1~70
        const threat = Math.min(70, Math.floor((-30 - opinion) * 1.0));
        if (threat > maxThreat) {
          maxThreat = threat;
          maxNeighborId = nId;
        }
      }
    }

    if (maxThreat > 0) {
      threats.push({
        territoryId: zhou.id,
        threatLevel: maxThreat,
        enemyNeighborId: maxNeighborId,
        enemyGarrisonStrength: strengthByLocation.get(maxNeighborId) ?? 0,
      });
    }
  }

  // 按威胁等级降序
  threats.sort((a, b) => b.threatLevel - a.threatLevel);
  return threats;
}

// ── 部署方案生成 ─────────────────────────────────────────

/**
 * 生成部署方案。
 *
 * 逻辑：
 * 1. 无边境威胁时：不在归属州的军队调回归属州
 * 2. 有边境威胁时：内地军队按比例调往威胁边境（比例受 boldness 影响）
 * 3. 跳过已在行营中的军队和已在目标位置的军队
 */
export function planDeployments(
  rulerId: string,
  armies: Army[],
  battalions: Map<string, Battalion>,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  getOpinion: (aId: string, bId: string) => number,
  campaignArmyIds: Set<string>,
  personality: Personality,
  /** 全部军队（用于计算敌方/我方驻边境兵力）；不传则退化为旧的简化版本 */
  allArmies?: Map<string, Army>,
): DeploymentEntry[] {
  // 可调动的军队（未编入行营）
  const available = armies.filter((a) => !campaignArmyIds.has(a.id));
  if (available.length === 0) return [];

  // assessBorderThreats 需要全部军队的快照来算敌方驻军；
  // 没传 allArmies 时退化：只用己方 armies 列表（敌方驻军=0）。
  const armiesMap = allArmies ?? new Map(armies.map((a) => [a.id, a]));
  const threats = assessBorderThreats(
    rulerId, territories, characters, getOpinion, armiesMap, battalions,
  );

  const entries: DeploymentEntry[] = [];

  if (threats.length === 0) {
    // ── 无威胁：调回归属州 ──
    for (const army of available) {
      const home = getArmyHomeTerritory(army, battalions);
      if (army.locationId !== home) {
        entries.push({
          armyId: army.id,
          fromLocationId: army.locationId,
          targetLocationId: home,
        });
      }
    }
    return entries;
  }

  // ── 有威胁：按敌方驻边境兵力匹配派兵 ──
  // 调动比例：30%~50%，boldness 越高上限越高
  const deployRatio = 0.3 + personality.boldness * 0.2;
  const deployBudget = Math.max(1, Math.round(available.length * deployRatio));

  const threatIds = new Set(threats.map((t) => t.territoryId));
  const armiesAtBorder = available.filter((a) => threatIds.has(a.locationId));
  const armiesInland = available.filter((a) => !threatIds.has(a.locationId));

  // 已驻在威胁边境的军队不消耗 budget（它们已经"到位"，不产生 entry）
  // budget 仅约束需要"出征"的内地军队数量
  let remainingBudget = deployBudget;

  // 计算每个 threat 上"我方已驻兵力"（含 already-at-border 的我方军队）
  const friendlyAtBorder = new Map<string, number>();
  for (const threat of threats) {
    let s = 0;
    for (const a of armiesAtBorder) {
      if (a.locationId === threat.territoryId) s += getArmyStrength(a, battalions);
    }
    friendlyAtBorder.set(threat.territoryId, s);
  }

  // 内地军队按战力升序，便于贪心匹配（先用小军凑数）
  const candidates = armiesInland
    .map((a) => ({ army: a, strength: getArmyStrength(a, battalions) }))
    .filter((c) => c.strength > 0)
    .sort((x, y) => x.strength - y.strength);
  const used = new Set<string>();

  // 按威胁等级降序处理（已经按 threatLevel 降序）
  for (const threat of threats) {
    if (remainingBudget <= 0) break;
    const already = friendlyAtBorder.get(threat.territoryId) ?? 0;
    let demand = Math.max(0, threat.enemyGarrisonStrength - already);
    if (demand <= 0) continue; // 该方向已足以应对（或敌方边境空虚）

    // 贪心：从候选里挑战力 ≤ demand 的最大那支；都比 demand 大则挑最小那支补足
    while (demand > 0 && remainingBudget > 0) {
      // 找未使用的、≤ demand 的最大候选
      let pick: typeof candidates[number] | null = null;
      for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i];
        if (used.has(c.army.id)) continue;
        if (c.strength <= demand) { pick = c; break; }
      }
      if (!pick) {
        // 没有 ≤ demand 的，挑最小未用的（一支大军把 demand 一次填满或超出）
        for (const c of candidates) {
          if (!used.has(c.army.id)) { pick = c; break; }
        }
      }
      if (!pick) break; // 候选耗尽

      used.add(pick.army.id);
      entries.push({
        armyId: pick.army.id,
        fromLocationId: pick.army.locationId,
        targetLocationId: threat.territoryId,
      });
      demand -= pick.strength;
      remainingBudget--;
    }
  }

  // 剩余未派出且不在归属州的内地军队 → 召回归位（不消耗 budget）
  for (const army of armiesInland) {
    if (used.has(army.id)) continue;
    const home = getArmyHomeTerritory(army, battalions);
    if (army.locationId !== home) {
      entries.push({
        armyId: army.id,
        fromLocationId: army.locationId,
        targetLocationId: home,
      });
    }
  }

  return entries;
}

// ── 草拟人解析 ───────────────────────────────────────────

/**
 * 四级草拟人岗位 templateId：
 * - 天下(皇帝) → 兵部尚书
 * - 国(王/行台尚书令) → 国司马
 * - 道(节度使/观察使) → 都知兵马使
 * - 州(刺史/防御使) → 录事参军
 */
const DRAFTER_TEMPLATE_IDS = new Set([
  'pos-bingbu-shangshu',
  'pos-guo-sima',
  'pos-duzhibingmashi',
  'pos-lushibcanjun',
]);

/**
 * 判断 actorId 是否是某个 ruler 的调兵草拟人，返回对应的 rulerId。
 *
 * 逻辑：直接检测 actor 是否持有四个草拟人岗位之一，
 * 若是则找该岗位所在领地的 grantsControl 主岗持有人作为 ruler。
 */
export function resolveDeployDrafter(
  actorId: string,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): { rulerId: string } | null {
  // 1. 检查中央岗位（兵部尚书 → ruler 为皇帝）
  for (const p of centralPosts) {
    if (p.holderId === actorId && DRAFTER_TEMPLATE_IDS.has(p.templateId)) {
      // 找皇帝
      const emperor = centralPosts.find((cp) => cp.templateId === 'pos-emperor')?.holderId;
      if (emperor) return { rulerId: emperor };
      // fallback: 从天下领地找
      for (const t of territories.values()) {
        if (t.tier === 'tianxia') {
          const ep = t.posts.find((tp) => tp.templateId === 'pos-emperor');
          if (ep?.holderId) return { rulerId: ep.holderId };
        }
      }
      return null;
    }
  }

  // 2. 检查领地岗位（国司马/都知兵马使/录事参军 → ruler 为所在领地主岗持有人）
  for (const t of territories.values()) {
    for (const p of t.posts) {
      if (p.holderId !== actorId) continue;
      if (!DRAFTER_TEMPLATE_IDS.has(p.templateId)) continue;
      const ruler = getController(t);
      if (ruler) return { rulerId: ruler };
    }
  }

  return null;
}
