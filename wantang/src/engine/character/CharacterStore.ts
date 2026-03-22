import { create } from 'zustand';
import type { Character, OpinionEntry } from './types';
import type { OfficialData } from '../official/types';
import { isCivilByAbilities } from '../official/officialUtils';

interface CharacterStoreState {
  characters: Map<string, Character>;
  playerId: string | null;

  // 初始化
  initCharacters: (chars: Character[]) => void;
  setPlayerId: (id: string) => void;

  // 查询
  getCharacter: (id: string) => Character | undefined;
  getPlayer: () => Character | undefined;
  getAliveCharacters: () => Character[];

  // 修改
  updateCharacter: (id: string, patch: Partial<Character>) => void;
  addTrait: (charId: string, traitId: string) => void;
  removeTrait: (charId: string, traitId: string) => void;
  addResources: (charId: string, resources: Partial<Character['resources']>) => void;
  addOpinion: (charId: string, targetId: string, entry: OpinionEntry) => void;
  setOpinion: (charId: string, targetId: string, entry: OpinionEntry) => void;
  killCharacter: (id: string, deathYear: number) => void;

  // Phase 2: 官职系统（精简版）
  setOfficialData: (charId: string, data: OfficialData) => void;
  addVirtue: (charId: string, amount: number) => void;
  setRank: (charId: string, level: number) => void;
}

export const useCharacterStore = create<CharacterStoreState>((set, get) => ({
  characters: new Map(),
  playerId: null,

  initCharacters: (chars) => {
    const map = new Map<string, Character>();
    for (const c of chars) {
      map.set(c.id, c);
    }
    set({ characters: map });
  },

  setPlayerId: (id) => set({ playerId: id }),

  getCharacter: (id) => get().characters.get(id),

  getPlayer: () => {
    const { playerId, characters } = get();
    return playerId ? characters.get(playerId) : undefined;
  },

  getAliveCharacters: () => {
    const chars: Character[] = [];
    get().characters.forEach((c) => {
      if (c.alive) chars.push(c);
    });
    return chars;
  },

  updateCharacter: (id, patch) => {
    set((state) => {
      const chars = new Map(state.characters);
      const existing = chars.get(id);
      if (!existing) return state;
      chars.set(id, { ...existing, ...patch });
      return { characters: chars };
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
      return { characters: chars };
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
}));
