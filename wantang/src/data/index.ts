export {
  initDB,
  saveGame,
  loadGame,
  listSaves,
  deleteSave,
  saveChronicle,
  loadChronicle,
} from '@engine/storage';

export {
  Registry,
  buildingRegistry,
} from '@engine/utils/registries';
export type { BuildingStub } from '@engine/utils/registries';

export { loadSampleData } from '@engine/init/loadSampleData';

// Phase 1: Traits & Buildings
export { ALL_TRAITS, traitMap } from './traits';
export type { TraitDef, TraitCategory } from './traits';
export { getTraitsByCategory, getEducationTrait } from '@engine/character/characterUtils';

export { ALL_BUILDINGS, buildingMap } from './buildings';
export type { BuildingDef } from './buildings';

// Phase 2: Ranks & Positions
export { ALL_RANKS, rankMap } from './ranks';
export { ALL_POSITIONS, positionMap } from './positions';
