// ===== 地图拓扑 =====

/** 州坐标 */
export interface ZhouPos {
  id: string;
  x: number;
  y: number;
  r: number; 
}

// 49 州坐标 — 基于晚唐真实地理，viewBox 0 0 1600 1000
export const ZHOU_POSITIONS: ZhouPos[] = [
  // 京畿道
  { id: 'zhou-changan',    x: 420, y: 380, r: 16 },
  { id: 'zhou-fengxiang',  x: 340, y: 350, r: 12 },
  // 关内道
  { id: 'zhou-binzhou',    x: 380, y: 300, r: 12 },
  { id: 'zhou-fangzhou',   x: 430, y: 260, r: 12 },
  { id: 'zhou-tongzhou',   x: 500, y: 370, r: 12 },
  { id: 'zhou-lingzhou',   x: 280, y: 220, r: 12 },
  { id: 'zhou-xiazhou',    x: 350, y: 200, r: 12 },
  // 都畿道
  { id: 'zhou-luoyang',    x: 620, y: 380, r: 16 },
  { id: 'zhou-shanzhou',   x: 560, y: 370, r: 12 },
  // 河东道
  { id: 'zhou-taiyuan',    x: 580, y: 250, r: 16 },
  { id: 'zhou-luzhou',     x: 620, y: 310, r: 12 },
  { id: 'zhou-hezhong',    x: 540, y: 330, r: 12 },
  { id: 'zhou-yunzhou',    x: 580, y: 160, r: 12 },
  // 河北道·幽州
  { id: 'zhou-youzhou',    x: 760, y: 140, r: 16 },
  { id: 'zhou-yingzhou',   x: 730, y: 200, r: 12 },
  { id: 'zhou-dingzhou',   x: 700, y: 180, r: 12 },
  // 河北道·成德
  { id: 'zhou-zhenzhou',   x: 700, y: 240, r: 12 },
  { id: 'zhou-jizhou',     x: 720, y: 280, r: 12 },
  // 河北道·魏博
  { id: 'zhou-weizhou',    x: 720, y: 330, r: 12 },
  { id: 'zhou-xiangzhou',  x: 670, y: 340, r: 12 },
  // 河南道
  { id: 'zhou-bianzhou',   x: 700, y: 400, r: 16 },
  { id: 'zhou-huazhou',    x: 680, y: 370, r: 12 },
  { id: 'zhou-yunzhou-sd', x: 760, y: 360, r: 12 },
  { id: 'zhou-yanzhou',    x: 780, y: 400, r: 12 },
  { id: 'zhou-xuzhou',     x: 810, y: 430, r: 12 },
  { id: 'zhou-qingzhou',   x: 850, y: 320, r: 12 },
  { id: 'zhou-xuchang',    x: 680, y: 450, r: 12 },
  { id: 'zhou-caizhou',    x: 660, y: 490, r: 12 },
  // 山南东道
  { id: 'zhou-xiangyang',  x: 600, y: 490, r: 12 },
  { id: 'zhou-jiangling',  x: 560, y: 550, r: 12 },
  { id: 'zhou-ezhou',      x: 640, y: 550, r: 12 },
  // 山南西道
  { id: 'zhou-xingyuan',   x: 380, y: 430, r: 12 },
  { id: 'zhou-suizhou',    x: 370, y: 500, r: 12 },
  // 淮南道
  { id: 'zhou-yangzhou',   x: 840, y: 480, r: 16 },
  // 江南东道
  { id: 'zhou-runzhou',    x: 850, y: 530, r: 12 },
  { id: 'zhou-yuezhou',    x: 900, y: 590, r: 12 },
  { id: 'zhou-fuzhou',     x: 920, y: 660, r: 12 },
  { id: 'zhou-xuanzhou',   x: 820, y: 560, r: 12 },
  // 江南西道
  { id: 'zhou-hongzhou',   x: 760, y: 620, r: 12 },
  { id: 'zhou-tanzhou',    x: 660, y: 640, r: 12 },
  // 剑南道
  { id: 'zhou-chengdu',    x: 300, y: 510, r: 16 },
  { id: 'zhou-zizhou',     x: 340, y: 470, r: 12 },
  // 岭南道
  { id: 'zhou-guangzhou',  x: 760, y: 780, r: 16 },
  { id: 'zhou-yongzhou',   x: 580, y: 780, r: 12 },
  { id: 'zhou-guizhou',    x: 620, y: 730, r: 12 },
  { id: 'zhou-jiaozhou',   x: 510, y: 890, r: 12 },
  // 陇右道
  { id: 'zhou-jingzhou-ly', x: 320, y: 330, r: 12 },
  { id: 'zhou-qinzhou',    x: 300, y: 380, r: 12 },
  // 河西道
  { id: 'zhou-shazhou',    x: 120, y: 200, r: 12 },
];

/** 按 ID 查坐标 */
export const posById = new Map<string, ZhouPos>();
for (const p of ZHOU_POSITIONS) posById.set(p.id, p);

