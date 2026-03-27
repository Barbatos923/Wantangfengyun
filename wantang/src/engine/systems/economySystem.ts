// ===== 经济系统：月度经济结算/破产检查 =====

import type { GameDate } from '@engine/types.ts';
import { useCharacterStore } from '@engine/character/CharacterStore.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';
import { useLedgerStore } from '@engine/official/LedgerStore.ts';
import { calculateMonthlyLedger } from '@engine/official/officialUtils.ts';
import { clamp } from '@engine/utils.ts';

export function runEconomySystem(_date: GameDate): void {
  const charStore = useCharacterStore.getState();

  // ===== 统一经济结算 =====
  const updatedCharsForEcon = useCharacterStore.getState().getAliveCharacters();
  const territories = useTerritoryStore.getState().territories;
  const characters = useCharacterStore.getState().characters;

  // 先计算所有 ledger，再批量应用资源变化
  const resourcePatches: Array<{ id: string; money: number; grain: number }> = [];
  let playerLedger: ReturnType<typeof calculateMonthlyLedger> | null = null;

  for (const char of updatedCharsForEcon) {
    if (!char.official) continue;
    const ledger = calculateMonthlyLedger(char, territories, characters);
    if (ledger.net.money !== 0 || ledger.net.grain !== 0) {
      resourcePatches.push({
        id: char.id,
        money: Math.floor(ledger.net.money),
        grain: Math.floor(ledger.net.grain),
      });
    }
    if (char.id === charStore.playerId) {
      playerLedger = ledger;
    }
  }

  if (resourcePatches.length > 0) {
    charStore.batchMutate((chars) => {
      for (const p of resourcePatches) {
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

  if (playerLedger) {
    useLedgerStore.getState().updatePlayerLedger(playerLedger);
  }

  // ===== 破产检查（批量） =====
  const charsForBankruptcy = useCharacterStore.getState().getAliveCharacters();
  const bankruptIds: string[] = [];
  for (const char of charsForBankruptcy) {
    if (!char.official) continue;
    if (char.resources.money < -50000 || char.resources.grain < -50000) {
      bankruptIds.push(char.id);
    }
  }

  if (bankruptIds.length > 0) {
    charStore.batchMutate((chars) => {
      for (const id of bankruptIds) {
        const char = chars.get(id);
        if (!char) continue;
        // 增加压力
        const newStress = clamp(char.stress + 10, 0, 100);
        chars.set(id, { ...char, stress: newStress });
        // 所有附庸好感度-5
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
