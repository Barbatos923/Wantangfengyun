/** Generic registry for static game data keyed by string id. */
export class Registry<T> {
  private items = new Map<string, T>();

  register(id: string, item: T): void {
    this.items.set(id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  getAll(): Map<string, T> {
    return this.items;
  }

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

export const buildingRegistry = new Registry<BuildingStub>();
