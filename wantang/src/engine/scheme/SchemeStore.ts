// ===== 计谋 Store =====
//
// 维护活跃计谋实例 + 两个反向索引（initiator/target）。
// 索引不写入存档，由 initSchemes() 重建（参考 vassalIndex 模式）。

import { create } from 'zustand';
import type { SchemeInstance, SchemeStatus } from './types';
import { toAbsoluteDay } from '@engine/dateUtils';

/** per-(initiator, primaryTarget, schemeType) CD 天数 */
export const SCHEME_PER_TARGET_CD_DAYS = 365;

interface SchemeStoreState {
  schemes: Map<string, SchemeInstance>;
  initiatorIndex: Map<string, Set<string>>;  // initiatorId → schemeIds
  targetIndex: Map<string, Set<string>>;     // primaryTargetId → schemeIds
  spymasters: Map<string, string>;           // charId → spymasterId（缺省=自身）

  // ── 写操作 ──
  addScheme: (scheme: SchemeInstance) => void;
  removeScheme: (id: string) => void;
  /**
   * 局部更新。**禁止更改 id / schemeTypeId / initiatorId / primaryTargetId**
   * （这些是索引键，需重建索引才能改）。日结路径只用 phase / currentSuccessRate。
   */
  updateScheme: (id: string, patch: Partial<Omit<SchemeInstance, 'id' | 'schemeTypeId' | 'initiatorId' | 'primaryTargetId'>>) => void;
  setStatus: (id: string, status: SchemeStatus) => void;
  setSpymaster: (charId: string, spymasterId: string) => void;
  removeSpymaster: (charId: string) => void;

  // ── 查询 ──
  getActiveSchemesByInitiator: (charId: string) => SchemeInstance[];
  getActiveSchemesByTarget: (charId: string) => SchemeInstance[];
  getActiveSchemeCount: (charId: string) => number;
  getAllActive: () => SchemeInstance[];
  /**
   * per-(initiator, primaryTarget, schemeType) CD 判定。
   * 同一发起人最近对同一目标做过同类计谋时返回 true（CD 未过）。
   *
   * 规则：
   *   - status === 'active' → 永远返回 true（已有同类进行中，不能再开一个）
   *   - status in ['success', 'failure', 'exposed'] → 若 resolveDate 存在且距今 < cdDays，返回 true
   *   - status === 'terminated' → **不**计入 CD（死亡终止的计谋语义失效）
   */
  hasRecentScheme: (
    initiatorId: string,
    primaryTargetId: string,
    schemeTypeId: string,
    currentAbsDay: number,
    cdDays?: number,
  ) => boolean;

  // ── 反序列化入口 ──
  initSchemes: (schemes: SchemeInstance[], spymasters?: [string, string][]) => void;
}

function addToIndex(index: Map<string, Set<string>>, key: string, value: string): void {
  let set = index.get(key);
  if (!set) {
    set = new Set();
    index.set(key, set);
  }
  set.add(value);
}

function removeFromIndex(index: Map<string, Set<string>>, key: string, value: string): void {
  const set = index.get(key);
  if (!set) return;
  set.delete(value);
  if (set.size === 0) index.delete(key);
}

