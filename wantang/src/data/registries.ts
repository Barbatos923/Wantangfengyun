import type { CharacterStub, TerritoryStub } from '@engine/types';

/** Generic registry for static game data keyed by string id. */
export class Registry<T> {
  private items = new Map<string, T>();

  /** Register an item under the given id. */
  register(id: string, item: T): void {
    this.items.set(id, item);
  }

  /** Get an item by id, or undefined if not found. */
  get(id: string): T | undefined {
    return this.items.get(id);
  }

  /** Get all registered items as a Map. */
  getAll(): Map<string, T> {
    return this.items;
  }

  /** Check whether an item with the given id exists. */
  has(id: string): boolean {
    return this.items.has(id);
  }
}

/** Building stub type (placeholder until Phase 1 defines full building data). */
export interface BuildingStub {
  id: string;
  name: string;
  description: string;
}

// Singleton registries — populated via loadSampleData() or future data loaders.
export const characterRegistry = new Registry<CharacterStub>();
export const territoryRegistry = new Registry<TerritoryStub>();
export const buildingRegistry = new Registry<BuildingStub>();
