// ===== 完整领地数据（867年史实） =====

import type { Territory } from '@engine/territory/types';

// ───────────────────────────────────────────────
// 辅助：生成道级岗位（军事道 or 民政道）
// ───────────────────────────────────────────────
function makeDaoPosts(
  daoId: string,
  type: 'military' | 'civil',
  holderId: string,
  appointedBy: string = 'char-yizong',
): Territory['posts'] {
  const prefix = daoId.replace('dao-', '');
  const mainTemplateId = type === 'military' ? 'pos-jiedushi' : 'pos-guancha-shi';
  const mainLabel = type === 'military' ? 'jiedushi' : 'guancha';
  return [
    {
      id: `post-${mainLabel}-${prefix}`,
      templateId: mainTemplateId,
      territoryId: daoId,
      holderId,
      appointedBy,
      appointedDate: { year: 867, month: 1 },
    },
    {
      id: `post-panguan-${prefix}`,
      templateId: 'pos-panguan',
      territoryId: daoId,
      holderId: null,
    },
    {
      id: `post-tuiguan-${prefix}`,
      templateId: 'pos-tuiguan',
      territoryId: daoId,
      holderId: null,
    },
  ];
}

// 生成州级岗位
function makeZhouPosts(
  zhouId: string,
  type: 'military' | 'civil',
  holderId: string,
  appointedBy: string = 'char-yizong',
): Territory['posts'] {
  const prefix = zhouId.replace('zhou-', '');
  const mainTemplateId = type === 'military' ? 'pos-fangyu-shi' : 'pos-cishi';
  const mainLabel = type === 'military' ? 'fangyu' : 'cishi';
  return [
    {
      id: `post-${mainLabel}-${prefix}`,
      templateId: mainTemplateId,
      territoryId: zhouId,
      holderId,
      appointedBy,
      appointedDate: { year: 867, month: 1 },
    },
    {
      id: `post-sima-${prefix}`,
      templateId: 'pos-sima',
      territoryId: zhouId,
      holderId: null,
    },
    {
      id: `post-zhangshi-${prefix}`,
      templateId: 'pos-zhangshi',
      territoryId: zhouId,
      holderId: null,
    },
    {
      id: `post-lushibcanjun-${prefix}`,
      templateId: 'pos-lushibcanjun',
      territoryId: zhouId,
      holderId: null,
    },
  ];
}

// 道级骨架（所有属性为0/空）
function daoBase(
  id: string,
  name: string,
  type: 'military' | 'civil',
  childIds: string[],
  holderId: string,
  parentGuo: string,
): Territory {
  return {
    id,
    name,
    tier: 'dao',
    territoryType: type,
    parentId: parentGuo,
    childIds,
    dejureControllerId: parentGuo, // 法理归属所在国
    posts: makeDaoPosts(id, type, holderId),
    control: 0,
    development: 0,
    populace: 0,
    buildings: [],
    constructions: [],
    basePopulation: 0,
    conscriptionPool: 0,
    moneyRatio: 0,
    grainRatio: 0,
  };
}

// 州级骨架（dejureControllerId 在后处理中从父道推导）
function zhou(
  id: string,
  name: string,
  parentId: string,
  type: 'military' | 'civil',
  basePopulation: number,
  holderId: string,
  control: number,
  development: number,
  populace: number,
  moneyRatio: number,
  grainRatio: number,
): Territory {
  const conscriptionPool =
    type === 'military'
      ? Math.round(basePopulation * 0.05)
      : Math.round(basePopulation * 0.0125);
  return {
    id,
    name,
    tier: 'zhou',
    territoryType: type,
    parentId,
    childIds: [],
    dejureControllerId: '', // 后处理填充
    posts: makeZhouPosts(id, type, holderId),
    control,
    development,
    populace,
    buildings: [],
    constructions: [],
    basePopulation,
    conscriptionPool,
    moneyRatio,
    grainRatio,
  };
}

