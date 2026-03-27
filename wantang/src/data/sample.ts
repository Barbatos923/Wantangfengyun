// ===== 游戏初始数据组装 =====

import { isCivilByAbilities } from '@engine/official/officialUtils';
import type { Post } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { calculateMonthlyLedger } from '@engine/official/officialUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { createAllTerritories } from './territories';
import { createAllCharacters } from './characters';
import { createAllArmies, createAllBattalions } from './initialArmies';

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
