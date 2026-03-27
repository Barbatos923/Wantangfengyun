// ===== 社交系统：好感度衰减/领地漂移/贤能积累/品位晋升 =====

import type { GameDate } from '@engine/types.ts';
import type { Character } from '@engine/character/types.ts';
import { useCharacterStore } from '@engine/character/CharacterStore.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';
import {
  decayOpinions,
  getEffectiveAbilities,
} from '@engine/character/characterUtils.ts';
import {
  calculateAttributeDrift,
  applyAttributeDrift,
} from '@engine/territory/territoryUtils.ts';
import {
  checkRankPromotion,
  calculateMonthlyVirtue,
  getActualController,
} from '@engine/official/officialUtils.ts';

export function runSocialSystem(_date: GameDate): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();

  // ===== 好感度衰减（批量） =====
  charStore.batchMutate((chars) => {
    for (const char of chars.values()) {
      if (!char.alive) continue;
      const decayed = decayOpinions(char);
      if (decayed.relationships !== char.relationships) {
        chars.set(char.id, { ...char, relationships: decayed.relationships });
      }
    }
  });

  // ===== 领地属性漂移 =====
  const allZhou = terrStore.getAllZhou();
  for (const terr of allZhou) {
    const controllerId = getActualController(terr);
    const ruler = controllerId ? useCharacterStore.getState().getCharacter(controllerId) : undefined;
    const rulerTraitIds = ruler?.traitIds ?? [];
    const rulerAbilities = ruler ? getEffectiveAbilities(ruler) : undefined;
    const drift = calculateAttributeDrift(terr, rulerTraitIds, rulerAbilities);
    const patch = applyAttributeDrift(terr, drift);
    terrStore.updateTerritory(terr.id, patch);
  }

  // ===== 贤能积累与品位晋升（批量） =====
  useCharacterStore.getState().batchMutate((chars) => {
    for (const char of chars.values()) {
      if (!char.alive || !char.official) continue;
      const virtueGain = calculateMonthlyVirtue(char);
      let official = char.official;

      if (virtueGain > 0) {
        official = { ...official, virtue: official.virtue + virtueGain };
      }

      // 检查晋升（用更新后的 virtue）
      const charWithUpdatedVirtue: Character = official !== char.official
        ? { ...char, official }
        : char;
      const newRank = checkRankPromotion(charWithUpdatedVirtue);
      if (newRank !== null) {
        official = { ...(official !== char.official ? official : { ...official }), rankLevel: newRank };
      }

      if (official !== char.official) {
        chars.set(char.id, { ...char, official });
      }
    }
  });
}
