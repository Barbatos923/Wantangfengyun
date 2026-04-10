import { create } from 'zustand';
import type { Character, OpinionEntry } from './types';
import type { OfficialData } from '../official/types';
import { isCivilByAbilities } from '../official/officialUtils';
import { resolveCapital } from '@engine/territory/treasuryUtils';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { resolveLocation } from './locationUtils';
import { useWarStore } from '@engine/military/WarStore';

interface CharacterStoreState {
  characters: Map<string, Character>;
  playerId: string | null;
  vassalIndex: Map<string, Set<string>>;   // overlordId → Set<vassalId>
  aliveSet: Set<string>;                    // 存活角色ID集合
  locationIndex: Map<string, Set<string>>; // territoryId → Set<charId> — 谁在哪个州

  // 初始化
  initCharacters: (chars: Character[]) => void;
  setPlayerId: (id: string | null) => void;

  // 查询
  getCharacter: (id: string) => Character | undefined;
  getPlayer: () => Character | undefined;
  getAliveCharacters: () => Character[];
  getVassalsByOverlord: (charId: string) => Character[];

  // 修改
  updateCharacter: (id: string, patch: Partial<Character>) => void;
  addTrait: (charId: string, traitId: string) => void;
  removeTrait: (charId: string, traitId: string) => void;
  addResources: (charId: string, resources: Partial<Character['resources']>) => void;
  addOpinion: (charId: string, targetId: string, entry: OpinionEntry) => void;
  setOpinion: (charId: string, targetId: string, entry: OpinionEntry) => void;
  killCharacter: (id: string, deathYear: number) => void;

  // 批量更新（结算专用，避免逐个 updateCharacter 的 O(n²) Map 拷贝）
  batchMutate: (mutator: (chars: Map<string, Character>) => void) => void;

  // Phase 2: 官职系统（精简版）
  setOfficialData: (charId: string, data: OfficialData) => void;
  addVirtue: (charId: string, amount: number) => void;
  setRank: (charId: string, level: number) => void;

  // 刷新 isRuler（从岗位推导）
  refreshIsRuler: (rulerIds: Set<string>) => void;

  // 治所
  setCapital: (charId: string, zhouId: string) => void;
  refreshCapital: (charId: string) => void;

  // 所在地
  setLocation: (charId: string, locationId: string | undefined) => void;
  refreshLocation: (charId: string) => void;
  getCharactersAtLocation: (territoryId: string) => Character[];
}

