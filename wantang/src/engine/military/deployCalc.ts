// ===== 调兵部署计算（纯函数） =====

import type { Army, Battalion } from './types';
import type { Territory, Post } from '@engine/territory/types';
import type { Character } from '@engine/character/types';
import type { Personality } from '@data/traits';
import { positionMap } from '@data/positions';
import { ALL_EDGES } from '@data/mapTopology';

// ── 类型 ────────────────────────────────────────────────

/** 部署方案条目 */
export interface DeploymentEntry {
  armyId: string;
  fromLocationId: string;
  targetLocationId: string;
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

/** 构建州级邻接表 */
function buildZhouAdjacency(): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of ALL_EDGES) {
    let fromList = adj.get(edge.from);
    if (!fromList) { fromList = []; adj.set(edge.from, fromList); }
    fromList.push(edge.to);

    let toList = adj.get(edge.to);
    if (!toList) { toList = []; adj.set(edge.to, toList); }
    toList.push(edge.from);
  }
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
}

/**
 * 评估边境威胁：遍历 ruler 领地的边境州，
 * 检查相邻的非己方势力，根据好感度评定威胁。
 * 好感 < -30 → 威胁，越低威胁越高。
 */
export function assessBorderThreats(
  rulerId: string,
  territories: Map<string, Territory>,
  characters: Map<string, Character>,
  getOpinion: (aId: string, bId: string) => number,
): BorderThreat[] {
  const adj = buildZhouAdjacency();
  const rulerZhou = getRulerZhou(rulerId, territories, characters);
  const rulerZhouIds = new Set(rulerZhou.map((t) => t.id));

  const threats: BorderThreat[] = [];

  for (const zhou of rulerZhou) {
    const neighbors = adj.get(zhou.id) ?? [];
    let maxThreat = 0;

    for (const nId of neighbors) {
      if (rulerZhouIds.has(nId)) continue; // 己方领地，跳过
      const nTerr = territories.get(nId);
      if (!nTerr) continue;
      const nCtrl = getController(nTerr);
      if (!nCtrl) continue;
      if (isOwnOrVassal(nCtrl, rulerId, characters)) continue; // 己方臣属

      // 找邻居控制者的顶级领主来评估关系
      let topLord = nCtrl;
      const visited = new Set<string>();
      while (true) {
        const c = characters.get(topLord);
        if (!c?.overlordId || visited.has(topLord)) break;
        visited.add(topLord);
        topLord = c.overlordId;
      }

      const opinion = getOpinion(rulerId, topLord);
      if (opinion < -30) {
        // 好感 -30~-100 → 威胁 1~70
        const threat = Math.min(70, Math.floor((-30 - opinion) * 1.0));
        if (threat > maxThreat) maxThreat = threat;
      }
    }

    if (maxThreat > 0) {
      threats.push({ territoryId: zhou.id, threatLevel: maxThreat });
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
): DeploymentEntry[] {
  // 可调动的军队（未编入行营）
  const available = armies.filter((a) => !campaignArmyIds.has(a.id));
  if (available.length === 0) return [];

  const threats = assessBorderThreats(rulerId, territories, characters, getOpinion);
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
  } else {
    // ── 有威胁：调兵到边境 ──
    // 调动比例：30% ~ 50%，boldness 越高调动越多
    const deployRatio = 0.3 + personality.boldness * 0.2;
    const deployCount = Math.max(1, Math.round(available.length * deployRatio));

    // 已在威胁边境的军队不需要调动
    const threatIds = new Set(threats.map((t) => t.territoryId));
    const armiesAtBorder = available.filter((a) => threatIds.has(a.locationId));
    const armiesInland = available.filter((a) => !threatIds.has(a.locationId));

    // 还需要调几支到边境
    const needed = Math.max(0, deployCount - armiesAtBorder.length);
    const toMove = armiesInland.slice(0, needed);

    // 按威胁等级分配：优先填充最危险的边境
    let threatIdx = 0;
    for (const army of toMove) {
      if (threatIdx >= threats.length) threatIdx = 0; // 轮转
      entries.push({
        armyId: army.id,
        fromLocationId: army.locationId,
        targetLocationId: threats[threatIdx].territoryId,
      });
      threatIdx++;
    }

    // 剩余不在归属州的内地军队调回归属州
    const movedIds = new Set(toMove.map((a) => a.id));
    for (const army of armiesInland) {
      if (movedIds.has(army.id)) continue;
      const home = getArmyHomeTerritory(army, battalions);
      if (army.locationId !== home) {
        entries.push({
          armyId: army.id,
          fromLocationId: army.locationId,
          targetLocationId: home,
        });
      }
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
