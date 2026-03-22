// ===== 完整示例数据 =====

import type { Character } from '@engine/character/types';
import { isCivilByAbilities } from '@engine/official/officialUtils';
import type { Territory, Post } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { calculateMonthlyLedger } from '@engine/official/officialUtils';

/** 示例角色数据 */
function createSampleCharacters(): Character[] {
  return [
    {
      id: 'char-yizong',
      name: '唐懿宗',
      courtesy: '温',
      gender: '男',
      birthYear: 833,
      clan: '李',
      family: { childrenIds: [] },
      abilities: { military: 8, administration: 12, strategy: 10, diplomacy: 14, scholarship: 16 },
      traitIds: ['trait-content', 'trait-just', 'trait-edu-administration-2'],
      health: 55,
      stress: 40,
      alive: true,
      resources: { money: 200000, grain: 500000, prestige: 80, legitimacy: 85 },
      relationships: [],
      overlordId: undefined,
      redistributionRate: 60,
      isPlayer: true,
      isRuler: true,
      title: '大唐天子',
      official: {
        rankLevel: 29,
        virtue: 9999,
        isCivil: false,
      },
    },
    {
      id: 'char-gaopian',
      name: '高骈',
      courtesy: '千里',
      gender: '男',
      birthYear: 821,
      clan: '高',
      family: { childrenIds: [] },
      abilities: { military: 22, administration: 14, strategy: 18, diplomacy: 10, scholarship: 12 },
      traitIds: ['trait-brave', 'trait-ambitious', 'trait-suspicious', 'trait-edu-military-3'],
      health: 70,
      stress: 35,
      alive: true,
      resources: { money: 120000, grain: 300000, prestige: 60, legitimacy: 40 },
      relationships: [],
      overlordId: 'char-yizong',
      centralization: 2,
      isPlayer: false,
      isRuler: true,
      title: '淮南节度使',
      official: {
        rankLevel: 18,
        virtue: 1075,
        isCivil: false,
      },
    },
    {
      id: 'char-wangxianzhi',
      name: '王仙芝',
      courtesy: '',
      gender: '男',
      birthYear: 840,
      clan: '王',
      family: { childrenIds: [] },
      abilities: { military: 16, administration: 6, strategy: 12, diplomacy: 8, scholarship: 4 },
      traitIds: ['trait-brave', 'trait-cruel', 'trait-edu-military-2'],
      health: 85,
      stress: 25,
      alive: true,
      resources: { money: 30000, grain: 80000, prestige: 30, legitimacy: 5 },
      relationships: [],
      overlordId: undefined,
      isPlayer: false,
      isRuler: true,
      title: '草军首领',
    },
    {
      id: 'char-zhuwen',
      name: '朱温',
      courtesy: '全忠',
      gender: '男',
      birthYear: 852,
      clan: '朱',
      family: { childrenIds: [] },
      abilities: { military: 18, administration: 16, strategy: 20, diplomacy: 12, scholarship: 8 },
      traitIds: ['trait-ambitious', 'trait-cruel', 'trait-edu-strategy-3'],
      health: 90,
      stress: 30,
      alive: true,
      resources: { money: 80000, grain: 200000, prestige: 40, legitimacy: 20 },
      relationships: [],
      overlordId: 'char-yizong',
      centralization: 2,
      isPlayer: false,
      isRuler: true,
      title: '宣武节度使',
      official: {
        rankLevel: 15,
        virtue: 720,
        isCivil: false,
      },
    },
    {
      id: 'char-liguochang',
      name: '李国昌',
      courtesy: '',
      gender: '男',
      birthYear: 820,
      clan: '李',
      family: { childrenIds: ['char-likeyong'] },
      abilities: { military: 18, administration: 8, strategy: 12, diplomacy: 6, scholarship: 4 },
      traitIds: ['trait-brave', 'trait-wrathful', 'trait-edu-military-2'],
      health: 40,
      stress: 50,
      alive: true,
      resources: { money: 20000, grain: 60000, prestige: 25, legitimacy: 10 },
      relationships: [],
      overlordId: 'char-likeyong',
      centralization: 2,
      isPlayer: false,
      isRuler: false,
      title: '振武军节度使（前）',
      official: {
        rankLevel: 14,
        virtue: 680,
        isCivil: false,
      },
    },
    {
      id: 'char-likeyong',
      name: '李克用',
      courtesy: '',
      gender: '男',
      birthYear: 856,
      clan: '李',
      family: { fatherId: 'char-liguochang', childrenIds: [] },
      abilities: { military: 20, administration: 10, strategy: 14, diplomacy: 8, scholarship: 6 },
      traitIds: ['trait-brave', 'trait-ambitious'],
      health: 95,
      stress: 15,
      alive: true,
      resources: { money: 60000, grain: 150000, prestige: 35, legitimacy: 15 },
      relationships: [],
      overlordId: 'char-yizong',
      centralization: 1,
      redistributionRate: 30,
      isPlayer: false,
      isRuler: true,
      title: '河东节度使',
      official: {
        rankLevel: 16,
        virtue: 990,
        isCivil: false,
      },
    },
    {
      id: 'char-luyan',
      name: '路岩',
      courtesy: '鲁瞻',
      gender: '男',
      birthYear: 825,
      clan: '路',
      family: { childrenIds: [] },
      abilities: { military: 6, administration: 18, strategy: 14, diplomacy: 16, scholarship: 20 },
      traitIds: ['trait-ambitious', 'trait-edu-administration-3'],
      health: 65,
      stress: 35,
      alive: true,
      resources: { money: 80000, grain: 120000, prestige: 50, legitimacy: 45 },
      relationships: [],
      overlordId: 'char-yizong',
      centralization: 3,
      redistributionRate: 0,
      isPlayer: false,
      isRuler: false,
      title: '三司使',
      official: {
        rankLevel: 18,
        virtue: 1060,
        isCivil: false,
      },
    },
    {
      id: 'char-chenjingxuan',
      name: '陈敬瑄',
      courtesy: '',
      gender: '男',
      birthYear: 842,
      clan: '陈',
      family: { childrenIds: [] },
      abilities: { military: 12, administration: 10, strategy: 8, diplomacy: 6, scholarship: 4 },
      traitIds: ['trait-brave', 'trait-edu-military-2'],
      health: 75,
      stress: 20,
      alive: true,
      resources: { money: 30000, grain: 60000, prestige: 20, legitimacy: 25 },
      relationships: [],
      overlordId: 'char-luyan',
      centralization: 2,
      isPlayer: false,
      isRuler: false,
      title: '三司推官',
      official: {
        rankLevel: 8,
        virtue: 360,
        isCivil: false,
      },
    },

    // ===== 李克用廷臣 =====
    {
      id: 'char-gaisizhong',
      name: '盖寓',
      courtesy: '思忠',
      gender: '男',
      birthYear: 840,
      clan: '盖',
      family: { childrenIds: [] },
      abilities: { military: 8, administration: 16, strategy: 14, diplomacy: 18, scholarship: 12 },
      traitIds: ['trait-just', 'trait-edu-administration-2'],
      health: 70,
      stress: 20,
      alive: true,
      resources: { money: 12000, grain: 24000, prestige: 15, legitimacy: 10 },
      relationships: [],
      overlordId: 'char-likeyong',
      centralization: 2,
      isPlayer: false,
      isRuler: false,
      title: '廷臣',
      official: {
        rankLevel: 14,
        virtue: 660,
        isCivil: false,
      },
    },
    {
      id: 'char-kangchuangui',
      name: '康传圭',
      courtesy: '',
      gender: '男',
      birthYear: 845,
      clan: '康',
      family: { childrenIds: [] },
      abilities: { military: 18, administration: 6, strategy: 12, diplomacy: 4, scholarship: 2 },
      traitIds: ['trait-brave', 'trait-edu-military-2'],
      health: 85,
      stress: 15,
      alive: true,
      resources: { money: 8000, grain: 20000, prestige: 10, legitimacy: 5 },
      relationships: [],
      overlordId: 'char-likeyong',
      centralization: 2,
      isPlayer: false,
      isRuler: false,
      title: '廷臣',
      official: {
        rankLevel: 8,
        virtue: 360,
        isCivil: false,
      },
    },
    {
      id: 'char-lisi',
      name: '李嗣',
      courtesy: '',
      gender: '男',
      birthYear: 855,
      clan: '李',
      family: { childrenIds: [] },
      abilities: { military: 16, administration: 8, strategy: 10, diplomacy: 6, scholarship: 4 },
      traitIds: ['trait-brave', 'trait-ambitious'],
      health: 90,
      stress: 10,
      alive: true,
      resources: { money: 6000, grain: 16000, prestige: 8, legitimacy: 5 },
      relationships: [],
      overlordId: 'char-likeyong',
      centralization: 2,
      isPlayer: false,
      isRuler: false,
      title: '廷臣',
      official: {
        rankLevel: 6,
        virtue: 260,
        isCivil: false,
      },
    },

    // ===== 唐懿宗廷臣 =====
    {
      id: 'char-weibaohen',
      name: '韦保衡',
      courtesy: '',
      gender: '男',
      birthYear: 832,
      clan: '韦',
      family: { childrenIds: [] },
      abilities: { military: 4, administration: 14, strategy: 10, diplomacy: 20, scholarship: 18 },
      traitIds: ['trait-ambitious', 'trait-edu-diplomacy-3'],
      health: 60,
      stress: 30,
      alive: true,
      resources: { money: 40000, grain: 60000, prestige: 35, legitimacy: 30 },
      relationships: [],
      overlordId: 'char-yizong',
      centralization: 2,
      isPlayer: false,
      isRuler: false,
      title: '廷臣',
      official: {
        rankLevel: 20,
        virtue: 1160,
        isCivil: false,
      },
    },
    {
      id: 'char-liwei',
      name: '李蔚',
      courtesy: '',
      gender: '男',
      birthYear: 815,
      clan: '李',
      family: { childrenIds: [] },
      abilities: { military: 6, administration: 18, strategy: 12, diplomacy: 14, scholarship: 22 },
      traitIds: ['trait-just', 'trait-content', 'trait-edu-scholarship-3'],
      health: 45,
      stress: 40,
      alive: true,
      resources: { money: 30000, grain: 50000, prestige: 40, legitimacy: 35 },
      relationships: [],
      overlordId: 'char-yizong',
      centralization: 2,
      isPlayer: false,
      isRuler: false,
      title: '廷臣',
      official: {
        rankLevel: 22,
        virtue: 1260,
        isCivil: false,
      },
    },
    {
      id: 'char-zhangzhifang',
      name: '张直方',
      courtesy: '',
      gender: '男',
      birthYear: 838,
      clan: '张',
      family: { childrenIds: [] },
      abilities: { military: 20, administration: 10, strategy: 16, diplomacy: 8, scholarship: 6 },
      traitIds: ['trait-brave', 'trait-wrathful', 'trait-edu-military-3'],
      health: 75,
      stress: 25,
      alive: true,
      resources: { money: 24000, grain: 40000, prestige: 25, legitimacy: 20 },
      relationships: [],
      overlordId: 'char-yizong',
      centralization: 2,
      isPlayer: false,
      isRuler: false,
      title: '廷臣',
      official: {
        rankLevel: 18,
        virtue: 1060,
        isCivil: false,
      },
    },
  ];
}

