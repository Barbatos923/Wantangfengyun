import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { GameEvent } from '@engine/types.ts';

const DB_NAME = 'wantang-db';
const DB_VERSION = 2;

type WantangDB = IDBPDatabase;

let dbPromise: Promise<WantangDB> | null = null;

/** Open (and upgrade if needed) the IndexedDB database. */
export function initDB(): Promise<WantangDB> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('saves', { keyPath: 'id' });
          db.createObjectStore('chronicles', { keyPath: 'year' });
        }
        if (oldVersion < 2) {
          const eventStore = db.createObjectStore('events', { keyPath: 'id' });
          eventStore.createIndex('by-year', 'year', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

/** 存档列表条目（轻量元信息，不含 data 主体）。 */
export interface SaveListEntry {
  id: string;
  displayName: string;
  timestamp: number;
  gameYear: number;
  gameMonth: number;
  gameDay: number;
  playerName: string;
}

/** 存档元信息。可选；不传则用占位值（用于自动续档槽）。 */
export interface SaveMeta {
  displayName?: string;
  gameYear?: number;
  gameMonth?: number;
  gameDay?: number;
  playerName?: string;
}

/**
 * 存档存储后端接口。
 *
 * **未来桌面端移植锚点**：当游戏从 web 移植到 Tauri/Electron 桌面端时，
 * 只需新写一个 `FileSystemBackend` 实现这个接口（读写真实 .json 文件），
 * 然后把下方 `currentBackend` 切到新实例。UI / saveManager / serialize 全部零改动。
 */
export interface SaveStorageBackend {
  saveGame(id: string, data: unknown, meta?: SaveMeta): Promise<void>;
  loadGame(id: string): Promise<unknown | undefined>;
  listSaves(): Promise<SaveListEntry[]>;
  deleteSave(id: string): Promise<void>;
}

/** IndexedDB 后端实现（当前 web 阶段使用）。 */
export const indexedDBBackend: SaveStorageBackend = {
  async saveGame(id, data, meta) {
    const db = await initDB();
    await db.put('saves', {
      id,
      data,
      timestamp: Date.now(),
      displayName: meta?.displayName ?? '',
      gameYear: meta?.gameYear ?? 0,
      gameMonth: meta?.gameMonth ?? 0,
      gameDay: meta?.gameDay ?? 0,
      playerName: meta?.playerName ?? '',
    });
  },

  async loadGame(id) {
    const db = await initDB();
    const record = await db.get('saves', id);
    return record?.data;
  },

  async listSaves() {
    const db = await initDB();
    const all = await db.getAll('saves');
    return all.map((r: SaveListEntry) => ({
      id: r.id,
      displayName: r.displayName ?? '',
      timestamp: r.timestamp,
      gameYear: r.gameYear ?? 0,
      gameMonth: r.gameMonth ?? 0,
      gameDay: r.gameDay ?? 0,
      playerName: r.playerName ?? '',
    }));
  },

  async deleteSave(id) {
    const db = await initDB();
    await db.delete('saves', id);
  },
};

/**
 * 当前激活的存储后端。桌面端移植时把这个常量切到新后端即可。
 * 应用代码统一通过下方四个再导出函数调用，不直接引用 backend 实例。
 */
const currentBackend: SaveStorageBackend = indexedDBBackend;

/** Save game state with a timestamp and optional metadata. */
export const saveGame = (id: string, data: unknown, meta?: SaveMeta) =>
  currentBackend.saveGame(id, data, meta);

/** Load game state by id. Returns the data payload, or undefined if not found. */
export const loadGame = (id: string) => currentBackend.loadGame(id);

/** List all saves as full metadata entries (without the data payload — for list UI). */
export const listSaves = () => currentBackend.listSaves();

/** Delete a save by id. */
export const deleteSave = (id: string) => currentBackend.deleteSave(id);

/** Save generated chronicle text for a given year. */
export async function saveChronicle(year: number, text: string): Promise<void> {
  const db = await initDB();
  await db.put('chronicles', { year, text });
}

/** Load chronicle text for a given year. Returns undefined if not found. */
export async function loadChronicle(year: number): Promise<string | undefined> {
  const db = await initDB();
  const record = await db.get('chronicles', year);
  return record?.text;
}

// ===== Event 归档 =====

/** 将事件批量写入 IndexedDB（幂等，使用 put）。 */
export async function archiveEvents(events: GameEvent[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction('events', 'readwrite');
  for (const e of events) {
    await tx.store.put({ ...e, year: e.date.year, month: e.date.month });
  }
  await tx.done;
}

/** 从 IndexedDB 加载指定年份的归档事件。 */
export async function loadArchivedEvents(year: number): Promise<GameEvent[]> {
  const db = await initDB();
  return db.getAllFromIndex('events', 'by-year', year);
}

/** 从 IndexedDB 加载指定年份范围的归档事件。 */
export async function loadArchivedEventsByRange(startYear: number, endYear: number): Promise<GameEvent[]> {
  const db = await initDB();
  const range = IDBKeyRange.bound(startYear, endYear);
  return db.getAllFromIndex('events', 'by-year', range);
}
