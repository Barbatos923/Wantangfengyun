// ===== 军事 Store =====

import { create } from 'zustand';
import type { Battalion, Army, UnitType } from './types';
import { MAX_BATTALION_STRENGTH } from './types';

interface MilitaryState {
  battalions: Map<string, Battalion>;
  armies: Map<string, Army>;

  // 索引
  armyBattalionIndex: Map<string, Set<string>>;  // armyId -> battalionIds
  ownerArmyIndex: Map<string, Set<string>>;       // ownerId -> armyIds
  locationArmyIndex: Map<string, Set<string>>;    // territoryId -> armyIds

  // 初始化
  initMilitary: (armies: Army[], battalions: Battalion[]) => void;

  // 查询
  getArmy: (id: string) => Army | undefined;
  getBattalion: (id: string) => Battalion | undefined;
  getArmiesByOwner: (ownerId: string) => Army[];
  getArmiesAtLocation: (territoryId: string) => Army[];
  getBattalionsByArmy: (armyId: string) => Battalion[];

  // 创建
  createArmy: (name: string, ownerId: string, locationId: string, commanderId?: string) => Army;
  recruitBattalion: (armyId: string, territoryId: string, unitType: UnitType, name: string) => Battalion;

  // 解散
  disbandBattalion: (battalionId: string) => void;
  disbandArmy: (armyId: string) => void;

  // 编组
  transferBattalion: (battalionId: string, targetArmyId: string) => void;
  mergeBattalions: (battalionIds: string[]) => Battalion | undefined;

  // 更新
  updateBattalion: (id: string, patch: Partial<Battalion>) => void;
  updateArmy: (id: string, patch: Partial<Army>) => void;
  batchMutateBattalions: (mutator: (battalions: Map<string, Battalion>) => void) => void;

  // 领地易手时转移驻军
  transferArmiesAtTerritory: (territoryId: string, newOwnerId: string) => void;
}