export const useCharacterStore = create<CharacterStoreState>((set, get) => ({
  characters: new Map(),
  playerId: null,
  vassalIndex: new Map(),
  aliveSet: new Set(),
  locationIndex: new Map(),

  initCharacters: (chars) => {
    const map = new Map<string, Character>();
    const vassalIndex = new Map<string, Set<string>>();
    const aliveSet = new Set<string>();
    const locationIndex = new Map<string, Set<string>>();
    for (const c of chars) {
      map.set(c.id, c);
      if (c.alive) {
        aliveSet.add(c.id);
      }
      if (c.overlordId !== undefined) {
        let vassalSet = vassalIndex.get(c.overlordId);
        if (!vassalSet) {
          vassalSet = new Set<string>();
          vassalIndex.set(c.overlordId, vassalSet);
        }
        vassalSet.add(c.id);
      }
      if (c.locationId) {
        let locSet = locationIndex.get(c.locationId);
        if (!locSet) {
          locSet = new Set<string>();
          locationIndex.set(c.locationId, locSet);
        }
        locSet.add(c.id);
      }
    }
    set({ characters: map, vassalIndex, aliveSet, locationIndex });
  },

  setPlayerId: (id) => set({ playerId: id }),

  getCharacter: (id) => get().characters.get(id),

  getPlayer: () => {
    const { playerId, characters } = get();
    return playerId ? characters.get(playerId) : undefined;
  },

  getAliveCharacters: () => {
    const { aliveSet, characters } = get();
    const chars: Character[] = [];
    for (const id of aliveSet) {
      const c = characters.get(id);
      if (c) chars.push(c);
    }
    return chars;
  },

  getVassalsByOverlord: (charId) => {
    const { vassalIndex, characters } = get();
    const vassalSet = vassalIndex.get(charId);
    if (!vassalSet) return [];
    const result: Character[] = [];
    for (const vassalId of vassalSet) {
      const c = characters.get(vassalId);
      if (c) result.push(c);
    }
    return result;
  },

  updateCharacter: (id, patch) => {
    set((state) => {
      const chars = new Map(state.characters);
      const existing = chars.get(id);
      if (!existing) return state;

      // overlordId 变动时重置 centralization（除非 caller 显式设置了）
      let effectivePatch = patch;
      if (patch.overlordId !== undefined && patch.overlordId !== existing.overlordId && !('centralization' in patch)) {
        effectivePatch = { ...patch, centralization: undefined };
      }
      chars.set(id, { ...existing, ...effectivePatch });

      // DEBUG: 检测自我领主
      if (patch.overlordId !== undefined && patch.overlordId === id) {
        console.error(`[BUG] 自我领主！${existing.name}(${id}) overlordId 被设为自己`, new Error().stack);
      }

      // 追踪 overlordId 变化（仅 isRuler 角色）
      if (patch.overlordId !== undefined && patch.overlordId !== existing.overlordId && existing.isRuler) {
        const oldOverlord = existing.overlordId ? chars.get(existing.overlordId)?.name ?? existing.overlordId : '无';
        const newOverlord = patch.overlordId ? chars.get(patch.overlordId)?.name ?? patch.overlordId : '无';
        console.log(`[overlord变更] ${existing.name}(${id.slice(0,8)}) overlord: ${oldOverlord} → ${newOverlord}`, new Error().stack?.split('\n').slice(1, 4).join(' ← '));
      }

      // 维护 vassalIndex
      let vassalIndex = state.vassalIndex;
      if (patch.overlordId !== undefined && patch.overlordId !== existing.overlordId) {
        vassalIndex = new Map(vassalIndex);
        // 从旧 overlordId 的 Set 中移除
        if (existing.overlordId !== undefined) {
          const oldSet = vassalIndex.get(existing.overlordId);
          if (oldSet) {
            const newSet = new Set(oldSet);
            newSet.delete(id);
            vassalIndex.set(existing.overlordId, newSet);
          }
        }
        // 添加到新 overlordId 的 Set 中
        if (patch.overlordId !== undefined) {
          const newOverlordSet = vassalIndex.get(patch.overlordId);
          if (newOverlordSet) {
            const newSet = new Set(newOverlordSet);
            newSet.add(id);
            vassalIndex.set(patch.overlordId, newSet);
          } else {
            vassalIndex.set(patch.overlordId, new Set([id]));
          }
        }
      }

      // 维护 aliveSet
      let aliveSet = state.aliveSet;
      if (patch.alive !== undefined && patch.alive !== existing.alive) {
        aliveSet = new Set(aliveSet);
        if (patch.alive === true) {
          aliveSet.add(id);
        } else {
          aliveSet.delete(id);
        }
      }

      // 维护 locationIndex（'locationId' in patch 区分"未传"和"显式设 undefined"）
      let locationIndex = state.locationIndex;
      if ('locationId' in patch && patch.locationId !== existing.locationId) {
        locationIndex = new Map(locationIndex);
        if (existing.locationId) {
          const oldSet = locationIndex.get(existing.locationId);
          if (oldSet) {
            const ns = new Set(oldSet);
            ns.delete(id);
            if (ns.size === 0) locationIndex.delete(existing.locationId);
            else locationIndex.set(existing.locationId, ns);
          }
        }
        if (patch.locationId) {
          const s = locationIndex.get(patch.locationId);
          if (s) {
            const ns = new Set(s);
            ns.add(id);
            locationIndex.set(patch.locationId, ns);
          } else {
            locationIndex.set(patch.locationId, new Set([id]));
          }
        }
      }

      return { characters: chars, vassalIndex, aliveSet, locationIndex };
    });
  },

  addTrait: (charId, traitId) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c || c.traitIds.includes(traitId)) return state;
      chars.set(charId, { ...c, traitIds: [...c.traitIds, traitId] });
      return { characters: chars };
    });
  },

  removeTrait: (charId, traitId) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c) return state;
      chars.set(charId, { ...c, traitIds: c.traitIds.filter((t) => t !== traitId) });
      return { characters: chars };
    });
  },

  addResources: (charId, resources) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c) return state;
      const newRes = { ...c.resources };
      if (resources.money != null) newRes.money += resources.money;
      if (resources.grain != null) newRes.grain += resources.grain;
      if (resources.prestige != null) newRes.prestige += resources.prestige;
      if (resources.legitimacy != null) newRes.legitimacy += resources.legitimacy;
      chars.set(charId, { ...c, resources: newRes });
      return { characters: chars };
    });
  },

  addOpinion: (charId, targetId, entry) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c) return state;
      const rels = [...c.relationships];
      const existing = rels.find((r) => r.targetId === targetId);
      if (existing) {
        existing.opinions = [...existing.opinions, entry];
      } else {
        rels.push({ targetId, opinions: [entry] });
      }
      chars.set(charId, { ...c, relationships: rels });
      return { characters: chars };
    });
  },

  // 按 reason 替换已有条目（用于状态型好感如集权/回拨），value=0 时移除
  setOpinion: (charId, targetId, entry) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c) return state;
      const rels = [...c.relationships];
      const existing = rels.find((r) => r.targetId === targetId);
      if (existing) {
        const filtered = existing.opinions.filter((op) => op.reason !== entry.reason);
        if (entry.value !== 0) filtered.push(entry);
        existing.opinions = filtered;
      } else if (entry.value !== 0) {
        rels.push({ targetId, opinions: [entry] });
      }
      chars.set(charId, { ...c, relationships: rels });
      return { characters: chars };
    });
  },

  killCharacter: (id, deathYear) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(id);
      if (!c) return state;
      chars.set(id, { ...c, alive: false, deathYear });

      // 从 aliveSet 中移除
      const aliveSet = new Set(state.aliveSet);
      aliveSet.delete(id);

      // 从 vassalIndex 中移除（如有 overlordId）
      let vassalIndex = state.vassalIndex;
      if (c.overlordId !== undefined) {
        const oldSet = vassalIndex.get(c.overlordId);
        if (oldSet) {
          vassalIndex = new Map(vassalIndex);
          const newSet = new Set(oldSet);
          newSet.delete(id);
          vassalIndex.set(c.overlordId, newSet);
        }
      }

      // 从 locationIndex 中移除
      let locationIndex = state.locationIndex;
      if (c.locationId) {
        const locSet = locationIndex.get(c.locationId);
        if (locSet) {
          locationIndex = new Map(locationIndex);
          const ns = new Set(locSet);
          ns.delete(id);
          if (ns.size === 0) locationIndex.delete(c.locationId);
          else locationIndex.set(c.locationId, ns);
        }
      }

      return { characters: chars, aliveSet, vassalIndex, locationIndex };
    });
  },

  // 批量更新：创建一次新 Map，交给 mutator 就地修改，完成后重建索引
  batchMutate: (mutator) => {
    set((state) => {
      const chars = new Map(state.characters);
      const oldOverlords = new Map<string, string | undefined>();
      for (const [id, c] of chars) {
        if (c.alive) oldOverlords.set(id, c.overlordId);
      }
      mutator(chars);

      // overlordId 变动时重置 centralization + DEBUG 追踪
      for (const [id, oldOv] of oldOverlords) {
        const c = chars.get(id);
        if (!c) continue;
        if (c.overlordId !== oldOv) {
          // 重置 centralization
          if (c.centralization !== undefined) {
            chars.set(id, { ...c, centralization: undefined });
          }
          // DEBUG 日志（仅 isRuler）
          if (c.isRuler) {
            const oldName = oldOv ? (chars.get(oldOv)?.name ?? oldOv) : '无';
            const newName = c.overlordId ? (chars.get(c.overlordId)?.name ?? c.overlordId) : '无';
            console.log(`[overlord变更/batch] ${c.name}(${id.slice(0,8)}) overlord: ${oldName} → ${newName}`);
          }
        }
      }

      // DEBUG: 检测自我领主
      for (const c of chars.values()) {
        if (c.overlordId === c.id) {
          console.error(`[BUG] batchMutate 自我领主！${c.name}(${c.id})`, new Error().stack);
        }
      }

      // 重建 aliveSet、vassalIndex、locationIndex（O(n)，但只执行一次）
      const aliveSet = new Set<string>();
      const vassalIndex = new Map<string, Set<string>>();
      const locationIndex = new Map<string, Set<string>>();
      for (const c of chars.values()) {
        if (c.alive) aliveSet.add(c.id);
        if (c.overlordId !== undefined) {
          let s = vassalIndex.get(c.overlordId);
          if (!s) {
            s = new Set<string>();
            vassalIndex.set(c.overlordId, s);
          }
          s.add(c.id);
        }
        if (c.locationId) {
          let ls = locationIndex.get(c.locationId);
          if (!ls) {
            ls = new Set<string>();
            locationIndex.set(c.locationId, ls);
          }
          ls.add(c.id);
        }
      }

      return { characters: chars, aliveSet, vassalIndex, locationIndex };
    });
  },

  // Phase 2: 官职系统
  setOfficialData: (charId, data) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c) return state;
      const official = { ...data, isCivil: isCivilByAbilities(c.abilities) };
      chars.set(charId, { ...c, official });
      return { characters: chars };
    });
  },

  addVirtue: (charId, amount) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c || !c.official) return state;
      chars.set(charId, {
        ...c,
        official: { ...c.official, virtue: c.official.virtue + amount },
      });
      return { characters: chars };
    });
  },

  setRank: (charId, level) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c || !c.official) return state;
      chars.set(charId, {
        ...c,
        official: { ...c.official, rankLevel: level },
      });
      return { characters: chars };
    });
  },

  setCapital: (charId, zhouId) => {
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c) return state;
      chars.set(charId, { ...c, capital: zhouId });
      return { characters: chars };
    });
  },

  refreshCapital: (charId) => {
    const { territories, controllerIndex, holderIndex } = useTerritoryStore.getState();
    const char = get().characters.get(charId);
    if (!char) return;
    // 手动迁都优先：只要当前 capital 仍在自己控制下且是 zhou 级，就保留玩家选择，
    // 不被岗位流转后的自动治所规则覆盖。capital 失控或越界 → 清掉 manual 标记 + 重选。
    if (char.capitalManual && char.capital) {
      const t = territories.get(char.capital);
      const stillControlled = !!(t && t.tier === 'zhou' && controllerIndex.get(charId)?.has(char.capital));
      if (stillControlled) return;
      // 失控 → 退回自动选择，并清 manual 标记
      const newCapital = resolveCapital(charId, territories, controllerIndex, holderIndex);
      set((state) => {
        const chars = new Map(state.characters);
        const c = chars.get(charId);
        if (!c) return state;
        chars.set(charId, { ...c, capital: newCapital, capitalManual: false });
        return { characters: chars };
      });
      return;
    }
    const newCapital = resolveCapital(charId, territories, controllerIndex, holderIndex);
    if (char.capital === newCapital) return;
    set((state) => {
      const chars = new Map(state.characters);
      const c = chars.get(charId);
      if (!c) return state;
      chars.set(charId, { ...c, capital: newCapital });
      return { characters: chars };
    });
  },

  // 所在地
  setLocation: (charId, locationId) => {
    const char = get().characters.get(charId);
    if (!char || char.locationId === locationId) return;
    get().updateCharacter(charId, { locationId });
  },

  refreshLocation: (charId) => {
    const { characters } = get();
    const campaigns = useWarStore.getState().campaigns;
    const newLoc = resolveLocation(charId, characters, campaigns);
    const char = characters.get(charId);
    if (!char || char.locationId === newLoc) return;
    get().updateCharacter(charId, { locationId: newLoc });
  },

  getCharactersAtLocation: (territoryId) => {
    const { locationIndex, characters } = get();
    const ids = locationIndex.get(territoryId);
    if (!ids) return [];
    const result: Character[] = [];
    for (const id of ids) {
      const c = characters.get(id);
      if (c) result.push(c);
    }
    return result;
  },

  refreshIsRuler: (rulerIds) => {
    set((state) => {
      const chars = new Map(state.characters);
      let changed = false;
      for (const [id, c] of chars) {
        if (!c.alive) continue;
        const shouldBeRuler = rulerIds.has(id);
        if (c.isRuler !== shouldBeRuler) {
          chars.set(id, { ...c, isRuler: shouldBeRuler });
          changed = true;
        }
      }
      return changed ? { characters: chars } : state;
    });
  },
}));
