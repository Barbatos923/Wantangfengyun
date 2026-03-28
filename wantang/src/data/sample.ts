// ===== 游戏初始数据组装 =====

import { isCivilByAbilities } from '@engine/official/officialUtils';
import type { Character } from '@engine/character/types';
import type { Post, Territory } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { calculateMonthlyLedger } from '@engine/official/officialUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { ALL_POSITIONS, positionMap } from './positions';
import { createAllTerritories } from './territories';
import { createAllCharacters } from './characters';
import { createAllArmies, createAllBattalions } from './initialArmies';
import { generateFillerCharacter, resetNameIndex } from './characterGen';

/** 多实例岗位：模板 ID → 总数量 */
const MULTI_INSTANCE_COUNTS: Record<string, number> = {
  'pos-zaixiang': 2,
  'pos-hanlin': 3,
};

/** 有人在任的中央岗位（含多实例） */
const FILLED_CENTRAL_POSTS: Post[] = [
  // （皇帝岗位在 tianxia 领地上，不在中央岗位中重复）
  // ── 宰相 ×2 ──
  { id: 'post-zaixiang-1', templateId: 'pos-zaixiang', holderId: 'char-weibaohen', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 1 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  { id: 'post-zaixiang-2', templateId: 'pos-zaixiang', holderId: 'char-luyan', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 3 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 翰林学士 ×3 ──
  { id: 'post-hanlin-1', templateId: 'pos-hanlin', holderId: 'char-ct-weizhaodu', appointedBy: 'char-yizong', appointedDate: { year: 865, month: 1 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  { id: 'post-hanlin-2', templateId: 'pos-hanlin', holderId: 'char-ct-liuye', appointedBy: 'char-yizong', appointedDate: { year: 864, month: 6 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  { id: 'post-hanlin-3', templateId: 'pos-hanlin', holderId: 'char-ct-zhengwei', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 1 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 枢密使 ──
  { id: 'post-shumi', templateId: 'pos-shumi', holderId: 'char-ct-yangfugong', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 6 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 左/右神策军 ──
  { id: 'post-shence-left', templateId: 'pos-shence-left', holderId: 'char-ct-tianlingzi', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 1 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  { id: 'post-shence-right', templateId: 'pos-shence-right', holderId: 'char-ct-ximentaishen', appointedBy: 'char-yizong', appointedDate: { year: 865, month: 6 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 三司 ──
  { id: 'post-sansi-shi', templateId: 'pos-sansi-shi', holderId: 'char-ct-peizhao', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 3 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  { id: 'post-sansi-panguan', templateId: 'pos-sansi-panguan', holderId: 'char-chenjingxuan', appointedBy: 'char-ct-peizhao', appointedDate: { year: 868, month: 6 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 吏部 ──
  { id: 'post-guanlibu-shangshu', templateId: 'pos-guanlibu-shangshu', holderId: 'char-liwei', appointedBy: 'char-yizong', appointedDate: { year: 865, month: 6 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 户部 ──
  { id: 'post-hubu-shangshu', templateId: 'pos-hubu-shangshu', holderId: 'char-ct-peitan', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 1 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 礼部 ──
  { id: 'post-liyibu-shangshu', templateId: 'pos-liyibu-shangshu', holderId: 'char-ct-liuye', appointedBy: 'char-yizong', appointedDate: { year: 863, month: 1 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 兵部 ──
  { id: 'post-bingbu-shangshu', templateId: 'pos-bingbu-shangshu', holderId: 'char-ct-xiaochu', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 6 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 刑部 ──
  { id: 'post-xingbu-shangshu', templateId: 'pos-xingbu-shangshu', holderId: 'char-ct-wangning', appointedBy: 'char-yizong', appointedDate: { year: 865, month: 1 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 工部 ──
  { id: 'post-gongbu-shangshu', templateId: 'pos-gongbu-shangshu', holderId: 'char-ct-zhengqi', appointedBy: 'char-yizong', appointedDate: { year: 864, month: 6 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 御史台 ──
  { id: 'post-yushi-dafu', templateId: 'pos-yushi-dafu', holderId: 'char-ct-cuiyanchao', appointedBy: 'char-yizong', appointedDate: { year: 865, month: 1 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  { id: 'post-yushi-zhongcheng', templateId: 'pos-yushi-zhongcheng', holderId: 'char-ct-zhengyanxiu', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 1 }, successionLaw: 'bureaucratic', hasAppointRight: false },
  // ── 中书舍人 ──
  { id: 'post-zhongshu-sheren', templateId: 'pos-zhongshu-sheren', holderId: 'char-ct-cuihan', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 3 }, successionLaw: 'bureaucratic', hasAppointRight: false },
];

/** 为所有中央/特殊职位模板生成 Post 岗位实例 */
function createCentralPosts(): Post[] {
  // 先收入所有预填的岗位
  const posts: Post[] = [...FILLED_CENTRAL_POSTS];
  // 已生成的模板 → 实例数量
  const templateCounts = new Map<string, number>();
  for (const p of FILLED_CENTRAL_POSTS) {
    templateCounts.set(p.templateId, (templateCounts.get(p.templateId) ?? 0) + 1);
  }

  for (const tpl of ALL_POSITIONS) {
    if (tpl.scope !== 'central') continue;
    if (tpl.id === 'pos-emperor') continue; // 皇帝岗位在 tianxia 领地上
    const target = MULTI_INSTANCE_COUNTS[tpl.id] ?? 1;
    const existing = templateCounts.get(tpl.id) ?? 0;
    // 补足空缺实例
    for (let i = existing; i < target; i++) {
      const suffix = target > 1 ? `-${i + 1}` : '';
      posts.push({
        id: `post-${tpl.id.slice(4)}${suffix}`,
        templateId: tpl.id,
        holderId: null,
        successionLaw: 'bureaucratic',
        hasAppointRight: false,
      });
    }
  }

  return posts;
}

/** 虚衔模板，不填人 */
const HONORARY_TEMPLATES = new Set([
  'pos-zhongshuling', 'pos-shizhong', 'pos-shangshuling',
  'pos-taishi', 'pos-taifu', 'pos-taibao',
]);

/**
 * 为所有空缺的非虚衔岗位生成填充角色并设置 holderId。
 * 在 initCharacters 之前调用，直接修改传入的数组。
 */
function fillVacantSubPosts(
  territories: Territory[],
  centralPosts: Post[],
  characters: Character[],
): void {
  resetNameIndex();

  // 临时 territories Map 用于查找辟署权
  const terrMap = new Map(territories.map(t => [t.id, t]));

  // 已有角色 ID 集合（避免重复）
  const usedIds = new Set(characters.map(c => c.id));
  let counter = 0;

  function fillPost(post: Post, overlordId: string, isCivil: boolean): void {
    const tpl = positionMap.get(post.templateId);
    if (!tpl) return;
    const id = `char-gen-${counter++}`;
    const char = generateFillerCharacter({
      id,
      rankLevel: tpl.minRank,
      overlordId,
      isCivil,
    });
    characters.push(char);
    usedIds.add(id);
    post.holderId = id;
    post.appointedBy = overlordId;
    post.appointedDate = { year: 867, month: 1 };
  }

  // 1. 地方副岗
  for (const terr of territories) {
    for (const post of terr.posts) {
      if (post.holderId !== null) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl || tpl.grantsControl) continue; // 主岗不填（由 territories.ts 定义）

      // 确定 overlordId：本领地 grantsControl 主岗持有人 → 沿 parentId 向上找 → 皇帝
      let overlordId: string | null = null;
      let searchId: string | undefined = post.territoryId;
      while (searchId && !overlordId) {
        const t = terrMap.get(searchId);
        if (t) {
          const mainPost = t.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
          if (mainPost?.holderId) overlordId = mainPost.holderId;
        }
        searchId = terrMap.get(searchId)?.parentId;
      }
      if (!overlordId) overlordId = 'char-yizong';

      const isCivil = tpl.territoryType !== 'military';
      fillPost(post, overlordId, isCivil);
    }
  }

  // 2. 中央空缺副岗
  for (const post of centralPosts) {
    if (post.holderId !== null) continue;
    if (HONORARY_TEMPLATES.has(post.templateId)) continue;
    const tpl = positionMap.get(post.templateId);
    if (!tpl) continue;
    const isCivil = tpl.territoryType !== 'military';
    fillPost(post, 'char-yizong', isCivil);
  }

  // 3. 为所有 bureaucratic 岗位设置考课基线
  for (const terr of territories) {
    for (const post of terr.posts) {
      if (post.successionLaw !== 'bureaucratic' || !post.holderId) continue;
      const holder = characters.find(c => c.id === post.holderId);
      post.reviewBaseline = {
        population: terr.basePopulation,
        virtue: holder?.official?.virtue ?? 0,
        date: { year: 867, month: 1 },
      };
    }
  }
  for (const post of centralPosts) {
    if (post.successionLaw !== 'bureaucratic' || !post.holderId) continue;
    const holder = characters.find(c => c.id === post.holderId);
    post.reviewBaseline = {
      population: 0,
      virtue: holder?.official?.virtue ?? 0,
      date: { year: 867, month: 1 },
    };
  }

  // 4. 生成闲散人才（无岗位，充当铨选缓冲池）
  const talentPool: Array<{ overlordId: string; isCivil: boolean; rankLevel?: number }> = [
    // 朝廷高品闲散（废相、致仕大臣等）
    { overlordId: 'char-yizong', isCivil: true, rankLevel: 22 },
    { overlordId: 'char-yizong', isCivil: true, rankLevel: 22 },
    { overlordId: 'char-yizong', isCivil: true, rankLevel: 20 },
    { overlordId: 'char-yizong', isCivil: true, rankLevel: 20 },
    { overlordId: 'char-yizong', isCivil: false, rankLevel: 20 },
    { overlordId: 'char-yizong', isCivil: true, rankLevel: 18 },
    { overlordId: 'char-yizong', isCivil: true, rankLevel: 18 },
    { overlordId: 'char-yizong', isCivil: false, rankLevel: 18 },
    // 朝廷中品闲散
    { overlordId: 'char-yizong', isCivil: true, rankLevel: 14 },
    { overlordId: 'char-yizong', isCivil: true, rankLevel: 14 },
    { overlordId: 'char-yizong', isCivil: false, rankLevel: 14 },
    { overlordId: 'char-yizong', isCivil: true, rankLevel: 12 },
    // 朝廷低品闲散
    { overlordId: 'char-yizong', isCivil: true },
    { overlordId: 'char-yizong', isCivil: true },
    { overlordId: 'char-yizong', isCivil: false },
    { overlordId: 'char-yizong', isCivil: true },
  ];
  // 辟署权节度使各给 3 个（含 1 个中高品）
  for (const terr of territories) {
    for (const post of terr.posts) {
      if (!post.hasAppointRight || !post.holderId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      if (post.holderId === 'char-yizong') continue; // 皇帝已有
      talentPool.push({ overlordId: post.holderId, isCivil: true, rankLevel: 14 });
      talentPool.push({ overlordId: post.holderId, isCivil: true });
      talentPool.push({ overlordId: post.holderId, isCivil: false });
    }
  }
  for (const talent of talentPool) {
    const id = `char-gen-${counter++}`;
    const char = generateFillerCharacter({
      id,
      rankLevel: talent.rankLevel ?? (8 + (counter % 8)),
      overlordId: talent.overlordId,
      isCivil: talent.isCivil,
    });
    characters.push(char);
  }
}

/**
 * 加载完整初始数据到 Stores。
 */
export function loadSampleData(): void {
  const characters = createAllCharacters();
  const territories = createAllTerritories();
  const centralPosts = createCentralPosts();

  // ── 动态填充地方副岗 + 中央空缺副岗 ──
  fillVacantSubPosts(territories, centralPosts, characters);

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

  // 初始化军队
  const armies = createAllArmies();
  const battalions = createAllBattalions();
  useMilitaryStore.getState().initMilitary(armies, battalions);

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
