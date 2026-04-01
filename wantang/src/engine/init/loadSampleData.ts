// ===== 游戏初始数据加载 =====
// 所有数据从 JSON 文件加载，不做运行时生成。

import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { calculateMonthlyLedger } from '@engine/official/officialUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { createAllTerritories } from '@data/territories';
import { createAllCharacters } from '@data/characters';
import { createCentralPosts } from '@data/centralPosts';
import { createAllArmies, createAllBattalions } from '@data/initialArmies';

/**
 * 加载完整初始数据到 Stores。
 * 数据全部来自 JSON，无运行时生成。
 */
export function loadSampleData(): void {
  const characters = createAllCharacters();
  const territories = createAllTerritories();
  const centralPosts = createCentralPosts();

  // 初始化 Stores
  useCharacterStore.getState().initCharacters(characters);
  useCharacterStore.getState().setPlayerId('char-yizong');
  useTerritoryStore.getState().initTerritories(territories);
  useTerritoryStore.getState().initCentralPosts(centralPosts);

  // 初始化军队
  const armies = createAllArmies();
  const battalions = createAllBattalions();
  useMilitaryStore.getState().initMilitary(armies, battalions);

  // 初始化赋税等级和回拨好感
  const charStore = useCharacterStore.getState();
  const CENTRALIZATION_OPINION: Record<number, number> = { 1: 10, 2: 0, 3: -10, 4: -20 };
  for (const c of characters) {
    if (c.overlordId) {
      const level = c.centralization ?? 2;
      const opinion = CENTRALIZATION_OPINION[level] ?? 0;
      if (opinion !== 0) {
        charStore.setOpinion(c.id, c.overlordId, {
          reason: '赋税等级',
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


  // 初始化玩家 ledger
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
