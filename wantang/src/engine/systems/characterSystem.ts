// ===== 角色系统：健康/死亡/压力/成长 =====

import type { GameDate } from '@engine/types.ts';
import { useCharacterStore } from '@engine/character/CharacterStore.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';
import {
  calculateMonthlyHealthChange,
  calculateMonthlyStressChange,
  assignPersonalityTraits,
  assignEducationTrait,
  getEffectiveAbilities,
} from '@engine/character/characterUtils.ts';
import { clamp } from '@engine/utils.ts';
import { randInt } from '@engine/random.ts';

export function runCharacterSystem(date: GameDate): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();

  // ===== 1. 角色健康结算（批量） =====
  const deadIds: string[] = [];
  charStore.batchMutate((chars) => {
    for (const char of chars.values()) {
      if (!char.alive) continue;
      const healthChange = calculateMonthlyHealthChange(char, date.year);
      const newHealth = clamp(char.health + healthChange, 0, 100);

      if (newHealth <= 0) {
        chars.set(char.id, { ...char, alive: false, deathYear: date.year });
        deadIds.push(char.id);
      } else if (newHealth !== char.health) {
        chars.set(char.id, { ...char, health: newHealth });
      }
    }
  });

  // 死亡角色：清空岗位、转移军队
  if (deadIds.length > 0) {
    for (const deadId of deadIds) {
      const posts = terrStore.getPostsByHolder(deadId);
      for (const post of posts) {
        terrStore.updatePost(post.id, { holderId: null, appointedBy: undefined, appointedDate: undefined });
      }
    }
  }

  // ===== 2. 角色压力结算（批量） =====
  charStore.batchMutate((chars) => {
    for (const char of chars.values()) {
      if (!char.alive) continue;
      const stressChange = calculateMonthlyStressChange(char);
      let newStress = clamp(char.stress + stressChange, 0, 100);
      let traitIds = char.traitIds;

      // 压力=50：获得忧虑特质
      if (newStress >= 50 && char.stress < 50 && !traitIds.includes('trait-anxious')) {
        traitIds = [...traitIds, 'trait-anxious'];
      }

      // 压力=100：精神崩溃
      if (newStress >= 100) {
        const positiveTraits = traitIds.filter((t) =>
          ['trait-brave', 'trait-just', 'trait-social', 'trait-trusting', 'trait-content'].includes(t),
        );
        if (positiveTraits.length > 0) {
          const removeIdx = randInt(0, positiveTraits.length - 1);
          traitIds = traitIds.filter((t) => t !== positiveTraits[removeIdx]);
        } else if (!traitIds.includes('trait-anxious')) {
          traitIds = [...traitIds, 'trait-anxious'];
        }
        newStress = 50; // 重置
      }

      if (newStress !== char.stress || traitIds !== char.traitIds) {
        chars.set(char.id, { ...char, stress: newStress, traitIds });
      }
    }
  });

  // ===== 3. 角色成长（正月时，批量） =====
  if (date.month === 1) {
    charStore.batchMutate((chars) => {
      for (const char of chars.values()) {
        if (!char.alive) continue;
        const age = date.year - char.birthYear;
        let traitIds = char.traitIds;

        if (age === 6) {
          const newTraits = assignPersonalityTraits(traitIds);
          if (newTraits.length > 0) {
            traitIds = [...traitIds, ...newTraits];
          }
        }

        if (age === 16) {
          const effectiveAbilities = getEffectiveAbilities(char);
          const eduTraitId = assignEducationTrait(effectiveAbilities);
          traitIds = [...traitIds, eduTraitId];
        }

        if (traitIds !== char.traitIds) {
          chars.set(char.id, { ...char, traitIds });
        }
      }
    });
  }
}
