// ===== 左侧面板导航栈 =====

import { create } from 'zustand';
import { useCharacterStore } from '@engine/character/CharacterStore';

interface PanelState {
  /** Character ID navigation stack */
  stack: string[];
  pinned: boolean;
  /** Currently open territory modal (null = closed) */
  territoryModalId: string | null;
  /** 地图聚焦的角色 ID（顶级领主），null = 默认视图 */
  mapFocusCharId: string | null;

  /** 地图选择模式（用于从弹窗中选择领地） */
  mapSelectionActive: boolean;
  mapSelectionPrompt: string;
  mapSelectionResult: string | null;
  startMapSelection: (prompt: string) => void;
  finishMapSelection: (territoryId: string | null) => void;

  pushCharacter: (id: string) => void;
  goBack: () => void;
  goToPlayer: () => void;
  close: () => void;
  togglePin: () => void;
  openTerritoryModal: (id: string) => void;
  closeTerritoryModal: () => void;
  setMapFocus: (charId: string | null) => void;
}

export const usePanelStore = create<PanelState>((set, get) => ({
  stack: [],
  pinned: false,
  territoryModalId: null,
  mapFocusCharId: null,

  mapSelectionActive: false,
  mapSelectionPrompt: '',
  mapSelectionResult: null,
  startMapSelection: (prompt) => set({ mapSelectionActive: true, mapSelectionPrompt: prompt, mapSelectionResult: null }),
  finishMapSelection: (territoryId) => set({ mapSelectionActive: false, mapSelectionResult: territoryId }),

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
  setMapFocus: (charId) => set({ mapFocusCharId: charId }),
}));

/** Get top character ID (current panel display) */
export function usePanelCurrent(): string | undefined {
  return usePanelStore((s) => s.stack[s.stack.length - 1]);
}

/** Is the character panel open */
export function usePanelOpen(): boolean {
  return usePanelStore((s) => s.stack.length > 0);
}