export const useMilitaryStore = create<MilitaryState>((set, get) => ({
  battalions: new Map(),
  armies: new Map(),
  armyBattalionIndex: new Map(),
  ownerArmyIndex: new Map(),
  locationArmyIndex: new Map(),

  initMilitary: (armies, battalions) => {
    const armyMap = new Map<string, Army>();
    const battalionMap = new Map<string, Battalion>();
    const armyBattalionIndex = new Map<string, Set<string>>();
    const ownerArmyIndex = new Map<string, Set<string>>();
    const locationArmyIndex = new Map<string, Set<string>>();

    for (const army of armies) {
      armyMap.set(army.id, army);

      if (!armyBattalionIndex.has(army.id)) {
        armyBattalionIndex.set(army.id, new Set<string>());
      }

      let ownerSet = ownerArmyIndex.get(army.ownerId);
      if (!ownerSet) {
        ownerSet = new Set<string>();
        ownerArmyIndex.set(army.ownerId, ownerSet);
      }
      ownerSet.add(army.id);

      let locationSet = locationArmyIndex.get(army.locationId);
      if (!locationSet) {
        locationSet = new Set<string>();
        locationArmyIndex.set(army.locationId, locationSet);
      }
      locationSet.add(army.id);
    }

    for (const battalion of battalions) {
      battalionMap.set(battalion.id, battalion);

      let battalionSet = armyBattalionIndex.get(battalion.armyId);
      if (!battalionSet) {
        battalionSet = new Set<string>();
        armyBattalionIndex.set(battalion.armyId, battalionSet);
      }
      battalionSet.add(battalion.id);
    }

    set({ armies: armyMap, battalions: battalionMap, armyBattalionIndex, ownerArmyIndex, locationArmyIndex });
  },

  getArmy: (id) => get().armies.get(id),

  getBattalion: (id) => get().battalions.get(id),

  getArmiesByOwner: (ownerId) => {
    const { ownerArmyIndex, armies } = get();
    const armyIds = ownerArmyIndex.get(ownerId);
    if (!armyIds) return [];
    const result: Army[] = [];
    for (const armyId of armyIds) {
      const army = armies.get(armyId);
      if (army) result.push(army);
    }
    return result;
  },

  getArmiesAtLocation: (territoryId) => {
    const { locationArmyIndex, armies } = get();
    const armyIds = locationArmyIndex.get(territoryId);
    if (!armyIds) return [];
    const result: Army[] = [];
    for (const armyId of armyIds) {
      const army = armies.get(armyId);
      if (army) result.push(army);
    }
    return result;
  },

  getBattalionsByArmy: (armyId) => {
    const { armyBattalionIndex, battalions } = get();
    const battalionIds = armyBattalionIndex.get(armyId);
    if (!battalionIds) return [];
    const result: Battalion[] = [];
    for (const battalionId of battalionIds) {
      const battalion = battalions.get(battalionId);
      if (battalion) result.push(battalion);
    }
    return result;
  },

  createArmy: (name, ownerId, locationId, commanderId) => {
    const id = `army-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const army: Army = {
      id,
      name,
      ownerId,
      locationId,
      commanderId: commanderId ?? null,
      battalionIds: [],
    };

    set((state) => {
      const armies = new Map(state.armies);
      armies.set(id, army);

      const armyBattalionIndex = new Map(state.armyBattalionIndex);
      armyBattalionIndex.set(id, new Set<string>());

      const ownerArmyIndex = new Map(state.ownerArmyIndex);
      const ownerSet = ownerArmyIndex.get(ownerId);
      if (ownerSet) {
        ownerArmyIndex.set(ownerId, new Set([...ownerSet, id]));
      } else {
        ownerArmyIndex.set(ownerId, new Set([id]));
      }

      const locationArmyIndex = new Map(state.locationArmyIndex);
      const locationSet = locationArmyIndex.get(locationId);
      if (locationSet) {
        locationArmyIndex.set(locationId, new Set([...locationSet, id]));
      } else {
        locationArmyIndex.set(locationId, new Set([id]));
      }

      return { armies, armyBattalionIndex, ownerArmyIndex, locationArmyIndex };
    });

    return army;
  },

  recruitBattalion: (armyId, territoryId, unitType, name) => {
    const id = `battalion-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const battalion: Battalion = {
      id,
      name,
      armyId,
      unitType,
      currentStrength: MAX_BATTALION_STRENGTH,
      homeTerritory: territoryId,
      locationId: territoryId,
      morale: 50,
      elite: 0,
    };

    set((state) => {
      const battalions = new Map(state.battalions);
      battalions.set(id, battalion);

      const armies = new Map(state.armies);
      const army = armies.get(armyId);
      if (army) {
        armies.set(armyId, { ...army, battalionIds: [...army.battalionIds, id] });
      }

      const armyBattalionIndex = new Map(state.armyBattalionIndex);
      const existingSet = armyBattalionIndex.get(armyId);
      if (existingSet) {
        armyBattalionIndex.set(armyId, new Set([...existingSet, id]));
      } else {
        armyBattalionIndex.set(armyId, new Set([id]));
      }

      return { battalions, armies, armyBattalionIndex };
    });

    return battalion;
  },

  disbandBattalion: (battalionId) => {
    set((state) => {
      const battalion = state.battalions.get(battalionId);
      if (!battalion) return state;

      const battalions = new Map(state.battalions);
      battalions.delete(battalionId);

      const armies = new Map(state.armies);
      const army = armies.get(battalion.armyId);
      if (army) {
        armies.set(battalion.armyId, {
          ...army,
          battalionIds: army.battalionIds.filter((bid) => bid !== battalionId),
        });
      }

      const armyBattalionIndex = new Map(state.armyBattalionIndex);
      const battalionSet = armyBattalionIndex.get(battalion.armyId);
      if (battalionSet) {
        const newSet = new Set(battalionSet);
        newSet.delete(battalionId);
        armyBattalionIndex.set(battalion.armyId, newSet);
      }

      return { battalions, armies, armyBattalionIndex };
    });
  },

  disbandArmy: (armyId) => {
    set((state) => {
      const army = state.armies.get(armyId);
      if (!army) return state;

      const battalions = new Map(state.battalions);
      const battalionSet = state.armyBattalionIndex.get(armyId);
      if (battalionSet) {
        for (const battalionId of battalionSet) {
          battalions.delete(battalionId);
        }
      }

      const armies = new Map(state.armies);
      armies.delete(armyId);

      const armyBattalionIndex = new Map(state.armyBattalionIndex);
      armyBattalionIndex.delete(armyId);

      const ownerArmyIndex = new Map(state.ownerArmyIndex);
      const ownerSet = ownerArmyIndex.get(army.ownerId);
      if (ownerSet) {
        const newSet = new Set(ownerSet);
        newSet.delete(armyId);
        ownerArmyIndex.set(army.ownerId, newSet);
      }

      const locationArmyIndex = new Map(state.locationArmyIndex);
      const locationSet = locationArmyIndex.get(army.locationId);
      if (locationSet) {
        const newSet = new Set(locationSet);
        newSet.delete(armyId);
        locationArmyIndex.set(army.locationId, newSet);
      }

      return { battalions, armies, armyBattalionIndex, ownerArmyIndex, locationArmyIndex };
    });
  },

  transferBattalion: (battalionId, targetArmyId) => {
    set((state) => {
      const battalion = state.battalions.get(battalionId);
      if (!battalion) return state;
      const sourceArmyId = battalion.armyId;
      if (sourceArmyId === targetArmyId) return state;

      const battalions = new Map(state.battalions);
      battalions.set(battalionId, { ...battalion, armyId: targetArmyId });

      const armies = new Map(state.armies);
      const sourceArmy = armies.get(sourceArmyId);
      if (sourceArmy) {
        armies.set(sourceArmyId, {
          ...sourceArmy,
          battalionIds: sourceArmy.battalionIds.filter((bid) => bid !== battalionId),
        });
      }
      const targetArmy = armies.get(targetArmyId);
      if (targetArmy) {
        armies.set(targetArmyId, {
          ...targetArmy,
          battalionIds: [...targetArmy.battalionIds, battalionId],
        });
      }

      const armyBattalionIndex = new Map(state.armyBattalionIndex);
      const sourceSet = armyBattalionIndex.get(sourceArmyId);
      if (sourceSet) {
        const newSet = new Set(sourceSet);
        newSet.delete(battalionId);
        armyBattalionIndex.set(sourceArmyId, newSet);
      }
      const targetSet = armyBattalionIndex.get(targetArmyId);
      if (targetSet) {
        armyBattalionIndex.set(targetArmyId, new Set([...targetSet, battalionId]));
      } else {
        armyBattalionIndex.set(targetArmyId, new Set([battalionId]));
      }

      return { battalions, armies, armyBattalionIndex };
    });
  },

  mergeBattalions: (battalionIds) => {
    if (battalionIds.length < 2) return undefined;

    const state = get();
    const first = state.battalions.get(battalionIds[0]);
    if (!first) return undefined;

    // 收集所有待合并的营，要求同兵种
    const toMerge: Battalion[] = [];
    for (const bid of battalionIds) {
      const b = state.battalions.get(bid);
      if (!b || b.unitType !== first.unitType) return undefined;
      toMerge.push(b);
    }

    // 计算合并后属性
    let totalStrength = 0;
    let weightedMorale = 0;
    let weightedElite = 0;
    for (const b of toMerge) {
      totalStrength += b.currentStrength;
      weightedMorale += b.morale * b.currentStrength;
      weightedElite += b.elite * b.currentStrength;
    }
    const clampedStrength = Math.min(totalStrength, MAX_BATTALION_STRENGTH);
    const avgMorale = totalStrength > 0 ? Math.round(weightedMorale / totalStrength) : first.morale;
    const avgElite = totalStrength > 0 ? Math.round(weightedElite / totalStrength) : first.elite;

    const merged: Battalion = {
      ...first,
      currentStrength: clampedStrength,
      morale: avgMorale,
      elite: avgElite,
    };

    set((state) => {
      const battalions = new Map(state.battalions);
      const armies = new Map(state.armies);
      const armyBattalionIndex = new Map(state.armyBattalionIndex);

      // 保留第一个营（更新属性），删除其余营
      battalions.set(merged.id, merged);
      for (let i = 1; i < battalionIds.length; i++) {
        const bid = battalionIds[i];
        const b = battalions.get(bid);
        if (!b) continue;
        battalions.delete(bid);

        // 更新所属 army 的 battalionIds
        const army = armies.get(b.armyId);
        if (army) {
          armies.set(b.armyId, {
            ...army,
            battalionIds: army.battalionIds.filter((id) => id !== bid),
          });
        }

        // 更新索引
        const bSet = armyBattalionIndex.get(b.armyId);
        if (bSet) {
          const newSet = new Set(bSet);
          newSet.delete(bid);
          armyBattalionIndex.set(b.armyId, newSet);
        }
      }

      return { battalions, armies, armyBattalionIndex };
    });

    return merged;
  },

  updateBattalion: (id, patch) => {
    set((state) => {
      const existing = state.battalions.get(id);
      if (!existing) return state;
      const battalions = new Map(state.battalions);
      battalions.set(id, { ...existing, ...patch });

      // 如果 armyId 发生变化，更新索引
      let armies = state.armies;
      let armyBattalionIndex = state.armyBattalionIndex;
      if (patch.armyId !== undefined && patch.armyId !== existing.armyId) {
        armies = new Map(armies);
        armyBattalionIndex = new Map(armyBattalionIndex);

        const sourceArmy = armies.get(existing.armyId);
        if (sourceArmy) {
          armies.set(existing.armyId, {
            ...sourceArmy,
            battalionIds: sourceArmy.battalionIds.filter((bid) => bid !== id),
          });
        }
        const sourceSet = armyBattalionIndex.get(existing.armyId);
        if (sourceSet) {
          const newSet = new Set(sourceSet);
          newSet.delete(id);
          armyBattalionIndex.set(existing.armyId, newSet);
        }

        const targetArmy = armies.get(patch.armyId);
        if (targetArmy) {
          armies.set(patch.armyId, {
            ...targetArmy,
            battalionIds: [...targetArmy.battalionIds, id],
          });
        }
        const targetSet = armyBattalionIndex.get(patch.armyId);
        if (targetSet) {
          armyBattalionIndex.set(patch.armyId, new Set([...targetSet, id]));
        } else {
          armyBattalionIndex.set(patch.armyId, new Set([id]));
        }
      }

      return { battalions, armies, armyBattalionIndex };
    });
  },

  updateArmy: (id, patch) => {
    set((state) => {
      const existing = state.armies.get(id);
      if (!existing) return state;
      const armies = new Map(state.armies);
      armies.set(id, { ...existing, ...patch });

      let ownerArmyIndex = state.ownerArmyIndex;
      let locationArmyIndex = state.locationArmyIndex;

      // 如果 ownerId 发生变化，更新 ownerArmyIndex
      if (patch.ownerId !== undefined && patch.ownerId !== existing.ownerId) {
        ownerArmyIndex = new Map(ownerArmyIndex);
        const oldOwnerSet = ownerArmyIndex.get(existing.ownerId);
        if (oldOwnerSet) {
          const newSet = new Set(oldOwnerSet);
          newSet.delete(id);
          ownerArmyIndex.set(existing.ownerId, newSet);
        }
        const newOwnerSet = ownerArmyIndex.get(patch.ownerId);
        if (newOwnerSet) {
          ownerArmyIndex.set(patch.ownerId, new Set([...newOwnerSet, id]));
        } else {
          ownerArmyIndex.set(patch.ownerId, new Set([id]));
        }
      }

      // 如果 locationId 发生变化，更新 locationArmyIndex
      if (patch.locationId !== undefined && patch.locationId !== existing.locationId) {
        locationArmyIndex = new Map(locationArmyIndex);
        const oldLocationSet = locationArmyIndex.get(existing.locationId);
        if (oldLocationSet) {
          const newSet = new Set(oldLocationSet);
          newSet.delete(id);
          locationArmyIndex.set(existing.locationId, newSet);
        }
        const newLocationSet = locationArmyIndex.get(patch.locationId);
        if (newLocationSet) {
          locationArmyIndex.set(patch.locationId, new Set([...newLocationSet, id]));
        } else {
          locationArmyIndex.set(patch.locationId, new Set([id]));
        }
      }

      return { armies, ownerArmyIndex, locationArmyIndex };
    });
  },

  batchMutateBattalions: (mutator) => {
    set((state) => {
      const battalions = new Map(state.battalions);
      mutator(battalions);

      // 重建 armyBattalionIndex（O(n)，只执行一次）
      const armyBattalionIndex = new Map<string, Set<string>>();
      for (const battalion of battalions.values()) {
        let bSet = armyBattalionIndex.get(battalion.armyId);
        if (!bSet) {
          bSet = new Set<string>();
          armyBattalionIndex.set(battalion.armyId, bSet);
        }
        bSet.add(battalion.id);
      }

      return { battalions, armyBattalionIndex };
    });
  },

  transferArmiesAtTerritory: (territoryId, newOwnerId) => {
    set((state) => {
      const armies = new Map(state.armies);
      const ownerArmyIndex = new Map(state.ownerArmyIndex);
      let changed = false;

      for (const army of armies.values()) {
        if (army.locationId === territoryId && army.ownerId !== newOwnerId) {
          const oldOwnerId = army.ownerId;
          armies.set(army.id, { ...army, ownerId: newOwnerId, commanderId: null });
          changed = true;

          // 从旧 owner 索引移除
          const oldSet = ownerArmyIndex.get(oldOwnerId);
          if (oldSet) {
            const newSet = new Set(oldSet);
            newSet.delete(army.id);
            ownerArmyIndex.set(oldOwnerId, newSet);
          }

          // 加入新 owner 索引
          const newSet = ownerArmyIndex.get(newOwnerId);
          if (newSet) {
            ownerArmyIndex.set(newOwnerId, new Set([...newSet, army.id]));
          } else {
            ownerArmyIndex.set(newOwnerId, new Set([army.id]));
          }
        }
      }

      return changed ? { armies, ownerArmyIndex } : state;
    });
  },
}));
