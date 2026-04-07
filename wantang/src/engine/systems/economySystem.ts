// ===== 经济系统：月度经济结算/破产检查（国库版） =====

import type { GameDate } from '@engine/types.ts';
import type { MonthlyLedger } from '@engine/official/types.ts';
import { useCharacterStore } from '@engine/character/CharacterStore.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';
import { useMilitaryStore } from '@engine/military/MilitaryStore.ts';
import { useLedgerStore } from '@engine/official/LedgerStore.ts';
import { calculateMonthlyLedger } from '@engine/official/economyCalc.ts';
import { clamp } from '@engine/utils.ts';

export function runEconomySystem(_date: GameDate): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const milStore = useMilitaryStore.getState();

  const aliveChars = charStore.getAliveCharacters();
  const { territories, centralPosts, controllerIndex } = terrStore;
  const characters = charStore.characters;
  const { armies, battalions, ownerArmyIndex } = milStore;

  // ── 构建 capitals 映射 ──
  const capitals = new Map<string, string>();
  for (const c of characters.values()) {
    if (c.alive && c.capital) capitals.set(c.id, c.capital);
  }

  // ── Phase 1：计算所有角色 ledger ──
  const ledgers: Array<{ id: string; ledger: MonthlyLedger }> = [];
  let playerLedger: MonthlyLedger | null = null;

  for (const char of aliveChars) {
    if (!char.official) continue;
    const ledger = calculateMonthlyLedger(
      char, territories, characters, centralPosts,
      armies, battalions, capitals, controllerIndex, ownerArmyIndex,
    );
    ledgers.push({ id: char.id, ledger });
    if (char.id === charStore.playerId) {
      playerLedger = ledger;
    }
  }

  // ── Phase 2：批量应用州国库变动 ──
  // 汇总所有角色的 treasuryChanges 到全局 Map
  const globalTreasuryChanges = new Map<string, { money: number; grain: number }>();
  for (const { ledger } of ledgers) {
    for (const [zhouId, delta] of ledger.treasuryChanges) {
      const existing = globalTreasuryChanges.get(zhouId) ?? { money: 0, grain: 0 };
      globalTreasuryChanges.set(zhouId, {
        money: existing.money + delta.money,
        grain: existing.grain + delta.grain,
      });
    }
  }

  if (globalTreasuryChanges.size > 0) {
    terrStore.batchMutateTreasury((terrs) => {
      const newTerrs = new Map(terrs);
      for (const [zhouId, delta] of globalTreasuryChanges) {
        const t = newTerrs.get(zhouId);
        if (!t || !t.treasury) continue;
        newTerrs.set(zhouId, {
          ...t,
          treasury: {
            money: t.treasury.money + Math.floor(delta.money),
            grain: t.treasury.grain + Math.floor(delta.grain),
          },
        });
      }
      return newTerrs;
    });
  }

  // ── Phase 3：批量应用角色私产变动（俸禄 + 无capital时的fallback收支） ──
  const privatePatches: Array<{ id: string; money: number; grain: number }> = [];
  for (const { id, ledger } of ledgers) {
    const money = Math.floor(ledger.privateChange.money);
    const grain = Math.floor(ledger.privateChange.grain);
    if (money !== 0 || grain !== 0) {
      privatePatches.push({ id, money, grain });
    }
  }

  if (privatePatches.length > 0) {
    charStore.batchMutate((chars) => {
      for (const p of privatePatches) {
        const c = chars.get(p.id);
        if (!c) continue;
        chars.set(p.id, {
          ...c,
          resources: {
            ...c.resources,
            money: c.resources.money + p.money,
            grain: c.resources.grain + p.grain,
          },
        });
      }
    });
  }

  // ── Phase 4：军费关隘阻断 → 扣相关军队士气 ──
  const blockedArmyIds: string[] = [];
  for (const { ledger } of ledgers) {
    for (const ms of ledger.militarySupply) {
      if (ms.blocked) blockedArmyIds.push(ms.armyId);
    }
  }
  if (blockedArmyIds.length > 0) {
    const currentArmies = useMilitaryStore.getState().armies;
    useMilitaryStore.getState().batchMutateBattalions((batMap) => {
      for (const armyId of blockedArmyIds) {
        const army = currentArmies.get(armyId);
        if (!army) continue;
        // 补给被切断：所有营士气 -10
        for (const batId of army.battalionIds) {
          const bat = batMap.get(batId);
          if (bat) {
            batMap.set(batId, { ...bat, morale: clamp(bat.morale - 10, 0, 100) });
          }
        }
      }
    });
  }

  // ── Phase 5：破产检查（总国库 < 0） ──
  if (playerLedger) {
    useLedgerStore.getState().updatePlayerLedger(playerLedger);
  }
  // 缓存所有角色 ledger，供 NPC 决策行为读取
  {
    const allLedgers = new Map<string, MonthlyLedger>();
    for (const { id, ledger } of ledgers) allLedgers.set(id, ledger);
    useLedgerStore.getState().setAllLedgers(allLedgers);
  }

  const charsForBankruptcy = useCharacterStore.getState().getAliveCharacters();
  const updatedTerritories = useTerritoryStore.getState().territories;
  const updatedControllerIndex = useTerritoryStore.getState().controllerIndex;
  const bankruptIds: string[] = [];

  for (const char of charsForBankruptcy) {
    if (!char.official) continue;
    // 总国库 = 所有控制州国库之和
    const terrIds = updatedControllerIndex.get(char.id);
    if (!terrIds || terrIds.size === 0) continue; // 无领地角色不破产
    let totalMoney = 0;
    let totalGrain = 0;
    for (const tid of terrIds) {
      const t = updatedTerritories.get(tid);
      if (t?.treasury) {
        totalMoney += t.treasury.money;
        totalGrain += t.treasury.grain;
      }
    }
    if (totalMoney < -50000 || totalGrain < -50000) {
      bankruptIds.push(char.id);
    }
  }

  if (bankruptIds.length > 0) {
    charStore.batchMutate((chars) => {
      for (const id of bankruptIds) {
        const char = chars.get(id);
        if (!char) continue;
        const newStress = clamp(char.stress + 10, 0, 100);
        chars.set(id, { ...char, stress: newStress });
        for (const c of chars.values()) {
          if (c.alive && c.overlordId === id) {
            const rels = [...c.relationships];
            const existing = rels.find((r) => r.targetId === id);
            if (existing) {
              existing.opinions = [...existing.opinions, { reason: '财政困难', value: -5, decayable: true }];
            } else {
              rels.push({ targetId: id, opinions: [{ reason: '财政困难', value: -5, decayable: true }] });
            }
            chars.set(c.id, { ...c, relationships: rels });
          }
        }
      }
    });
  }
}
