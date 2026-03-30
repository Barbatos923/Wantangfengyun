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

/** Save game state with a timestamp. */
export async function saveGame(id: string, data: unknown): Promise<void> {
  const db = await initDB();
  await db.put('saves', { id, data, timestamp: Date.now() });
}

/** Load game state by id. Returns the data payload, or undefined if not found. */
export async function loadGame(id: string): Promise<unknown | undefined> {
  const db = await initDB();
  const record = await db.get('saves', id);
  return record?.data;
}

/** List all saves as { id, timestamp } entries. */
export async function listSaves(): Promise<{ id: string; timestamp: number }[]> {
  const db = await initDB();
  const all = await db.getAll('saves');
  return all.map((r: { id: string; timestamp: number }) => ({
    id: r.id,
    timestamp: r.timestamp,
  }));
}

/** Delete a save by id. */
export async function deleteSave(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('saves', id);
}

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