/** 中央岗位初始数据 */
function createCentralPosts(): Post[] {
  return [
    { id: 'post-emperor', templateId: 'pos-emperor', holderId: 'char-yizong', appointedBy: 'system', appointedDate: { year: 859, month: 1 } },
    { id: 'post-sansi-shi', templateId: 'pos-sansi-shi', holderId: 'char-luyan', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 3 } },
    { id: 'post-sansi-tuiguan', templateId: 'pos-sansi-tuiguan', holderId: 'char-chenjingxuan', appointedBy: 'char-luyan', appointedDate: { year: 868, month: 6 } },
    // 空缺中央岗位
    { id: 'post-zaixiang', templateId: 'pos-zaixiang', holderId: null },
    { id: 'post-hanlin', templateId: 'pos-hanlin', holderId: null },
    { id: 'post-shumi', templateId: 'pos-shumi', holderId: null },
    { id: 'post-shence', templateId: 'pos-shence', holderId: null },
    { id: 'post-yushi-dafu', templateId: 'pos-yushi-dafu', holderId: null },
    { id: 'post-yushi-zhongcheng', templateId: 'pos-yushi-zhongcheng', holderId: null },
  ];
}

/** 示例领地数据 */
function createSampleTerritories(): Territory[] {
  return [
    // ===== 州 =====
    {
      id: 'zhou-changan',
      name: '长安',
      tier: 'zhou',
      territoryType: 'civil',
      parentId: 'dao-guannei',
      childIds: [],
      dejureControllerId: 'char-yizong',
      posts: [
        { id: 'post-cishi-changan', templateId: 'pos-cishi', territoryId: 'zhou-changan', holderId: 'char-yizong', appointedBy: 'system', appointedDate: { year: 870, month: 1 } },
        { id: 'post-sima-changan', templateId: 'pos-sima', territoryId: 'zhou-changan', holderId: null },
        { id: 'post-zhangshi-changan', templateId: 'pos-zhangshi', territoryId: 'zhou-changan', holderId: null },
        { id: 'post-lushibcanjun-changan', templateId: 'pos-lushibcanjun', territoryId: 'zhou-changan', holderId: null },
      ],
      moneyRatio: 3,
      grainRatio: 4,
      control: 85,
      development: 60,
      populace: 60,
      buildings: [
        { buildingId: 'building-market', level: 2 },
        { buildingId: 'building-academy', level: 1 },
        { buildingId: 'building-temple', level: 1 },
        { buildingId: 'building-walls', level: 2 },
      ],
      constructions: [],
      garrison: 5000,
      basePopulation: 120000,
    },
    {
      id: 'zhou-luoyang',
      name: '洛阳',
      tier: 'zhou',
      territoryType: 'civil',
      parentId: 'dao-guannei',
      childIds: [],
      dejureControllerId: 'char-yizong',
      posts: [
        { id: 'post-cishi-luoyang', templateId: 'pos-cishi', territoryId: 'zhou-luoyang', holderId: 'char-yizong', appointedBy: 'system', appointedDate: { year: 870, month: 1 } },
        { id: 'post-sima-luoyang', templateId: 'pos-sima', territoryId: 'zhou-luoyang', holderId: null },
        { id: 'post-zhangshi-luoyang', templateId: 'pos-zhangshi', territoryId: 'zhou-luoyang', holderId: null },
        { id: 'post-lushibcanjun-luoyang', templateId: 'pos-lushibcanjun', territoryId: 'zhou-luoyang', holderId: null },
      ],
      moneyRatio: 2,
      grainRatio: 3,
      control: 70,
      development: 60,
      populace: 55,
      buildings: [
        { buildingId: 'building-market', level: 1 },
        { buildingId: 'building-farm', level: 2 },
        { buildingId: 'building-granary', level: 1 },
        { buildingId: null, level: 0 },
      ],
      constructions: [],
      garrison: 3000,
      basePopulation: 80000,
    },
    {
      id: 'zhou-taiyuan',
      name: '太原',
      tier: 'zhou',
      territoryType: 'military',
      parentId: 'dao-hedong',
      childIds: [],
      dejureControllerId: 'char-likeyong',
      posts: [
        { id: 'post-fangyu-taiyuan', templateId: 'pos-fangyu-shi', territoryId: 'zhou-taiyuan', holderId: 'char-likeyong', appointedBy: 'char-yizong', appointedDate: { year: 869, month: 1 } },
        { id: 'post-sima-taiyuan', templateId: 'pos-sima', territoryId: 'zhou-taiyuan', holderId: null },
        { id: 'post-zhangshi-taiyuan', templateId: 'pos-zhangshi', territoryId: 'zhou-taiyuan', holderId: null },
        { id: 'post-lushibcanjun-taiyuan', templateId: 'pos-lushibcanjun', territoryId: 'zhou-taiyuan', holderId: null },
      ],
      moneyRatio: 2,
      grainRatio: 5,
      control: 90,
      development: 60,
      populace: 70,
      buildings: [
        { buildingId: 'building-barracks', level: 2 },
        { buildingId: 'building-fortress', level: 1 },
        { buildingId: 'building-smithy', level: 1 },
        { buildingId: null, level: 0 },
      ],
      constructions: [],
      garrison: 8000,
      basePopulation: 60000,
    },
    {
      id: 'zhou-chengdu',
      name: '成都',
      tier: 'zhou',
      territoryType: 'civil',
      childIds: [],
      dejureControllerId: 'char-yizong',
      posts: [
        { id: 'post-cishi-chengdu', templateId: 'pos-cishi', territoryId: 'zhou-chengdu', holderId: 'char-yizong', appointedBy: 'system', appointedDate: { year: 870, month: 1 } },
        { id: 'post-sima-chengdu', templateId: 'pos-sima', territoryId: 'zhou-chengdu', holderId: null },
        { id: 'post-zhangshi-chengdu', templateId: 'pos-zhangshi', territoryId: 'zhou-chengdu', holderId: null },
        { id: 'post-lushibcanjun-chengdu', templateId: 'pos-lushibcanjun', territoryId: 'zhou-chengdu', holderId: null },
      ],
      moneyRatio: 4,
      grainRatio: 5,
      control: 70,
      development: 80,
      populace: 65,
      buildings: [
        { buildingId: 'building-farm', level: 2 },
        { buildingId: 'building-market', level: 1 },
        { buildingId: null, level: 0 },
        { buildingId: null, level: 0 },
      ],
      constructions: [],
      garrison: 2000,
      basePopulation: 100000,
    },
    {
      id: 'zhou-yangzhou',
      name: '扬州',
      tier: 'zhou',
      territoryType: 'civil',
      childIds: [],
      dejureControllerId: 'char-yizong',
      posts: [
        { id: 'post-cishi-yangzhou', templateId: 'pos-cishi', territoryId: 'zhou-yangzhou', holderId: 'char-gaopian', appointedBy: 'char-yizong', appointedDate: { year: 865, month: 3 } },
        { id: 'post-sima-yangzhou', templateId: 'pos-sima', territoryId: 'zhou-yangzhou', holderId: null },
        { id: 'post-zhangshi-yangzhou', templateId: 'pos-zhangshi', territoryId: 'zhou-yangzhou', holderId: null },
        { id: 'post-lushibcanjun-yangzhou', templateId: 'pos-lushibcanjun', territoryId: 'zhou-yangzhou', holderId: null },
      ],
      moneyRatio: 5,
      grainRatio: 6.2,
      control: 75,
      development: 85,
      populace: 50,
      buildings: [
        { buildingId: 'building-market', level: 2 },
        { buildingId: 'building-farm', level: 1 },
        { buildingId: 'building-post', level: 1 },
        { buildingId: null, level: 0 },
      ],
      constructions: [],
      garrison: 4000,
      basePopulation: 150000,
    },

    // ===== 道 =====
    {
      id: 'dao-guannei',
      name: '关内道',
      tier: 'dao',
      territoryType: 'civil',
      childIds: ['zhou-changan', 'zhou-luoyang'],
      dejureControllerId: 'char-yizong',
      posts: [
        { id: 'post-guancha-guannei', templateId: 'pos-guancha-shi', territoryId: 'dao-guannei', holderId: 'char-yizong', appointedBy: 'system', appointedDate: { year: 870, month: 1 } },
      ],
      moneyRatio: 0,
      grainRatio: 0,
      control: 0,
      development: 0,
      populace: 0,
      buildings: [],
      constructions: [],
      garrison: 0,
      basePopulation: 0,
    },
    {
      id: 'dao-hedong',
      name: '河东道',
      tier: 'dao',
      territoryType: 'military',
      childIds: ['zhou-taiyuan'],
      dejureControllerId: 'char-likeyong',
      posts: [
        { id: 'post-jiedushi-hedong', templateId: 'pos-jiedushi', territoryId: 'dao-hedong', holderId: 'char-likeyong', appointedBy: 'char-yizong', appointedDate: { year: 869, month: 1 } },
        { id: 'post-panguan-hedong', templateId: 'pos-panguan', territoryId: 'dao-hedong', holderId: null },
        { id: 'post-tuiguan-hedong', templateId: 'pos-tuiguan', territoryId: 'dao-hedong', holderId: null },
        { id: 'post-zhangshiji-hedong', templateId: 'pos-zhangshiji', territoryId: 'dao-hedong', holderId: null },
        { id: 'post-duyuhou-hedong', templateId: 'pos-duyuhou', territoryId: 'dao-hedong', holderId: null },
        { id: 'post-bingmashi-hedong', templateId: 'pos-bingmashi', territoryId: 'dao-hedong', holderId: null },
        { id: 'post-duzhibingmashi-hedong', templateId: 'pos-duzhibingmashi', territoryId: 'dao-hedong', holderId: null },
        { id: 'post-xunguan-hedong', templateId: 'pos-xunguan', territoryId: 'dao-hedong', holderId: null },
      ],
      moneyRatio: 0,
      grainRatio: 0,
      control: 0,
      development: 0,
      populace: 0,
      buildings: [],
      constructions: [],
      garrison: 0,
      basePopulation: 0,
    },
  ];
}

