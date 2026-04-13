import { create } from 'zustand';

const STORAGE_KEY = 'wantang-ui-settings';
const BASE_WIDTH = 1920;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.5;

interface UiSettingsState {
  /** UI 缩放比例，1 = 基准（1920px 宽） */
  uiScale: number;
  /** 是否由用户手动设置过（否则跟随视口自动计算） */
  manualScale: boolean;
  setUiScale: (scale: number) => void;
  resetToAuto: () => void;
}

const isBrowser = typeof window !== 'undefined';

function calcAutoScale(): number {
  if (!isBrowser) return 1;
  const ratio = window.innerWidth / BASE_WIDTH;
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, ratio)) * 100) / 100;
}

function loadFromStorage(): { uiScale: number; manualScale: boolean } {
  if (!isBrowser) return { uiScale: 1, manualScale: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.uiScale === 'number' && parsed.manualScale) {
        return { uiScale: parsed.uiScale, manualScale: true };
      }
    }
  } catch { /* ignore */ }
  return { uiScale: calcAutoScale(), manualScale: false };
}

function saveToStorage(uiScale: number, manualScale: boolean) {
  if (!isBrowser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ uiScale, manualScale }));
}

const initial = loadFromStorage();

export const useUiSettingsStore = create<UiSettingsState>((set) => ({
  uiScale: initial.uiScale,
  manualScale: initial.manualScale,

  setUiScale: (scale) => {
    const clamped = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) * 100) / 100;
    saveToStorage(clamped, true);
    set({ uiScale: clamped, manualScale: true });
  },

  resetToAuto: () => {
    const auto = calcAutoScale();
    saveToStorage(auto, false);
    set({ uiScale: auto, manualScale: false });
  },
}));

// 自动适配模式下，监听窗口 resize 持续更新 uiScale
if (isBrowser) {
  window.addEventListener('resize', () => {
    const { manualScale } = useUiSettingsStore.getState();
    if (manualScale) return;
    const auto = calcAutoScale();
    saveToStorage(auto, false);
    useUiSettingsStore.setState({ uiScale: auto });
  });
}
