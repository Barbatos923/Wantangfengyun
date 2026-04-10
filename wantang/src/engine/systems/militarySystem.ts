// ===== 军事系统：征兵池恢复/士气训练/兵变检查 =====

import type { GameDate } from '@engine/types.ts';
import { EventPriority } from '@engine/types.ts';
import { useCharacterStore } from '@engine/character/CharacterStore.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';
import { useMilitaryStore } from '@engine/military/MilitaryStore.ts';
import { useTurnManager } from '@engine/TurnManager.ts';
import { getConscriptionCap } from '@engine/military/militaryCalc.ts';
import { clamp } from '@engine/utils.ts';
import { random } from '@engine/random.ts';
import { runMilitaryAI } from '@engine/military/militaryAI.ts';

export function runMilitarySystem(date: GameDate): void {
  const terrStore = useTerritoryStore.getState();

  // ===== 兵役人口月恢复 =====
  const zhouForConscription = terrStore.getAllZhou();
  for (const terr of zhouForConscription) {
    const cap = getConscriptionCap(terr);
    if (terr.conscriptionPool < cap) {
      const regen = cap / 12;
      const newPool = Math.min(cap, terr.conscriptionPool + regen);
      terrStore.updateTerritory(terr.id, { conscriptionPool: newPool });
    }
  }

  // ===== 军队士气月结 + 精锐度训练 =====
  const milStore = useMilitaryStore.getState();
  const milArmies = milStore.armies;
  const territories = terrStore.territories;
  milStore.batchMutateBattalions((battalions) => {
    for (const bat of battalions.values()) {
      let moraleDelta = 0;

      if (bat.locationId === bat.homeTerritory) {
        // 驻扎在家：仅基础衰减
        moraleDelta = -0.5;
      } else {
        // 离开籍贯：根据距离衰减
        moraleDelta = -0.5; // 同道内基础衰减
        const homeTerr = territories.get(bat.homeTerritory);
        const currTerr = territories.get(bat.locationId);
        if (homeTerr && currTerr) {
          const homeDao = homeTerr.parentId;
          const currDao = currTerr.parentId;
          if (homeDao !== currDao) {
            const homeDaoTerr = homeDao ? territories.get(homeDao) : undefined;
            const currDaoTerr = currDao ? territories.get(currDao) : undefined;
            const homeGuo = homeDaoTerr?.parentId;
            const currGuo = currDaoTerr?.parentId;
            if (homeGuo !== currGuo) {
              moraleDelta = -2.5; // 离开本国
            } else {
              moraleDelta = -1;   // 同国不同道
            }
          }
        }
      }

      const newMorale = clamp(bat.morale + moraleDelta, 0, 100);

      // 精锐度训练：兵马使军事能力 / 5，上限50（实战才能突破）
      let newElite = bat.elite;
      const army = milArmies.get(bat.armyId);
      if (army?.commanderId && bat.elite < 50) {
        const commander = useCharacterStore.getState().getCharacter(army.commanderId);
        if (commander) {
          const trainingGain = commander.abilities.military / 5;
          newElite = Math.min(50, bat.elite + trainingGain);
        }
      }

      if (newMorale !== bat.morale || newElite !== bat.elite) {
        battalions.set(bat.id, { ...bat, morale: newMorale, elite: newElite });
      }
    }
  });

  // ===== 兵变检查 =====
  const battalionsAfterMorale = useMilitaryStore.getState().battalions;
  for (const bat of battalionsAfterMorale.values()) {
    if (bat.morale < 20) {
      // 兵变概率：(20 - morale) / 100，即 morale=0 时 20% 概率
      const mutinyChance = (20 - bat.morale) / 100;
      if (random() < mutinyChance) {
        // 查找所属 army 的 owner
        const army = useMilitaryStore.getState().getArmy(bat.armyId);
        if (army) {
          const ownerName = useCharacterStore.getState().getCharacter(army.ownerId)?.name ?? '?';
          useTurnManager.getState().addEvent({
            id: `mutiny-${date.year}-${date.month}-${date.day}-${bat.id}`,
            date,
            type: '兵变',
            actors: [army.ownerId],
            territories: [bat.locationId],
            description: `${ownerName}麾下${bat.name}（${bat.currentStrength}人）发生兵变`,
            priority: EventPriority.Major,
          });
        }
      }
    }
  }

  // ===== NPC 军事编制 AI =====
  runMilitaryAI();
}