export function createAllTerritories(): Territory[] {
  const all: Territory[] = [
    // ══════════════════════════════════════════════
    // 天下（tianxia级，最高法理）
    // ══════════════════════════════════════════════
    {
      id: 'tianxia',
      name: '天下',
      tier: 'tianxia',
      territoryType: 'civil',
      childIds: [
        'guo-guanlong', 'guo-hebei',
        'guo-zhongyuan', 'guo-bashu', 'guo-dongnan',
      ],
      dejureControllerId: 'char-yizong',
      posts: [{
        id: 'post-tianxia',
        templateId: 'pos-emperor',
        territoryId: 'tianxia',
        holderId: 'char-yizong',
        appointedBy: 'system',
        appointedDate: { year: 859, month: 1 },
      }],
      control: 0, development: 0, populace: 0,
      buildings: [], constructions: [],
      basePopulation: 0, conscriptionPool: 0,
      moneyRatio: 0, grainRatio: 0,
    },

    // ══════════════════════════════════════════════
    // 六国（guo级，区域法理）
    // ══════════════════════════════════════════════
    {
      id: 'guo-guanlong', name: '关陇', tier: 'guo', territoryType: 'civil',
      parentId: 'tianxia',
      childIds: ['dao-jingji', 'dao-guannei', 'dao-duji', 'dao-longyou', 'dao-hexi'],
      dejureControllerId: 'tianxia',
      posts: [], control: 0, development: 0, populace: 0,
      buildings: [], constructions: [],
      basePopulation: 0, conscriptionPool: 0, moneyRatio: 0, grainRatio: 0,
    },
    {
      id: 'guo-hebei', name: '河北', tier: 'guo', territoryType: 'military',
      parentId: 'tianxia',
      childIds: ['dao-hedong', 'dao-youzhou', 'dao-chengde', 'dao-weibo'],
      dejureControllerId: 'tianxia',
      posts: [], control: 0, development: 0, populace: 0,
      buildings: [], constructions: [],
      basePopulation: 0, conscriptionPool: 0, moneyRatio: 0, grainRatio: 0,
    },
    {
      id: 'guo-zhongyuan', name: '中原', tier: 'guo', territoryType: 'civil',
      parentId: 'tianxia',
      childIds: ['dao-henan', 'dao-shannan-e', 'dao-huainan'],
      dejureControllerId: 'tianxia',
      posts: [], control: 0, development: 0, populace: 0,
      buildings: [], constructions: [],
      basePopulation: 0, conscriptionPool: 0, moneyRatio: 0, grainRatio: 0,
    },
    {
      id: 'guo-bashu', name: '巴蜀', tier: 'guo', territoryType: 'civil',
      parentId: 'tianxia',
      childIds: ['dao-jiannan', 'dao-shannan-w'],
      dejureControllerId: 'tianxia',
      posts: [], control: 0, development: 0, populace: 0,
      buildings: [], constructions: [],
      basePopulation: 0, conscriptionPool: 0, moneyRatio: 0, grainRatio: 0,
    },
    {
      id: 'guo-dongnan', name: '东南', tier: 'guo', territoryType: 'civil',
      parentId: 'tianxia',
      childIds: ['dao-jiangnan-e', 'dao-jiangnan-w', 'dao-lingnan'],
      dejureControllerId: 'tianxia',
      posts: [], control: 0, development: 0, populace: 0,
      buildings: [], constructions: [],
      basePopulation: 0, conscriptionPool: 0, moneyRatio: 0, grainRatio: 0,
    },

    // ══════════════════════════════════════════════
    // 京畿道  dao-jingji  civil
    // ══════════════════════════════════════════════
    daoBase(
      'dao-jingji',
      '京畿道',
      'civil',
      ['zhou-changan', 'zhou-fengxiang'],
      'char-yizong',
      'guo-guanlong',
    ),
    zhou(
      'zhou-changan', '长安', 'dao-jingji',
      'civil', 192000,
      'char-yizong',
      40, 60, 65,
      3, 4,
    ),
    zhou(
      'zhou-fengxiang', '凤翔', 'dao-jingji',
      'military', 80000,
      'char-ducong',
      50, 80, 55,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 关内道  dao-guannei  military
    // ══════════════════════════════════════════════
    daoBase(
      'dao-guannei',
      '关内道',
      'military',
      ['zhou-binzhou', 'zhou-fangzhou', 'zhou-tongzhou', 'zhou-lingzhou', 'zhou-xiazhou'],
      'char-npc-binning',
      'guo-guanlong',
    ),
    zhou(
      'zhou-binzhou', '邠州', 'dao-guannei',
      'military', 48000,
      'char-npc-binning',
      60, 55, 50,
      2, 4,
    ),
    zhou(
      'zhou-fangzhou', '坊州', 'dao-guannei',
      'military', 40000,
      'char-jiaweiqing',
      60, 40, 45,
      2, 4,
    ),
    zhou(
      'zhou-tongzhou', '同州', 'dao-guannei',
      'military', 64000,
      'char-npc-zhenguo',
      55, 65, 50,
      2, 4,
    ),
    zhou(
      'zhou-lingzhou', '灵州', 'dao-guannei',
      'military', 80000,
      'char-lupan',
      70, 50, 45,
      2, 4,
    ),
    zhou(
      'zhou-xiazhou', '夏州', 'dao-guannei',
      'military', 80000,
      'char-tuobasigong',
      90, 30, 40,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 都畿道  dao-duji  civil
    // ══════════════════════════════════════════════
    daoBase(
      'dao-duji',
      '都畿道',
      'civil',
      ['zhou-luoyang', 'zhou-shanzhou'],
      'char-yizong',
      'guo-guanlong',
    ),
    zhou(
      'zhou-luoyang', '洛阳', 'dao-duji',
      'civil', 128000,
      'char-yizong',
      40, 60, 60,
      2, 3,
    ),
    zhou(
      'zhou-shanzhou', '陕州', 'dao-duji',
      'military', 56000,
      'char-npc-shanzhou',
      50, 60, 50,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 河东道  dao-hedong  military
    // ══════════════════════════════════════════════
    daoBase(
      'dao-hedong',
      '河东道',
      'military',
      ['zhou-taiyuan', 'zhou-luzhou', 'zhou-hezhong', 'zhou-yunzhou'],
      'char-zhengcongdang',
      'guo-hebei',
    ),
    zhou(
      'zhou-taiyuan', '太原', 'dao-hedong',
      'military', 156000,
      'char-zhengcongdang',
      70, 90, 60,
      2, 4,
    ),
    zhou(
      'zhou-luzhou', '潞州', 'dao-hedong',
      'military', 104000,
      'char-npc-zhaoyi',
      65, 55, 52,
      2, 4,
    ),
    zhou(
      'zhou-hezhong', '河中', 'dao-hedong',
      'military', 117000,
      'char-zhengcongdang',
      70, 90, 55,
      2, 4,
    ),
    zhou(
      'zhou-yunzhou', '云州', 'dao-hedong',
      'military', 100000,
      'char-liguochang',
      90, 40, 45,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 河北道·幽州  dao-youzhou  military
    // ══════════════════════════════════════════════
    daoBase(
      'dao-youzhou',
      '河北道·幽州',
      'military',
      ['zhou-youzhou', 'zhou-yingzhou', 'zhou-dingzhou'],
      'char-zhangyunshen',
      'guo-hebei',
    ),
    zhou(
      'zhou-youzhou', '幽州', 'dao-youzhou',
      'military', 143000,
      'char-zhangyunshen',
      80, 60, 58,
      2, 4,
    ),
    zhou(
      'zhou-yingzhou', '瀛州', 'dao-youzhou',
      'military', 65000,
      'char-zhangyunshen',
      80, 60, 50,
      2, 4,
    ),
    zhou(
      'zhou-dingzhou', '定州', 'dao-youzhou',
      'military', 78000,
      'char-npc-yiwu',
      60, 50, 50,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 河北道·成德  dao-chengde  military
    // ══════════════════════════════════════════════
    daoBase(
      'dao-chengde',
      '河北道·成德',
      'military',
      ['zhou-zhenzhou', 'zhou-jizhou'],
      'char-wangjingchong',
      'guo-hebei',
    ),
    zhou(
      'zhou-zhenzhou', '镇州', 'dao-chengde',
      'military', 130000,
      'char-wangjingchong',
      70, 50, 58,
      2, 4,
    ),
    zhou(
      'zhou-jizhou', '冀州', 'dao-chengde',
      'military', 78000,
      'char-wangjingchong',
      70, 50, 50,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 河北道·魏博  dao-weibo  military
    // ══════════════════════════════════════════════
    daoBase(
      'dao-weibo',
      '河北道·魏博',
      'military',
      ['zhou-weizhou', 'zhou-xiangzhou'],
      'char-hanyunzhong',
      'guo-hebei',
    ),
    zhou(
      'zhou-weizhou', '魏州', 'dao-weibo',
      'military', 156000,
      'char-hanyunzhong',
      80, 40, 58,
      2, 4,
    ),
    zhou(
      'zhou-xiangzhou', '相州', 'dao-weibo',
      'military', 91000,
      'char-hanyunzhong',
      80, 40, 52,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 河南道  dao-henan  civil
    // ══════════════════════════════════════════════
    daoBase(
      'dao-henan',
      '河南道',
      'civil',
      [
        'zhou-bianzhou', 'zhou-huazhou', 'zhou-yunzhou-sd',
        'zhou-yanzhou', 'zhou-xuzhou', 'zhou-qingzhou',
        'zhou-xuchang', 'zhou-caizhou',
      ],
      'char-npc-xuanwu',
      'guo-zhongyuan',
    ),
    zhou(
      'zhou-bianzhou', '汴州', 'dao-henan',
      'civil', 160000,
      'char-npc-xuanwu',
      70, 55, 58,
      3, 3,
    ),
    zhou(
      'zhou-huazhou', '滑州', 'dao-henan',
      'military', 60000,
      'char-npc-yicheng',
      55, 60, 50,
      2, 4,
    ),
    zhou(
      'zhou-yunzhou-sd', '郓州', 'dao-henan',
      'military', 80000,
      'char-npc-tianping',
      50, 70, 50,
      2, 4,
    ),
    zhou(
      'zhou-yanzhou', '兖州', 'dao-henan',
      'military', 70000,
      'char-npc-taining',
      55, 55, 50,
      2, 4,
    ),
    zhou(
      'zhou-xuzhou', '徐州', 'dao-henan',
      'military', 90000,
      'char-npc-wuning',
      65, 50, 52,
      2, 4,
    ),
    zhou(
      'zhou-qingzhou', '青州', 'dao-henan',
      'military', 100000,
      'char-npc-pinglu',
      60, 60, 52,
      2, 4,
    ),
    zhou(
      'zhou-xuchang', '许州', 'dao-henan',
      'military', 80000,
      'char-npc-zhongwu',
      55, 65, 50,
      2, 4,
    ),
    zhou(
      'zhou-caizhou', '蔡州', 'dao-henan',
      'military', 60000,
      'char-npc-fengguo',
      60, 55, 48,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 山南东道  dao-shannan-e  civil
    // ══════════════════════════════════════════════
    daoBase(
      'dao-shannan-e',
      '山南东道',
      'civil',
      ['zhou-xiangyang', 'zhou-jiangling', 'zhou-ezhou'],
      'char-npc-shannan-e',
      'guo-zhongyuan',
    ),
    zhou(
      'zhou-xiangyang', '襄州', 'dao-shannan-e',
      'civil', 110000,
      'char-npc-shannan-e',
      50, 65, 55,
      3, 3,
    ),
    zhou(
      'zhou-jiangling', '江陵', 'dao-shannan-e',
      'civil', 90000,
      'char-npc-jingnan',
      50, 60, 52,
      3, 3,
    ),
    zhou(
      'zhou-ezhou', '鄂州', 'dao-shannan-e',
      'military', 80000,
      'char-npc-wuchang',
      60, 55, 50,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 山南西道  dao-shannan-w  military
    // ══════════════════════════════════════════════
    daoBase(
      'dao-shannan-w',
      '山南西道',
      'military',
      ['zhou-xingyuan', 'zhou-suizhou'],
      'char-xiaoye',
      'guo-bashu',
    ),
    zhou(
      'zhou-xingyuan', '兴元', 'dao-shannan-w',
      'military', 80000,
      'char-xiaoye',
      40, 90, 52,
      2, 4,
    ),
    zhou(
      'zhou-suizhou', '遂州', 'dao-shannan-w',
      'military', 60000,
      'char-sundang',
      50, 60, 48,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 淮南道  dao-huainan  civil
    // ══════════════════════════════════════════════
    daoBase(
      'dao-huainan',
      '淮南道',
      'civil',
      ['zhou-yangzhou'],
      'char-cuiyanzeng',
      'guo-zhongyuan',
    ),
    zhou(
      'zhou-yangzhou', '扬州', 'dao-huainan',
      'civil', 300000,
      'char-cuiyanzeng',
      50, 70, 62,
      5, 6.2,
    ),

    // ══════════════════════════════════════════════
    // 江南东道  dao-jiangnan-e  civil
    // ══════════════════════════════════════════════
    daoBase(
      'dao-jiangnan-e',
      '江南东道',
      'civil',
      ['zhou-runzhou', 'zhou-yuezhou', 'zhou-fuzhou', 'zhou-xuanzhou'],
      'char-npc-zhenhai',
      'guo-dongnan',
    ),
    zhou(
      'zhou-runzhou', '润州', 'dao-jiangnan-e',
      'civil', 200000,
      'char-npc-zhenhai',
      60, 65, 58,
      3, 3,
    ),
    zhou(
      'zhou-yuezhou', '越州', 'dao-jiangnan-e',
      'civil', 150000,
      'char-npc-zhendong',
      55, 60, 55,
      3, 3,
    ),
    zhou(
      'zhou-fuzhou', '福州', 'dao-jiangnan-e',
      'civil', 125000,
      'char-npc-weiwu',
      55, 50, 52,
      3, 3,
    ),
    zhou(
      'zhou-xuanzhou', '宣州', 'dao-jiangnan-e',
      'civil', 113000,
      'char-npc-xuanshe',
      50, 70, 50,
      3, 3,
    ),

    // ══════════════════════════════════════════════
    // 江南西道  dao-jiangnan-w  civil
    // ══════════════════════════════════════════════
    daoBase(
      'dao-jiangnan-w',
      '江南西道',
      'civil',
      ['zhou-hongzhou', 'zhou-tanzhou'],
      'char-npc-zhennan',
      'guo-dongnan',
    ),
    zhou(
      'zhou-hongzhou', '洪州', 'dao-jiangnan-w',
      'civil', 138000,
      'char-npc-zhennan',
      60, 55, 55,
      3, 3,
    ),
    zhou(
      'zhou-tanzhou', '潭州', 'dao-jiangnan-w',
      'civil', 113000,
      'char-npc-hunan',
      50, 65, 52,
      3, 3,
    ),

    // ══════════════════════════════════════════════
    // 剑南道  dao-jiannan  civil
    // ══════════════════════════════════════════════
    daoBase(
      'dao-jiannan',
      '剑南道',
      'civil',
      ['zhou-chengdu', 'zhou-zizhou'],
      'char-liutong',
      'guo-bashu',
    ),
    zhou(
      'zhou-chengdu', '成都', 'dao-jiannan',
      'civil', 200000,
      'char-liutong',
      60, 80, 62,
      4, 5,
    ),
    zhou(
      'zhou-zizhou', '梓州', 'dao-jiannan',
      'military', 80000,
      'char-npc-dongchuan',
      55, 60, 50,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 岭南道  dao-lingnan  civil
    // ══════════════════════════════════════════════
    daoBase(
      'dao-lingnan',
      '岭南道',
      'civil',
      ['zhou-guangzhou', 'zhou-yongzhou', 'zhou-guizhou', 'zhou-jiaozhou'],
      'char-npc-qinghai',
      'guo-dongnan',
    ),
    zhou(
      'zhou-guangzhou', '广州', 'dao-lingnan',
      'civil', 150000,
      'char-npc-qinghai',
      55, 60, 55,
      3, 3,
    ),
    zhou(
      'zhou-yongzhou', '邕州', 'dao-lingnan',
      'military', 50000,
      'char-npc-lingnan-w',
      60, 50, 42,
      2, 4,
    ),
    zhou(
      'zhou-guizhou', '桂州', 'dao-lingnan',
      'civil', 63000,
      'char-npc-jingjiang',
      50, 55, 45,
      3, 3,
    ),
    zhou(
      'zhou-jiaozhou', '交州', 'dao-lingnan',
      'military', 150000,
      'char-gaopian',
      100, 70, 48,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 陇右道  dao-longyou  military
    // ══════════════════════════════════════════════
    daoBase(
      'dao-longyou',
      '陇右道',
      'military',
      ['zhou-jingzhou-ly', 'zhou-qinzhou'],
      'char-lihongfu',
      'guo-guanlong',
    ),
    zhou(
      'zhou-jingzhou-ly', '泾州', 'dao-longyou',
      'military', 48000,
      'char-lihongfu',
      70, 40, 48,
      2, 4,
    ),
    zhou(
      'zhou-qinzhou', '秦州', 'dao-longyou',
      'military', 40000,
      'char-npc-tianshui',
      65, 50, 45,
      2, 4,
    ),

    // ══════════════════════════════════════════════
    // 河西道  dao-hexi  military
    // ══════════════════════════════════════════════
    daoBase(
      'dao-hexi',
      '河西道',
      'military',
      ['zhou-shazhou'],
      'char-zhanghuaishen',
      'guo-guanlong',
    ),
    zhou(
      'zhou-shazhou', '沙州', 'dao-hexi',
      'military', 50000,
      'char-zhanghuaishen',
      80, 50, 40,
      2, 4,
    ),
  ];

  // 后处理：州的 dejureControllerId 指向父道ID（法理归属是结构关系，非人物）
  for (const t of all) {
    if (t.tier === 'zhou' && t.parentId) {
      t.dejureControllerId = t.parentId;
    }
  }

  return all;
}
