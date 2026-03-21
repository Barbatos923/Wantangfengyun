import { create } from 'zustand';
import type { Territory, Construction } from './types';

interface TerritoryStoreState {
  territories: Map<string, Territory>;

  // 初始化
  initTerritories: (terrs: Territory[]) => void;

  // 查询
  getTerritory: (id: string) => Territory | undefined;
  getTerritoriesByController: (controllerId: string) => Territory[];
  getAllZhou: () => Territory[];

  // 修改
  updateTerritory: (id: string, patch: Partial<Territory>) => void;
  startConstruction: (territoryId: string, construction: Construction) => void;
  advanceConstructions: (territoryId: string) => void;
}

export const useTerritoryStore = create<TerritoryStoreState>((set, get) => ({
  territories: new Map(),

  initTerritories: (terrs) => {
    const map = new Map<string, Territory>();
    for (const t of terrs) {
      map.set(t.id, t);
    }
    set({ territories: map });
  },

  getTerritory: (id) => get().territories.get(id),

  getTerritoriesByController: (controllerId) => {
    const result: Territory[] = [];
    get().territories.forEach((t) => {
      if (t.actualControllerId === controllerId) result.push(t);
    });
    return result;
  },

  getAllZhou: () => {
    const result: Territory[] = [];
    get().territories.forEach((t) => {
      if (t.tier === 'zhou') result.push(t);
    });
    return result;
  },

  updateTerritory: (id, patch) => {
    set((state) => {
      const terrs = new Map(state.territories);
      const existing = terrs.get(id);
      if (!existing) return state;
      terrs.set(id, { ...existing, ...patch });
      return { territories: terrs };
    });
  },

  startConstruction: (territoryId, construction) => {
    set((state) => {
      const terrs = new Map(state.territories);
      const t = terrs.get(territoryId);
      if (!t) return state;
      terrs.set(territoryId, {
        ...t,
        constructions: [...t.constructions, construction],
      });
      return { territories: terrs };
    });
  },

  advanceConstructions: (territoryId) => {
    set((state) => {
      const terrs = new Map(state.territories);
      const t = terrs.get(territoryId);
      if (!t) return state;

      const remaining: Construction[] = [];
      const buildings = [...t.buildings];

      for (const c of t.constructions) {
        const newRemaining = c.remainingMonths - 1;
        if (newRemaining <= 0) {
          // 建造完成
          buildings[c.slotIndex] = {
            buildingId: c.buildingId,
            level: c.targetLevel,
          };
        } else {
          remaining.push({ ...c, remainingMonths: newRemaining });
        }
      }

      terrs.set(territoryId, { ...t, buildings, constructions: remaining });
      return { territories: terrs };
    });
  },
}));
