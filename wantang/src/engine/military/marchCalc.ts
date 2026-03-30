// ===== 行军计算（纯函数） =====

import type { Territory } from '@engine/territory/types';
import { ALL_EDGES } from '@data/mapTopology';
import { positionMap } from '@data/positions';

// ── 路径寻找 ──

/** 获取州的控制者ID */
function getController(territory: Territory): string | null {
  const mainPost = territory.posts.find((p) => {
    const tpl = positionMap.get(p.templateId);
    return tpl?.grantsControl === true;
  });
  return mainPost?.holderId ?? null;
}

/** 获取州的关隘等级（0 = 无关隘） */
function getPassLevel(territory: Territory): number {
  return territory.passLevel ?? 0;
}

/** 构建邻接表 */
function buildAdjacency(): Map<string, string[]> {
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
 * BFS 最短路径。
 * 有关隘+被敌方控制的州不可穿越（必须先围城攻克）。
 * 无关隘的州可自由穿越（包括敌方领地）。
 * 返回路径（含起点和终点），无路径返回 null。
 */
export function findPath(
  from: string,
  to: string,
  ownerId: string,
  territories: Map<string, Territory>,
): string[] | null {
  if (from === to) return [from];

  const adj = buildAdjacency();
  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: string[] = [from];
  visited.add(from);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adj.get(current) ?? [];

    for (const next of neighbors) {
      if (visited.has(next)) continue;

      // 检查是否可穿越
      if (next !== to) {
        const terr = territories.get(next);
        if (terr) {
          const controller = getController(terr);
          const passLevel = getPassLevel(terr);
          // 有关隘 + 非己方控制 → 不可穿越
          if (passLevel > 0 && controller !== ownerId) {
            continue;
          }
        }
      }

      visited.add(next);
      parent.set(next, current);

      if (next === to) {
        // 重建路径
        const path: string[] = [];
        let node: string | undefined = to;
        while (node !== undefined) {
          path.unshift(node);
          node = parent.get(node);
        }
        return path;
      }

      queue.push(next);
    }
  }

  return null; // 无路径
}

// ── 集结时间 ──

/**
 * 计算军队从当前位置到行营集结点的集结时间（回合数）。
 * 同道=0，同国=1，不同国=2。
 */
export function getMusteringTime(
  armyLocationId: string,
  campaignLocationId: string,
  territories: Map<string, Territory>,
): number {
  if (armyLocationId === campaignLocationId) return 0;

  const armyTerr = territories.get(armyLocationId);
  const campTerr = territories.get(campaignLocationId);
  if (!armyTerr || !campTerr) return 2;

  // 同道
  if (armyTerr.parentId && armyTerr.parentId === campTerr.parentId) return 0;

  // 同国：道的 parentId 是国
  const armyDao = armyTerr.parentId ? territories.get(armyTerr.parentId) : undefined;
  const campDao = campTerr.parentId ? territories.get(campTerr.parentId) : undefined;
  if (armyDao?.parentId && armyDao.parentId === campDao?.parentId) return 1;

  return 2;
}

// ── 补给系数 ──

/**
 * 计算补给系数。
 * 1 + (陆路经过州数 × 0.1) + (水路经过州数 × 0.03)
 * 己方领地的距离减半。
 */
export function getSupplyCoefficient(
  route: string[],
  ownerId: string,
  territories: Map<string, Territory>,
): number {
  if (route.length <= 1) return 1;

  let landHops = 0;
  let waterHops = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const from = route[i];
    const to = route[i + 1];

    // 查找边的类型
    const edge = ALL_EDGES.find(
      (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
    );
    const isWater = edge?.type === 'water';

    // 是否己方领地（减半）
    const toTerr = territories.get(to);
    const isOwned = toTerr ? getController(toTerr) === ownerId : false;
    const weight = isOwned ? 0.5 : 1;

    if (isWater) {
      waterHops += weight;
    } else {
      landHops += weight;
    }
  }

  return 1 + landHops * 0.1 + waterHops * 0.03;
}
