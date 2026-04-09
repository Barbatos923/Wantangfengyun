import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { GameEvent } from '@engine/types.ts';

const DB_NAME = 'wantang-db';
const DB_VERSION = 3;

type WantangDB = IDBPDatabase;

let dbPromise: Promise<WantangDB> | null = null;

/** Open (and upgrade if needed) the IndexedDB database. */
export function initDB(): Promise<WantangDB> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('saves', { keyPath: 'id' });
        }
        // v2 引入了无 playthrough 隔离的 events / chronicles，v3 改为按 playthroughId 命名空间，
        // 旧表数据无法保留（缺少 pid 字段，跨周目串档），直接清空重建。
        if (oldVersion < 3) {
          if (db.objectStoreNames.contains('events')) db.deleteObjectStore('events');
          if (db.objectStoreNames.contains('chronicles')) db.deleteObjectStore('chronicles');
          const eventStore = db.createObjectStore('events', { keyPath: 'key' });
          eventStore.createIndex('by-pid-year', ['playthroughId', 'year'], { unique: false });
          eventStore.createIndex('by-pid', 'playthroughId', { unique: false });
          const chronStore = db.createObjectStore('chronicles', { keyPath: 'key' });
          chronStore.createIndex('by-pid', 'playthroughId', { unique: false });
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

/**
 * Save generated chronicle text for a given year (按 playthroughId 命名空间)。
 *
 * 必须传 playthroughId，避免不同周目年份相同时覆盖彼此的史书文本。
 */
export async function saveChronicle(playthroughId: string, year: number, text: string): Promise<void> {
  const db = await initDB();
  await db.put('chronicles', { key: `${playthroughId}::${year}`, playthroughId, year, text });
}

/** Load chronicle text for a given year (按 playthroughId 命名空间)。 */
export async function loadChronicle(playthroughId: string, year: number): Promise<string | undefined> {
  const db = await initDB();
  const record = await db.get('chronicles', `${playthroughId}::${year}`);
  return record?.text;
}

// ===== Event 归档 =====

/** 将事件批量写入 IndexedDB（幂等，按 playthroughId 命名空间）。 */
export async function archiveEvents(playthroughId: string, events: GameEvent[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction('events', 'readwrite');
  for (const e of events) {
    await tx.store.put({
      ...e,
      key: `${playthroughId}::${e.id}`,
      playthroughId,
      year: e.date.year,
      month: e.date.month,
    });
  }
  await tx.done;
}

/** 从 IndexedDB 加载指定年份的归档事件（按 playthroughId 过滤）。 */
export async function loadArchivedEvents(playthroughId: string, year: number): Promise<GameEvent[]> {
  const db = await initDB();
  return db.getAllFromIndex('events', 'by-pid-year', [playthroughId, year]);
}

/** 从 IndexedDB 加载指定年份范围的归档事件（按 playthroughId 过滤）。 */
export async function loadArchivedEventsByRange(
  playthroughId: string,
  startYear: number,
  endYear: number,
): Promise<GameEvent[]> {
  const db = await initDB();
  const range = IDBKeyRange.bound([playthroughId, startYear], [playthroughId, endYear]);
  return db.getAllFromIndex('events', 'by-pid-year', range);
}

/** 删除某 playthrough 名下所有归档事件 + 史书（用于新游戏/读档前清理本地残留）。 */
export async function purgePlaythroughArchives(playthroughId: string): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(['events', 'chronicles'], 'readwrite');
  const evKeys = await tx.objectStore('events').index('by-pid').getAllKeys(playthroughId);
  for (const k of evKeys) await tx.objectStore('events').delete(k);
  const chKeys = await tx.objectStore('chronicles').index('by-pid').getAllKeys(playthroughId);
  for (const k of chKeys) await tx.objectStore('chronicles').delete(k);
  await tx.done;
}
