// ===== 左侧面板导航栈 =====

import { create } from 'zustand';
import { useCharacterStore } from '@engine/character/CharacterStore';

interface PanelState {
  /** Character ID navigation stack */
  stack: string[];
  pinned: boolean;
  /** Currently open territory modal (null = closed) */
  territoryModalId: string | null;

  pushCharacter: (id: string) => void;
  goBack: () => void;
  goToPlayer: () => void;
  close: () => void;
  togglePin: () => void;
  openTerritoryModal: (id: string) => void;
  closeTerritoryModal: () => void;
}

export const usePanelStore = create<PanelState>((set, get) => ({
  stack: [],
  pinned: false,
  territoryModalId: null,

  pushCharacter: (id) => {
    const { stack } = get();
    if (stack.length > 0 && stack[stack.length - 1] === id) return;
    const newStack = stack.length >= 20 ? [...stack.slice(1), id] : [...stack, id];
    set({ stack: newStack });
  },

  goBack: () => {
    const { stack } = get();
    if (stack.length <= 1) {
      set({ stack: [], territoryModalId: null });
    } else {
      set({ stack: stack.slice(0, -1) });
    }
  },

  goToPlayer: () => {
    const playerId = useCharacterStore.getState().playerId;
    if (!playerId) return;
    set({ stack: [playerId], territoryModalId: null });
  },

  close: () => set({ stack: [], territoryModalId: null }),

  togglePin: () => set((s) => ({ pinned: !s.pinned })),

  openTerritoryModal: (id) => set({ territoryModalId: id }),
  closeTerritoryModal: () => set({ territoryModalId: null }),
}));

/** Get top character ID (current panel display) */
export function usePanelCurrent(): string | undefined {
  return usePanelStore((s) => s.stack[s.stack.length - 1]);
}

/** Is the character panel open */
export function usePanelOpen(): boolean {
  return usePanelStore((s) => s.stack.length > 0);
}
