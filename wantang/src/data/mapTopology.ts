// ===== 地图拓扑 =====

/** 州间连接 */
export interface TerritoryEdge {
  from: string;
  to: string;
  type: 'land' | 'water';  // 陆路/水路
  passId?: string;          // 经过的关隘ID
}

/** 关隘定义 */
export interface PassDef {
  id: string;
  name: string;
  territoryId: string;      // 关隘所在州
  level: number;            // 关隘等级 1-5（影响围城时长）
  hasZOC: boolean;          // 是否产生ZOC
}

export const ALL_PASSES: PassDef[] = [
  { id: 'pass-tongguan', name: '潼关',  territoryId: 'zhou-shanzhou',   level: 5, hasZOC: true },
  { id: 'pass-hulao',    name: '虎牢关', territoryId: 'zhou-luoyang',    level: 4, hasZOC: true },
  { id: 'pass-jianmen',  name: '剑门关', territoryId: 'zhou-zizhou',     level: 5, hasZOC: true },
  { id: 'pass-pujin',    name: '蒲津关', territoryId: 'zhou-hezhong',    level: 4, hasZOC: true },
  { id: 'pass-yanmen',   name: '雁门关', territoryId: 'zhou-taiyuan',    level: 4, hasZOC: true },
  { id: 'pass-juyong',   name: '居庸关', territoryId: 'zhou-youzhou',    level: 4, hasZOC: true },
  { id: 'pass-wuguan',   name: '武关',   territoryId: 'zhou-shanzhou',   level: 3, hasZOC: true },
  { id: 'pass-dasan',    name: '大散关', territoryId: 'zhou-fengxiang',  level: 4, hasZOC: true },
  { id: 'pass-meiling',  name: '梅岭',   territoryId: 'zhou-hongzhou',   level: 3, hasZOC: true },
];

export const passMap = new Map<string, PassDef>();
for (const p of ALL_PASSES) passMap.set(p.id, p);

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
  { from: 'zhou-fengxiang',  to: 'zhou-xingyuan',   type: 'land', passId: 'pass-dasan' },

  // ── 关内↔河东 ─────────────────────────────────────────────────────────
  { from: 'zhou-fangzhou',   to: 'zhou-taiyuan',    type: 'land' },   // 坊州→太原（经黄河）

  // ── 京畿↔都畿 ─────────────────────────────────────────────────────────
  { from: 'zhou-tongzhou',   to: 'zhou-shanzhou',   type: 'land' },
  { from: 'zhou-shanzhou',   to: 'zhou-luoyang',    type: 'land', passId: 'pass-tongguan' },

  // 武关：长安→商洛方向，经陕州出关中南下
  { from: 'zhou-shanzhou',   to: 'zhou-xiangyang',  type: 'land', passId: 'pass-wuguan' },

  // ── 都畿 ──────────────────────────────────────────────────────────────
  { from: 'zhou-luoyang',    to: 'zhou-bianzhou',   type: 'land', passId: 'pass-hulao' },
  { from: 'zhou-luoyang',    to: 'zhou-hezhong',    type: 'land', passId: 'pass-pujin' },

  // ── 河东 ──────────────────────────────────────────────────────────────
  { from: 'zhou-hezhong',    to: 'zhou-tongzhou',   type: 'land' },   // 河中↔同州（黄河渡口）
  { from: 'zhou-hezhong',    to: 'zhou-taiyuan',    type: 'land' },
  { from: 'zhou-taiyuan',    to: 'zhou-luzhou',     type: 'land' },
  { from: 'zhou-taiyuan',    to: 'zhou-yunzhou',    type: 'land', passId: 'pass-yanmen' },
  { from: 'zhou-luzhou',     to: 'zhou-hezhong',    type: 'land' },   // 潞州↔河中
  { from: 'zhou-luzhou',     to: 'zhou-xiangzhou',  type: 'land' },   // 潞州→相州（太行陉道）

  // ── 河北幽 ────────────────────────────────────────────────────────────
  { from: 'zhou-youzhou',    to: 'zhou-yingzhou',   type: 'land' },
  { from: 'zhou-youzhou',    to: 'zhou-dingzhou',   type: 'land', passId: 'pass-juyong' },
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
  { from: 'zhou-hongzhou',   to: 'zhou-guangzhou',  type: 'land', passId: 'pass-meiling' },

  // ── 剑南 ──────────────────────────────────────────────────────────────
  { from: 'zhou-chengdu',    to: 'zhou-zizhou',     type: 'land' },   // 成都→梓州（东川）
  { from: 'zhou-zizhou',     to: 'zhou-xingyuan',   type: 'land', passId: 'pass-jianmen' },

  // ── 岭南 ──────────────────────────────────────────────────────────────
  { from: 'zhou-tanzhou',    to: 'zhou-guizhou',    type: 'land' },   // 潭州→桂州
  { from: 'zhou-guangzhou',  to: 'zhou-guizhou',    type: 'land' },
  { from: 'zhou-guizhou',    to: 'zhou-yongzhou',   type: 'land' },
  { from: 'zhou-yongzhou',   to: 'zhou-jiaozhou',   type: 'land' },
];
