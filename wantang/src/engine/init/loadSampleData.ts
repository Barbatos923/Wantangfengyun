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

  // 为缺少 capital 的有领地角色自动补充治所
  {
    const charStore = useCharacterStore.getState();
    const { controllerIndex } = useTerritoryStore.getState();
    for (const charId of controllerIndex.keys()) {
      const c = charStore.characters.get(charId);
      if (c && c.alive && !c.capital) {
        charStore.refreshCapital(charId);
      }
    }
  }

  // 初始化军队
  const armies = createAllArmies();
  const battalions = createAllBattalions();
  useMilitaryStore.getState().initMilitary(armies, battalions);

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
