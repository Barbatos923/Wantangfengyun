// ===== 游戏初始数据组装 =====

import { isCivilByAbilities } from '@engine/official/officialUtils';
import type { Post } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { calculateMonthlyLedger } from '@engine/official/officialUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { ALL_POSITIONS } from './positions';
import { createAllTerritories } from './territories';
import { createAllCharacters } from './characters';
import { createAllArmies, createAllBattalions } from './initialArmies';

/** 有人在任的中央岗位 */
const FILLED_CENTRAL_POSTS: Post[] = [
  { id: 'post-emperor', templateId: 'pos-emperor', holderId: 'char-yizong', appointedBy: 'system', appointedDate: { year: 859, month: 1 } },
  { id: 'post-sansi-shi', templateId: 'pos-sansi-shi', holderId: 'char-luyan', appointedBy: 'char-yizong', appointedDate: { year: 866, month: 3 } },
  { id: 'post-sansi-tuiguan', templateId: 'pos-sansi-tuiguan', holderId: 'char-chenjingxuan', appointedBy: 'char-luyan', appointedDate: { year: 868, month: 6 } },
];

/** 为所有中央/特殊职位模板生成 Post 岗位实例 */
function createCentralPosts(): Post[] {
  const filledMap = new Map(FILLED_CENTRAL_POSTS.map(p => [p.templateId, p]));
  const posts: Post[] = [];

  for (const tpl of ALL_POSITIONS) {
    if (tpl.scope !== 'central') continue;
    const existing = filledMap.get(tpl.id);
    if (existing) {
      posts.push(existing);
    } else {
      posts.push({
        id: `post-${tpl.id.slice(4)}`,   // pos-xxx → post-xxx
        templateId: tpl.id,
        holderId: null,
      });
    }
  }

  return posts;
}

/**
 * 加载完整初始数据到 Stores。
 */
export function loadSampleData(): void {
  const characters = createAllCharacters();
  const territories = createAllTerritories();
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
