// ===== Voronoi 多边形预计算 =====

import { Delaunay } from 'd3-delaunay';
import { ZHOU_POSITIONS } from './mapTopology';

// ── 晚唐疆域粗略轮廓（手绘，逆时针方向，用于 Sutherland-Hodgman 裁剪）──
// 坐标基于 viewBox 0 0 1600 1000
const REALM_OUTLINE_CW: [number, number][] = [
  // 西北：河西走廊（沙州 x=120，往西留余量）
  [10, 130],
  [60, 120],
  [140, 120],
  [220, 140],
  // 北部：关内→河东→河北
  [330, 130],
  [430, 180],
  [520, 100],
  [600, 90],
  [680, 110],
  [760, 70],
  // 东北：幽州
  [830, 100],
  [870, 160],
  // 东部沿海：山东半岛凸出（青州 x=850, y=320）
  [900, 240],
  [940, 280],
  [950, 320],  // 半岛顶端
  [930, 360],
  // 淮南→江南
  [910, 440],
  [900, 500],
  [960, 560],
  [980, 630],
  [970, 700],
  // 东南：岭南
  [900, 760],
  [820, 840],
  [750, 860],
  // 南部沿海→交州（安南，向正南延伸）
  [650, 860],
  [580, 870],
  [530, 910],
  [500, 960],  // 交州最南端
  [450, 960],
  [420, 910],
  // 邕州→剑南过渡
  [400, 820],
  [320, 760],
  // 剑南（成都 x=300, y=510，往西南拓展）
  [220, 700],
  [190, 620],
  [200, 550],
  [220, 500],
  // 西部：陇右→关内
  [220, 420],
  [210, 340],
  [180, 260],
  [80, 210],
  [10, 190],
];
const REALM_OUTLINE = REALM_OUTLINE_CW;

type Point = [number, number];

// ── Voronoi 生成 ──

const points = ZHOU_POSITIONS.map(p => [p.x, p.y] as [number, number]);
const delaunay = Delaunay.from(points);
const voronoi = delaunay.voronoi([0, 0, 1600, 1000]);

// ── 预计算每个州的裁剪后多边形 ──

export interface VoronoiCell {
  id: string;
  /** SVG path d 属性 */
  path: string;
  /** 质心坐标（用于标签定位） */
  cx: number;
  cy: number;
  /** 多边形顶点 */
  polygon: Point[];
}

/** 每个州的 Voronoi 多边形 */
export const voronoiCells = new Map<string, VoronoiCell>();

for (let i = 0; i < ZHOU_POSITIONS.length; i++) {
  const pos = ZHOU_POSITIONS[i];
  const rawCell = voronoi.cellPolygon(i);
  if (!rawCell) continue;

  // rawCell 是闭合的（首尾相同），去掉尾部重复
  const raw: Point[] = rawCell.slice(0, -1) as Point[];

  // 直接使用矩形边界 Voronoi（疆域轮廓裁剪由 SVG clipPath 完成）
  const cellPoints = raw;
  if (cellPoints.length < 3) continue;

  // 计算质心
  let cx = 0, cy = 0;
  for (const [x, y] of cellPoints) { cx += x; cy += y; }
  cx /= cellPoints.length;
  cy /= cellPoints.length;

  // 生成 SVG path
  const path = 'M' + cellPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';

  voronoiCells.set(pos.id, { id: pos.id, path, cx, cy, polygon: cellPoints });
}

// ── 疆域轮廓 SVG path ──
export const realmOutlinePath =
  'M' + REALM_OUTLINE.map(([x, y]) => `${x},${y}`).join('L') + 'Z';

// ── 共享边界提取 ──

export interface SharedEdge {
  from: string;  // 州 ID
  to: string;    // 州 ID
  /** 共享边界的线段端点对 */
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

/** 相邻州之间的共享边界 */
export const sharedEdges: SharedEdge[] = [];

// 从 Delaunay 三角剖分提取相邻关系和共享边
// Voronoi 的每条脊线(ridge)分隔两个相邻的站点
{
  const edgeMap = new Map<string, SharedEdge>();

  // 遍历所有 Delaunay 三角形的半边
  for (let e = 0; e < delaunay.halfedges.length; e++) {
    const opp = delaunay.halfedges[e];
    if (opp < e) continue; // 每条边只处理一次

    const i = delaunay.triangles[e];
    const j = delaunay.triangles[opp];
    if (i >= ZHOU_POSITIONS.length || j >= ZHOU_POSITIONS.length) continue;

    const idA = ZHOU_POSITIONS[i].id;
    const idB = ZHOU_POSITIONS[j].id;
    const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;

    // Voronoi 脊线的两个端点是对应三角形的外心
    const triA = Math.floor(e / 3);
    const triB = Math.floor(opp / 3);
    const [ax, ay] = voronoiCircumcenter(triA);
    const [bx, by] = voronoiCircumcenter(triB);

    let se = edgeMap.get(key);
    if (!se) {
      se = { from: idA < idB ? idA : idB, to: idA < idB ? idB : idA, segments: [] };
      edgeMap.set(key, se);
    }
    se.segments.push({ x1: ax, y1: ay, x2: bx, y2: by });
  }

  sharedEdges.push(...edgeMap.values());
}

function voronoiCircumcenter(triIndex: number): [number, number] {
  const i0 = delaunay.triangles[triIndex * 3];
  const i1 = delaunay.triangles[triIndex * 3 + 1];
  const i2 = delaunay.triangles[triIndex * 3 + 2];
  const [ax, ay] = points[i0];
  const [bx, by] = points[i1];
  const [cx, cy] = points[i2];
  const dx = bx - ax, dy = by - ay;
  const ex = cx - ax, ey = cy - ay;
  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 2 * (dx * ey - dy * ex);
  if (Math.abs(d) < 1e-10) return [(ax + bx + cx) / 3, (ay + by + cy) / 3];
  return [
    ax + (ey * bl - dy * cl) / d,
    ay + (dx * cl - ex * bl) / d,
  ];
}

/** 按 ID 对查找共享边界 */
export const sharedEdgeMap = new Map<string, SharedEdge>();
for (const se of sharedEdges) {
  sharedEdgeMap.set(`${se.from}|${se.to}`, se);
  sharedEdgeMap.set(`${se.to}|${se.from}`, se);
}
