import { create } from 'zustand';
import type { Character, OpinionEntry } from './types';
import type { OfficialData } from '../official/types';
import { isCivilByAbilities } from '../official/officialUtils';

interface CharacterStoreState {
  characters: Map<string, Character>;
  playerId: string | null;
  vassalIndex: Map<string, Set<string>>;   // overlordId → Set<vassalId>
  aliveSet: Set<string>;                    // 存活角色ID集合

  // 初始化
  initCharacters: (chars: Character[]) => void;
  setPlayerId: (id: string) => void;

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
}

export const useCharacterStore = create<CharacterStoreState>((set, get) => ({
  characters: new Map(),
  playerId: null,
  vassalIndex: new Map(),
  aliveSet: new Set(),

  initCharacters: (chars) => {
    const map = new Map<string, Character>();
    const vassalIndex = new Map<string, Set<string>>();
    const aliveSet = new Set<string>();
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
    }
    set({ characters: map, vassalIndex, aliveSet });
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
      chars.set(id, { ...existing, ...patch });

      // DEBUG: 检测自我领主
      if (patch.overlordId !== undefined && patch.overlordId === id) {
        console.error(`[BUG] 自我领主！${existing.name}(${id}) overlordId 被设为自己`, new Error().stack);
      }

      // 追踪 overlordId 变化（仅 isRuler 角色）
      if (patch.overlordId !== undefined && patch.overlordId !== existing.overlordId && existing.isRuler) {
        const oldOverlord = existing.overlordId ? chars.get(existing.overlordId)?.name ?? existing.overlordId : '无';
        const newOverlord = patch.overlordId ? chars.get(patch.overlordId)?.name ?? patch.overlordId : '无';
        console.log(`[overlord变更] ${existing.name}(${id.slice(0,8)}) overlord: ${oldOverlord} → ${newOverlord}`);
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

      return { characters: chars, vassalIndex, aliveSet };
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

      return { characters: chars, aliveSet, vassalIndex };
    });
  },

  // 批量更新：创建一次新 Map，交给 mutator 就地修改，完成后重建索引
  batchMutate: (mutator) => {
    set((state) => {
      const chars = new Map(state.characters);
      mutator(chars);

      // DEBUG: 检测自我领主
      for (const c of chars.values()) {
        if (c.overlordId === c.id) {
          console.error(`[BUG] batchMutate 自我领主！${c.name}(${c.id})`, new Error().stack);
        }
      }

      // 重建 aliveSet 和 vassalIndex（O(n)，但只执行一次）
      const aliveSet = new Set<string>();
      const vassalIndex = new Map<string, Set<string>>();
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
      }

      return { characters: chars, aliveSet, vassalIndex };
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
