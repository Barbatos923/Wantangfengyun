// ===== 人口系统：年度户数自然变化 =====

import type { GameDate } from '@engine/types.ts';
import { useTerritoryStore } from '@engine/territory/TerritoryStore.ts';

export function runPopulationSystem(date: GameDate): void {
  if (date.month !== 1) return;

  const terrStore = useTerritoryStore.getState();
  const zhouForPop = terrStore.getAllZhou();
  for (const terr of zhouForPop) {
    const p = terr.populace; // 0-100
    let annualRate: number;
    if (p <= 50) {
      // 0 → -1%, 50 → 0%  (线性)
      annualRate = (p - 50) / 50 * 0.01;
    } else if (p <= 80) {
      // 50 → 0%, 80 → 0.1%  (线性)
      annualRate = (p - 50) / 30 * 0.001;
    } else {
      // 80 → 0.1%, 100 → 0.5%  (线性)
      annualRate = 0.001 + (p - 80) / 20 * 0.004;
    }
    const delta = Math.round(terr.basePopulation * annualRate);
    if (delta !== 0) {
      terrStore.updateTerritory(terr.id, {
        basePopulation: Math.max(0, terr.basePopulation + delta),
      });
    }
  }
}