/** 州间连接 */
export interface TerritoryEdge {
  from: string;
  to: string;
  type: 'land' | 'water';  // 陆路/水路
}

// 边只定义一次（双向），from < to 按字母序排列
export const ALL_EDGES: TerritoryEdge[] = [
  // ── 京畿 ──────────────────────────────────────────────────────────────
  { from: 'zhou-changan',    to: 'zhou-fengxiang',  type: 'land' },
  { from: 'zhou-changan',    to: 'zhou-jingzhou-ly', type: 'land' },   // 泾州→长安
  { from: 'zhou-changan',    to: 'zhou-tongzhou',   type: 'land' },
  { from: 'zhou-changan',    to: 'zhou-binzhou',    type: 'land' },

  // ── 关内 ──────────────────────────────────────────────────────────────
  { from: 'zhou-binzhou',    to: 'zhou-fangzhou',   type: 'land' },
  { from: 'zhou-fangzhou',   to: 'zhou-lingzhou',   type: 'land' },
  { from: 'zhou-lingzhou',   to: 'zhou-xiazhou',    type: 'land' },
  { from: 'zhou-jingzhou-ly', to: 'zhou-qinzhou',  type: 'land' },
  { from: 'zhou-qinzhou',    to: 'zhou-fengxiang',  type: 'land' },
  // 沙州—灵州（河西走廊长线）
  { from: 'zhou-lingzhou',   to: 'zhou-shazhou',    type: 'land' },

  // ── 京畿↔陇右 ─────────────────────────────────────────────────────────
  { from: 'zhou-fengxiang',  to: 'zhou-xingyuan',   type: 'land' },

  // ── 关内↔河东 ─────────────────────────────────────────────────────────
  { from: 'zhou-fangzhou',   to: 'zhou-taiyuan',    type: 'land' },   // 坊州→太原（经黄河）

  // ── 京畿↔都畿 ─────────────────────────────────────────────────────────
  { from: 'zhou-tongzhou',   to: 'zhou-shanzhou',   type: 'land' },
  { from: 'zhou-shanzhou',   to: 'zhou-luoyang',    type: 'land' },

  // 武关：长安→商洛方向，经陕州出关中南下
  { from: 'zhou-shanzhou',   to: 'zhou-xiangyang',  type: 'land' },

  // ── 都畿 ──────────────────────────────────────────────────────────────
  { from: 'zhou-luoyang',    to: 'zhou-bianzhou',   type: 'land' },
  { from: 'zhou-luoyang',    to: 'zhou-hezhong',    type: 'land' },

  // ── 河东 ──────────────────────────────────────────────────────────────
  { from: 'zhou-hezhong',    to: 'zhou-tongzhou',   type: 'land' },   // 河中↔同州（黄河渡口）
  { from: 'zhou-hezhong',    to: 'zhou-taiyuan',    type: 'land' },
  { from: 'zhou-taiyuan',    to: 'zhou-luzhou',     type: 'land' },
  { from: 'zhou-taiyuan',    to: 'zhou-yunzhou',    type: 'land' },
  { from: 'zhou-luzhou',     to: 'zhou-hezhong',    type: 'land' },   // 潞州↔河中
  { from: 'zhou-luzhou',     to: 'zhou-xiangzhou',  type: 'land' },   // 潞州→相州（太行陉道）

  // ── 河北幽 ────────────────────────────────────────────────────────────
  { from: 'zhou-youzhou',    to: 'zhou-yingzhou',   type: 'land' },
  { from: 'zhou-youzhou',    to: 'zhou-dingzhou',   type: 'land' },
  { from: 'zhou-yunzhou',    to: 'zhou-youzhou',    type: 'land' },   // 云州→幽州（塞外）

  // ── 河北成德 ──────────────────────────────────────────────────────────
  { from: 'zhou-yingzhou',   to: 'zhou-zhenzhou',   type: 'land' },
  { from: 'zhou-yingzhou',   to: 'zhou-weizhou',    type: 'land' },
  { from: 'zhou-zhenzhou',   to: 'zhou-jizhou',     type: 'land' },
  { from: 'zhou-zhenzhou',   to: 'zhou-dingzhou',   type: 'land' },

  // ── 河北魏博 ──────────────────────────────────────────────────────────
  { from: 'zhou-weizhou',    to: 'zhou-xiangzhou',  type: 'land' },
  { from: 'zhou-weizhou',    to: 'zhou-jizhou',     type: 'land' },
  { from: 'zhou-weizhou',    to: 'zhou-huazhou',    type: 'land' },   // 魏州→滑州

  // ── 河南 ──────────────────────────────────────────────────────────────
  { from: 'zhou-huazhou',    to: 'zhou-bianzhou',   type: 'land' },
  { from: 'zhou-huazhou',    to: 'zhou-xiangzhou',  type: 'land' },
  { from: 'zhou-bianzhou',   to: 'zhou-yunzhou-sd', type: 'land' },   // 汴州→郓州
  { from: 'zhou-bianzhou',   to: 'zhou-xuchang',    type: 'land' },   // 汴州→许州
  { from: 'zhou-bianzhou',   to: 'zhou-caizhou',    type: 'land' },   // 汴州→蔡州（经颍）
  { from: 'zhou-yunzhou-sd', to: 'zhou-yanzhou',    type: 'land' },   // 郓州→兖州
  { from: 'zhou-yunzhou-sd', to: 'zhou-qingzhou',   type: 'land' },   // 郓州→青州
  { from: 'zhou-yanzhou',    to: 'zhou-xuzhou',     type: 'land' },
  { from: 'zhou-xuchang',    to: 'zhou-caizhou',    type: 'land' },
  { from: 'zhou-xuchang',    to: 'zhou-xuzhou',     type: 'land' },
  { from: 'zhou-xuzhou',     to: 'zhou-yangzhou',   type: 'land' },   // 徐州→扬州
  { from: 'zhou-caizhou',    to: 'zhou-xiangyang',  type: 'land' },   // 蔡州→襄阳
  { from: 'zhou-caizhou',    to: 'zhou-yangzhou',   type: 'land' },   // 蔡州→扬州（经淮南）
  // 青州沿渤海海岸→瀛州
  { from: 'zhou-qingzhou',   to: 'zhou-yingzhou',   type: 'land' },

  // ── 山南东 ────────────────────────────────────────────────────────────
  { from: 'zhou-xiangyang',  to: 'zhou-xingyuan',   type: 'land' },   // 襄阳→兴元
  { from: 'zhou-xiangyang',  to: 'zhou-xuchang',    type: 'land' },   // 襄阳↔许州
  { from: 'zhou-xiangyang',  to: 'zhou-jiangling',  type: 'land' },
  { from: 'zhou-jiangling',  to: 'zhou-ezhou',      type: 'water' },  // 江陵→鄂州（长江）
  { from: 'zhou-jiangling',  to: 'zhou-suizhou',    type: 'land' },   // 江陵→随州
  { from: 'zhou-ezhou',      to: 'zhou-yangzhou',   type: 'water' },  // 鄂州→扬州（长江顺流）
  { from: 'zhou-ezhou',      to: 'zhou-hongzhou',   type: 'water' },  // 鄂州→洪州（长江南岸）
  { from: 'zhou-ezhou',      to: 'zhou-xiangyang',  type: 'land' },   // 鄂州↔襄阳

  // ── 山南西 ────────────────────────────────────────────────────────────
  { from: 'zhou-xingyuan',   to: 'zhou-suizhou',    type: 'land' },   // 兴元→随州（汉水）
  { from: 'zhou-xingyuan',   to: 'zhou-chengdu',    type: 'land' },   // 兴元→成都（金牛道）

  // ── 淮南 ──────────────────────────────────────────────────────────────
  { from: 'zhou-yangzhou',   to: 'zhou-runzhou',    type: 'water' },  // 扬州→润州（运河/长江）
  { from: 'zhou-yangzhou',   to: 'zhou-bianzhou',   type: 'water' },  // 扬州→汴州（大运河）

  // ── 江南东 ────────────────────────────────────────────────────────────
  { from: 'zhou-runzhou',    to: 'zhou-xuanzhou',   type: 'water' },  // 润州→宣州（运河支线）
  { from: 'zhou-runzhou',    to: 'zhou-yuezhou',    type: 'water' },  // 润州→越州（沿海）
  { from: 'zhou-xuanzhou',   to: 'zhou-hongzhou',   type: 'land' },   // 宣州→洪州
  { from: 'zhou-yuezhou',    to: 'zhou-fuzhou',     type: 'land' },   // 越州→福州（沿海陆路）
  { from: 'zhou-fuzhou',     to: 'zhou-guangzhou',  type: 'land' },   // 福州→广州（沿海）

  // ── 江南西 ────────────────────────────────────────────────────────────
  { from: 'zhou-hongzhou',   to: 'zhou-tanzhou',    type: 'land' },
  { from: 'zhou-hongzhou',   to: 'zhou-guangzhou',  type: 'land' },

  // ── 剑南 ──────────────────────────────────────────────────────────────
  { from: 'zhou-chengdu',    to: 'zhou-zizhou',     type: 'land' },   // 成都→梓州（东川）
  { from: 'zhou-zizhou',     to: 'zhou-xingyuan',   type: 'land' },

  // ── 岭南 ──────────────────────────────────────────────────────────────
  { from: 'zhou-tanzhou',    to: 'zhou-guizhou',    type: 'land' },   // 潭州→桂州
  { from: 'zhou-guangzhou',  to: 'zhou-guizhou',    type: 'land' },
  { from: 'zhou-guizhou',    to: 'zhou-yongzhou',   type: 'land' },
  { from: 'zhou-yongzhou',   to: 'zhou-jiaozhou',   type: 'land' },
];
