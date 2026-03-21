// ===== 月结算调度器 =====

import type { GameDate } from './types';
import { useCharacterStore } from './character/CharacterStore';
import { useTerritoryStore } from './territory/TerritoryStore';
import {
  calculateMonthlyHealthChange,
  calculateMonthlyStressChange,
  decayOpinions,
  assignPersonalityTraits,
  assignEducationTrait,
  getEffectiveAbilities,
} from './character/characterUtils';
import {
  calculateMonthlyIncome,
  calculateAttributeDrift,
  applyAttributeDrift,
} from './territory/territoryUtils';
import {
  checkRankPromotion,
  calculateMonthlyVirtue,
  calculateMonthlyLedger,
  getSubordinates,
  calculateSalary,
  getTributeRatio,
  getDirectControlPenalty,
} from './official/officialUtils';
import { useLedgerStore } from './official/LedgerStore';

/** 限制值在min~max之间 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 执行月结算。在 TurnManager.advanceMonth() 回调中调用。
 */
export function runMonthlySettlement(date: GameDate): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const aliveChars = charStore.getAliveCharacters();

  // ===== 1. 角色健康结算 =====
  for (const char of aliveChars) {
    const healthChange = calculateMonthlyHealthChange(char, date.year);
    const newHealth = clamp(char.health + healthChange, 0, 100);

    if (newHealth <= 0) {
      charStore.killCharacter(char.id, date.year);
      continue;
    }

    charStore.updateCharacter(char.id, { health: newHealth });
  }

  // ===== 2. 角色压力结算 =====
  // 重新获取存活角色（可能有死亡）
  const aliveAfterHealth = useCharacterStore.getState().getAliveCharacters();
  for (const char of aliveAfterHealth) {
    const stressChange = calculateMonthlyStressChange(char);
    let newStress = clamp(char.stress + stressChange, 0, 100);

    // 压力=50：获得忧虑特质
    if (newStress >= 50 && char.stress < 50 && !char.traitIds.includes('trait-anxious')) {
      charStore.addTrait(char.id, 'trait-anxious');
    }

    // 压力=100：精神崩溃
    if (newStress >= 100) {
      // 失去一个正面特质或获得负面特质
      const positiveTraits = char.traitIds.filter((t) =>
        ['trait-brave', 'trait-just', 'trait-social', 'trait-trusting', 'trait-content'].includes(t),
      );
      if (positiveTraits.length > 0) {
        const removeIdx = Math.floor(Math.random() * positiveTraits.length);
        charStore.removeTrait(char.id, positiveTraits[removeIdx]);
      } else if (!char.traitIds.includes('trait-anxious')) {
        charStore.addTrait(char.id, 'trait-anxious');
      }
      newStress = 50; // 重置
    }

    charStore.updateCharacter(char.id, { stress: newStress });
  }

  // ===== 3. 角色成长（正月时） =====
  if (date.month === 1) {
    const currentChars = useCharacterStore.getState().getAliveCharacters();
    for (const char of currentChars) {
      const age = date.year - char.birthYear;

      // 6岁：分配性格特质
      if (age === 6) {
        const newTraits = assignPersonalityTraits(char.traitIds);
        for (const tid of newTraits) {
          charStore.addTrait(char.id, tid);
        }
      }

      // 16岁：分配教育特质
      if (age === 16) {
        const effectiveAbilities = getEffectiveAbilities(char);
        const eduTraitId = assignEducationTrait(effectiveAbilities);
        charStore.addTrait(char.id, eduTraitId);
      }
    }
  }

  // ===== 4. 好感度衰减 =====
  const charsForDecay = useCharacterStore.getState().getAliveCharacters();
  for (const char of charsForDecay) {
    const decayed = decayOpinions(char);
    charStore.updateCharacter(char.id, { relationships: decayed.relationships });
  }

  // ===== 5. 领地属性漂移 =====
  const allZhou = terrStore.getAllZhou();
  for (const terr of allZhou) {
    const ruler = useCharacterStore.getState().getCharacter(terr.actualControllerId);
    const rulerTraitIds = ruler?.traitIds ?? [];
    const drift = calculateAttributeDrift(terr, rulerTraitIds);
    const patch = applyAttributeDrift(terr, drift);
    terrStore.updateTerritory(terr.id, patch);
  }

  // ===== 6. 领地产出 → 资源累加到控制人（含直辖超额打折） =====
  const updatedZhou = useTerritoryStore.getState().getAllZhou();
  // 预计算每个角色的直辖超额折扣
  const penaltyCache = new Map<string, number>();
  for (const terr of updatedZhou) {
    const rid = terr.actualControllerId;
    if (!penaltyCache.has(rid)) {
      const ruler = useCharacterStore.getState().getCharacter(rid);
      if (ruler) {
        penaltyCache.set(rid, getDirectControlPenalty(ruler, useTerritoryStore.getState().territories));
      }
    }
  }
  for (const terr of updatedZhou) {
    const ruler = useCharacterStore.getState().getCharacter(terr.actualControllerId);
    if (!ruler || !ruler.alive) continue;
    const abilities = getEffectiveAbilities(ruler);
    const income = calculateMonthlyIncome(terr, abilities);
    const penalty = penaltyCache.get(ruler.id) ?? 1;
    charStore.addResources(ruler.id, {
      money: Math.floor(income.money * penalty),
      grain: Math.floor(income.grain * penalty),
    });
  }

  // ===== 6.5 贤能积累与品位晋升 =====
  const charsForVirtue = useCharacterStore.getState().getAliveCharacters();
  for (const char of charsForVirtue) {
    if (!char.official) continue;
    const virtueGain = calculateMonthlyVirtue(char);
    if (virtueGain > 0) {
      charStore.addVirtue(char.id, virtueGain);
    }
    // 检查晋升
    const updatedChar = useCharacterStore.getState().getCharacter(char.id);
    if (updatedChar?.official) {
      const newRank = checkRankPromotion(updatedChar);
      if (newRank !== null) {
        charStore.setRank(char.id, newRank);
      }
    }
  }

  // ===== 6.6 经济循环（俸禄与上缴） =====
  const charsForEcon = useCharacterStore.getState().getAliveCharacters();
  const territories = useTerritoryStore.getState().territories;
  const characters = useCharacterStore.getState().characters;

  for (const char of charsForEcon) {
    if (!char.official) continue;

    const ledger = calculateMonthlyLedger(char, territories, characters);

    // 应用净收支（领地产出已在Phase 6加过，这里只加差额部分）
    // 差额 = positionSalary + vassalTribute - subordinateSalaries - overlordTribute
    const extraMoney = ledger.positionSalary.money + ledger.vassalTribute.money
      - ledger.subordinateSalaries.money - ledger.overlordTribute.money;
    const extraGrain = ledger.positionSalary.grain + ledger.vassalTribute.grain
      - ledger.subordinateSalaries.grain - ledger.overlordTribute.grain;

    if (extraMoney !== 0 || extraGrain !== 0) {
      charStore.addResources(char.id, {
        money: Math.floor(extraMoney),
        grain: Math.floor(extraGrain),
      });
    }

    // 缓存玩家的ledger供UI使用
    if (char.id === charStore.playerId) {
      useLedgerStore.getState().updatePlayerLedger(ledger);
    }
  }

  // ===== 6.7 破产检查 =====
  const charsForBankruptcy = useCharacterStore.getState().getAliveCharacters();
  for (const char of charsForBankruptcy) {
    if (!char.official) continue;
    if (char.resources.money < -500 || char.resources.grain < -500) {
      // 增加压力
      const newStress = clamp(char.stress + 10, 0, 100);
      charStore.updateCharacter(char.id, { stress: newStress });
      // 所有附庸好感度-5
      const subs = getSubordinates(char.id, useCharacterStore.getState().characters);
      for (const sub of subs) {
        charStore.addOpinion(sub.id, char.id, {
          reason: '财政困难',
          value: -5,
          decayable: true,
        });
      }
    }
  }

  // ===== 7. 建筑施工进度 =====
  const finalZhou = useTerritoryStore.getState().getAllZhou();
  for (const terr of finalZhou) {
    if (terr.constructions.length > 0) {
      terrStore.advanceConstructions(terr.id);
    }
  }

  // ===== 8. UI 刷新由 Zustand 自动触发 =====
}
