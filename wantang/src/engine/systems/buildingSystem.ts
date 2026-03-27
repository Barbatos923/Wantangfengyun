// ===== 建筑系统：施工进度推进 =====

import type { GameDate } from '@engine/types.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';

export function runBuildingSystem(_date: GameDate): void {
  const terrStore = useTerritoryStore.getState();
  const finalZhou = terrStore.getAllZhou();
  for (const terr of finalZhou) {
    if (terr.constructions.length > 0) {
      terrStore.advanceConstructions(terr.id);
    }
  }
}
