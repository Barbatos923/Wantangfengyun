// ===== 社交系统：好感度衰减/领地漂移/贤能积累/品位晋升 =====

import type { GameDate } from '@engine/types.ts';
import type { Character } from '@engine/character/types.ts';
import { useCharacterStore } from '@engine/character/CharacterStore.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';
import { useTurnManager } from '@engine/TurnManager.ts';
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
import { findEmperorId } from '@engine/official/postQueries.ts';
import { calcEraDecay, getRankLegitimacyCap, calcMonthlyPrestigeGrowth } from '@engine/official/legitimacyCalc.ts';

export function runSocialSystem(_date: GameDate): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();

  // ===== 正统性预期缓存兜底刷新 =====
  terrStore.refreshExpectedLegitimacy();

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

  // ===== 正统性：时代衰减 + 品位Cap（批量） =====
  // 好感传导已改为实时计算（characterUtils.ts），无需写入 relationships
  {
    const terrStore2 = useTerritoryStore.getState();
    const era = useTurnManager.getState().era;
    const emperorId = findEmperorId(terrStore2.territories, terrStore2.centralPosts);
    const eraDecay = calcEraDecay(era);

    useCharacterStore.getState().batchMutate((chars) => {
      for (const char of chars.values()) {
        if (!char.alive) continue;
        let changed = false;
        let resources = char.resources;

        // 1. 皇帝时代衰减
        if (char.id === emperorId && eraDecay !== 0) {
          const newLeg = Math.max(0, resources.legitimacy + eraDecay);
          if (newLeg !== resources.legitimacy) {
            resources = { ...resources, legitimacy: newLeg };
            changed = true;
          }
        }

        // 2. 品位 Cap 强制
        if (char.official) {
          const cap = getRankLegitimacyCap(char.official.rankLevel);
          if (resources.legitimacy > cap) {
            resources = { ...resources, legitimacy: cap };
            changed = true;
          }
        }

        // 3. 名望自然增长（按品级）
        if (char.official) {
          const growth = calcMonthlyPrestigeGrowth(char.official.rankLevel);
          if (growth > 0) {
            resources = { ...resources, prestige: resources.prestige + growth };
            changed = true;
          }
        }

        if (changed) {
          chars.set(char.id, { ...char, resources });
        }
      }
    });
  }

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
