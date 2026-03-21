import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

const DB_NAME = 'wantang-db';
const DB_VERSION = 1;

type WantangDB = IDBPDatabase;

let dbPromise: Promise<WantangDB> | null = null;

/** Open (and upgrade if needed) the IndexedDB database. */
export function initDB(): Promise<WantangDB> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('saves')) {
          db.createObjectStore('saves', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('chronicles')) {
          db.createObjectStore('chronicles', { keyPath: 'year' });
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
