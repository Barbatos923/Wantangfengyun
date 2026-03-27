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
  milStore.batchMutateBattalions((battalions) => {
    for (const bat of battalions.values()) {
      let moraleDelta = -0.5; // 基础衰减

      // 出籍贯地
      if (bat.locationId !== bat.homeTerritory) {
        moraleDelta -= 2;
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
          useTurnManager.getState().addEvent({
            id: `mutiny-${date.year}-${date.month}-${bat.id}`,
            date,
            type: '兵变',
            actors: [army.ownerId],
            territories: [bat.locationId],
            description: `${bat.name}士气极低，发生兵变！`,
            priority: EventPriority.Major,
          });
        }
      }
    }
  }
}
