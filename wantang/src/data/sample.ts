// ===== 完整示例数据 =====

import type { Character } from '@engine/character/types';
import type { OfficialData } from '@engine/official/types';
import { isCivilByAbilities } from '@engine/official/officialUtils';
import type { Territory } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { characterRegistry, territoryRegistry } from './registries';

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
      resources: { money: 5000, grain: 12000, prestige: 80, legitimacy: 85 },
      relationships: [],
      overlordId: undefined,

      isPlayer: true,
      isRuler: true,
      controlledTerritoryIds: ['zhou-changan', 'zhou-luoyang', 'zhou-chengdu'],
      title: '大唐天子',
      official: {
        rankLevel: 29,
        virtue: 9999,
        positions: [{ positionId: 'pos-emperor', appointedBy: 'system', appointedDate: { year: 859, month: 1 } }],
        isCivil: false, // 自动覆盖
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
      resources: { money: 3000, grain: 8000, prestige: 60, legitimacy: 40 },
      relationships: [],
      overlordId: 'char-yizong',

      isPlayer: false,
      isRuler: true,
      controlledTerritoryIds: ['zhou-yangzhou'],
      title: '淮南节度使',
      official: {
        rankLevel: 18,
        virtue: 1075,
        positions: [{ positionId: 'pos-jiedushi', appointedBy: 'char-yizong', appointedDate: { year: 865, month: 3 }, territoryId: 'dao-guannei' }],
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
      resources: { money: 800, grain: 2000, prestige: 30, legitimacy: 5 },
      relationships: [],
      overlordId: undefined,

      isPlayer: false,
      isRuler: true,
      controlledTerritoryIds: [],
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
      resources: { money: 2000, grain: 5000, prestige: 40, legitimacy: 20 },
      relationships: [],
      overlordId: 'char-yizong',

      isPlayer: false,
      isRuler: true,
      controlledTerritoryIds: [],
      title: '宣武节度使',
      official: {
        rankLevel: 15,
        virtue: 720,
        positions: [{ positionId: 'pos-jiedushi', appointedBy: 'char-yizong', appointedDate: { year: 868, month: 6 } }],
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
      resources: { money: 500, grain: 1500, prestige: 25, legitimacy: 10 },
      relationships: [],
      overlordId: 'char-likeyong',

      isPlayer: false,
      isRuler: false,
      controlledTerritoryIds: [],
      title: '振武军节度使（前）',
      official: {
        rankLevel: 14,
        virtue: 680,
        positions: [],
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
      // 870年14岁，尚未获得教育特质
      health: 95,
      stress: 15,
      alive: true,
      resources: { money: 1500, grain: 4000, prestige: 35, legitimacy: 15 },
      relationships: [],
      overlordId: 'char-yizong',

      isPlayer: false,
      isRuler: true,
      controlledTerritoryIds: ['zhou-taiyuan'],
      title: '河东节度使',
      official: {
        rankLevel: 16,
        virtue: 990,
        positions: [{ positionId: 'pos-jiedushi', appointedBy: 'char-yizong', appointedDate: { year: 869, month: 1 }, territoryId: 'dao-hedong' }],
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
      resources: { money: 2000, grain: 3000, prestige: 50, legitimacy: 45 },
      relationships: [],
      overlordId: 'char-yizong',

      isPlayer: false,
      isRuler: false,
      controlledTerritoryIds: [],
      title: '三司使',
      official: {
        rankLevel: 18,
        virtue: 1060,
        positions: [{ positionId: 'pos-sansi-shi', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 3 } }],
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
      resources: { money: 800, grain: 1500, prestige: 20, legitimacy: 25 },
      relationships: [],
      overlordId: 'char-luyan',

      isPlayer: false,
      isRuler: false,
      controlledTerritoryIds: [],
      title: '三司推官',
      official: {
        rankLevel: 8,
        virtue: 360,
        positions: [{ positionId: 'pos-sansi-tuiguan', appointedBy: 'char-luyan', appointedDate: { year: 868, month: 6 } }],
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
      resources: { money: 300, grain: 600, prestige: 15, legitimacy: 10 },
      relationships: [],
      overlordId: 'char-likeyong',
      isPlayer: false,
      isRuler: false,
      controlledTerritoryIds: [],
      title: '廷臣',
      official: {
        rankLevel: 14,
        virtue: 660,
        positions: [],
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
      resources: { money: 200, grain: 500, prestige: 10, legitimacy: 5 },
      relationships: [],
      overlordId: 'char-likeyong',
      isPlayer: false,
      isRuler: false,
      controlledTerritoryIds: [],
      title: '廷臣',
      official: {
        rankLevel: 8,
        virtue: 360,
        positions: [],
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
      resources: { money: 150, grain: 400, prestige: 8, legitimacy: 5 },
      relationships: [],
      overlordId: 'char-likeyong',
      isPlayer: false,
      isRuler: false,
      controlledTerritoryIds: [],
      title: '廷臣',
      official: {
        rankLevel: 6,
        virtue: 260,
        positions: [],
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
      resources: { money: 1000, grain: 1500, prestige: 35, legitimacy: 30 },
      relationships: [],
      overlordId: 'char-yizong',
      isPlayer: false,
      isRuler: false,
      controlledTerritoryIds: [],
      title: '廷臣',
      official: {
        rankLevel: 20,
        virtue: 1160,
        positions: [],
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
      resources: { money: 800, grain: 1200, prestige: 40, legitimacy: 35 },
      relationships: [],
      overlordId: 'char-yizong',
      isPlayer: false,
      isRuler: false,
      controlledTerritoryIds: [],
      title: '廷臣',
      official: {
        rankLevel: 22,
        virtue: 1260,
        positions: [],
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
      resources: { money: 600, grain: 1000, prestige: 25, legitimacy: 20 },
      relationships: [],
      overlordId: 'char-yizong',
      isPlayer: false,
      isRuler: false,
      controlledTerritoryIds: [],
      title: '廷臣',
      official: {
        rankLevel: 18,
        virtue: 1060,
        positions: [],
        isCivil: false,
      },
    },
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
      actualControllerId: 'char-yizong',
      centralization: 3,
      control: 85,
      development: 90,
      populace: 60,
      buildings: [
        { buildingId: 'building-market', level: 2 },
        { buildingId: 'building-academy', level: 1 },
        { buildingId: 'building-temple', level: 1 },
        { buildingId: 'building-walls', level: 2 },
      ],
      constructions: [],
      garrison: 5000,
      basePopulation: 50000,
    },
    {
      id: 'zhou-luoyang',
      name: '洛阳',
      tier: 'zhou',
      territoryType: 'civil',
      parentId: 'dao-guannei',
      childIds: [],
      dejureControllerId: 'char-yizong',
      actualControllerId: 'char-yizong',
      centralization: 2,
      control: 70,
      development: 80,
      populace: 55,
      buildings: [
        { buildingId: 'building-market', level: 1 },
        { buildingId: 'building-farm', level: 2 },
        { buildingId: 'building-granary', level: 1 },
        { buildingId: null, level: 0 },
      ],
      constructions: [],
      garrison: 3000,
      basePopulation: 40000,
    },
    {
      id: 'zhou-taiyuan',
      name: '太原',
      tier: 'zhou',
      territoryType: 'military',
      parentId: 'dao-hedong',
      childIds: [],
      dejureControllerId: 'char-likeyong',
      actualControllerId: 'char-likeyong',
      centralization: 3,
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
      basePopulation: 30000,
    },
    {
      id: 'zhou-chengdu',
      name: '成都',
      tier: 'zhou',
      territoryType: 'civil',
      childIds: [],
      dejureControllerId: 'char-yizong',
      actualControllerId: 'char-yizong',
      centralization: 2,
      control: 65,
      development: 75,
      populace: 65,
      buildings: [
        { buildingId: 'building-farm', level: 2 },
        { buildingId: 'building-market', level: 1 },
        { buildingId: null, level: 0 },
        { buildingId: null, level: 0 },
      ],
      constructions: [],
      garrison: 2000,
      basePopulation: 35000,
    },
    {
      id: 'zhou-yangzhou',
      name: '扬州',
      tier: 'zhou',
      territoryType: 'civil',
      childIds: [],
      dejureControllerId: 'char-yizong',
      actualControllerId: 'char-gaopian',
      centralization: 2,
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
      basePopulation: 45000,
    },

    // ===== 道 =====
    {
      id: 'dao-guannei',
      name: '关内道',
      tier: 'dao',
      territoryType: 'civil',
      childIds: ['zhou-changan', 'zhou-luoyang'],
      dejureControllerId: 'char-yizong',
      actualControllerId: 'char-yizong',
      centralization: 2,
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
      actualControllerId: 'char-likeyong',
      centralization: 3,
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
 * 在应用启动时调用一次。
 */
export function loadSampleData(): void {
  const characters = createSampleCharacters();
  const territories = createSampleTerritories();

  // 自动判定文武散官：军事为最高属性→武散官，否则→文散官
  for (const c of characters) {
    if (c.official) {
      c.official.isCivil = isCivilByAbilities(c.abilities);
    }
  }

  // 州级绑定：为所有直辖州的控制者自动补全刺史职位
  const charMap = new Map(characters.map((c) => [c.id, c]));
  for (const t of territories) {
    if (t.tier !== 'zhou') continue;
    const controller = charMap.get(t.actualControllerId);
    if (!controller?.official) continue;
    // 检查是否已持有该州的刺史
    const hasCishi = controller.official.positions.some(
      (p) => p.positionId === 'pos-cishi' && p.territoryId === t.id,
    );
    if (!hasCishi) {
      controller.official.positions.push({
        positionId: 'pos-cishi',
        appointedBy: controller.overlordId ?? 'system',
        appointedDate: { year: 870, month: 1 },
        territoryId: t.id,
      });
    }
  }

  // 初始化新的 Zustand stores
  useCharacterStore.getState().initCharacters(characters);
  useCharacterStore.getState().setPlayerId('char-yizong');
  useTerritoryStore.getState().initTerritories(territories);

  // 向后兼容旧的 registries（GameMap 等组件仍使用）
  for (const c of characters) {
    characterRegistry.register(c.id, { id: c.id, name: c.name, title: c.title });
  }
  for (const t of territories) {
    territoryRegistry.register(t.id, {
      id: t.id,
      name: t.name,
      type: t.tier,
      controllerId: t.actualControllerId,
    });
  }
}