/**
 * 加载完整示例数据到 Stores 和旧版 Registries。
 */
export function loadSampleData(): void {
  const characters = createSampleCharacters();
  const territories = createSampleTerritories();
  const centralPosts = createCentralPosts();

  // 自动判定文武散官
  for (const c of characters) {
    if (c.official) {
      c.official.isCivil = isCivilByAbilities(c.abilities);
    }
  }

  // 初始化 Stores
  useCharacterStore.getState().initCharacters(characters);
  useCharacterStore.getState().setPlayerId('char-yizong');
  useTerritoryStore.getState().initTerritories(territories);
  useTerritoryStore.getState().initCentralPosts(centralPosts);

  // 初始化集权和回拨好感
  const charStore = useCharacterStore.getState();
  const CENTRALIZATION_OPINION: Record<number, number> = { 1: 10, 2: 0, 3: -10, 4: -20 };
  for (const c of characters) {
    if (c.overlordId) {
      const level = c.centralization ?? 2;
      const opinion = CENTRALIZATION_OPINION[level] ?? 0;
      if (opinion !== 0) {
        charStore.setOpinion(c.id, c.overlordId, {
          reason: '集权等级',
          value: opinion,
          decayable: false,
        });
      }
    }
  }
  // 回拨好感：以60%为基准，每10%偏移±5
  for (const c of characters) {
    if (c.redistributionRate !== undefined) {
      const opinion = Math.floor((c.redistributionRate - 60) / 10) * 5;
      if (opinion !== 0) {
        const vassals = characters.filter(v => v.overlordId === c.id);
        for (const v of vassals) {
          charStore.setOpinion(v.id, c.id, {
            reason: '回拨率',
            value: opinion,
            decayable: false,
          });
        }
      }
    }
  }

  // 初始化玩家 ledger，使 ResourceBar 从一开始就显示完整收支
  const player = useCharacterStore.getState().getPlayer();
  if (player) {
    const ledger = calculateMonthlyLedger(
      player,
      useTerritoryStore.getState().territories,
      useCharacterStore.getState().characters,
    );
    useLedgerStore.getState().updatePlayerLedger(ledger);
  }
}