export const useSchemeStore = create<SchemeStoreState>((set, get) => ({
  schemes: new Map(),
  initiatorIndex: new Map(),
  targetIndex: new Map(),
  spymasters: new Map(),

  addScheme: (scheme) => set((s) => {
    const schemes = new Map(s.schemes);
    const initiatorIndex = new Map(s.initiatorIndex);
    const targetIndex = new Map(s.targetIndex);
    schemes.set(scheme.id, scheme);
    addToIndex(initiatorIndex, scheme.initiatorId, scheme.id);
    addToIndex(targetIndex, scheme.primaryTargetId, scheme.id);
    return { schemes, initiatorIndex, targetIndex };
  }),

  removeScheme: (id) => set((s) => {
    const existing = s.schemes.get(id);
    if (!existing) return s;
    const schemes = new Map(s.schemes);
    const initiatorIndex = new Map(s.initiatorIndex);
    const targetIndex = new Map(s.targetIndex);
    schemes.delete(id);
    removeFromIndex(initiatorIndex, existing.initiatorId, id);
    removeFromIndex(targetIndex, existing.primaryTargetId, id);
    return { schemes, initiatorIndex, targetIndex };
  }),

  updateScheme: (id, patch) => set((s) => {
    const existing = s.schemes.get(id);
    if (!existing) return s;
    const schemes = new Map(s.schemes);
    schemes.set(id, { ...existing, ...patch });
    return { schemes };
  }),

  setStatus: (id, status) => set((s) => {
    const existing = s.schemes.get(id);
    if (!existing) return s;
    const schemes = new Map(s.schemes);
    schemes.set(id, { ...existing, status });
    return { schemes };
  }),

  setSpymaster: (charId, spymasterId) => set((s) => {
    const spymasters = new Map(s.spymasters);
    spymasters.set(charId, spymasterId);
    return { spymasters };
  }),

  removeSpymaster: (charId) => set((s) => {
    const spymasters = new Map(s.spymasters);
    spymasters.delete(charId);
    return { spymasters };
  }),

  getActiveSchemesByInitiator: (charId) => {
    const ids = get().initiatorIndex.get(charId);
    if (!ids) return [];
    const schemes = get().schemes;
    const result: SchemeInstance[] = [];
    for (const id of ids) {
      const s = schemes.get(id);
      if (s && s.status === 'active') result.push(s);
    }
    return result;
  },

  getActiveSchemesByTarget: (charId) => {
    const ids = get().targetIndex.get(charId);
    if (!ids) return [];
    const schemes = get().schemes;
    const result: SchemeInstance[] = [];
    for (const id of ids) {
      const s = schemes.get(id);
      if (s && s.status === 'active') result.push(s);
    }
    return result;
  },

  getActiveSchemeCount: (charId) => {
    return get().getActiveSchemesByInitiator(charId).length;
  },

  getAllActive: () => {
    const result: SchemeInstance[] = [];
    for (const s of get().schemes.values()) {
      if (s.status === 'active') result.push(s);
    }
    return result;
  },

  hasRecentScheme: (initiatorId, primaryTargetId, schemeTypeId, currentAbsDay, cdDays = SCHEME_PER_TARGET_CD_DAYS) => {
    const ids = get().initiatorIndex.get(initiatorId);
    if (!ids) return false;
    const schemes = get().schemes;
    for (const id of ids) {
      const s = schemes.get(id);
      if (!s) continue;
      if (s.primaryTargetId !== primaryTargetId) continue;
      if (s.schemeTypeId !== schemeTypeId) continue;
      if (s.status === 'active') return true;
      if (s.status === 'terminated') continue;
      // success / failure / exposed：走 resolveDate CD
      if (!s.resolveDate) continue;
      const resolveAbs = toAbsoluteDay(s.resolveDate);
      if (currentAbsDay - resolveAbs < cdDays) return true;
    }
    return false;
  },

  initSchemes: (list, spymasterEntries) => {
    const schemes = new Map<string, SchemeInstance>();
    const initiatorIndex = new Map<string, Set<string>>();
    const targetIndex = new Map<string, Set<string>>();
    for (const scheme of list) {
      schemes.set(scheme.id, scheme);
      addToIndex(initiatorIndex, scheme.initiatorId, scheme.id);
      addToIndex(targetIndex, scheme.primaryTargetId, scheme.id);
    }
    const spymasters = new Map<string, string>();
    if (spymasterEntries) {
      for (const [k, v] of spymasterEntries) {
        spymasters.set(k, v);
      }
    }
    set({ schemes, initiatorIndex, targetIndex, spymasters });
  },
}));
