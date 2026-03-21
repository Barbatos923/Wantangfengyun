export {
  initDB,
  saveGame,
  loadGame,
  listSaves,
  deleteSave,
  saveChronicle,
  loadChronicle,
} from './storage';

export {
  Registry,
  characterRegistry,
  territoryRegistry,
  buildingRegistry,
} from './registries';
export type { BuildingStub } from './registries';

export { loadSampleData } from './sample';

// Phase 1: Traits & Buildings
export { ALL_TRAITS, traitMap, getTraitsByCategory, getEducationTrait } from './traits';
export type { TraitDef, TraitCategory } from './traits';

export { ALL_BUILDINGS, buildingMap } from './buildings';
export type { BuildingDef } from './buildings';

// Phase 2: Ranks & Positions
export { ALL_RANKS, rankMap } from './ranks';
export { ALL_POSITIONS, positionMap } from './positions';
