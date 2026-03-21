export {
  GameSpeed,
  Era,
  ResourceType,
  EventPriority,
} from './types';

export type {
  GameDate,
  Resources,
  GameEvent,
  CharacterStub,
  TerritoryStub,
} from './types';

export { useTurnManager } from './TurnManager';

// Phase 1: Character system
export type {
  Gender,
  Abilities,
  FamilyRelations,
  OpinionEntry,
  Relationship,
  Character,
} from './character/types';

export { useCharacterStore } from './character/CharacterStore';

export {
  generateAbilities,
  assignPersonalityTraits,
  assignEducationTrait,
  calculateBaseOpinion,
  getEffectiveAbilities,
} from './character/characterUtils';

// Phase 1: Territory system
export type {
  TerritoryTier,
  TerritoryType,
  CentralizationLevel,
  BuildingSlot,
  Construction,
  Territory,
} from './territory/types';

export { useTerritoryStore } from './territory/TerritoryStore';

export {
  calculateMonthlyIncome,
  calculateAttributeDrift,
  getBuildingBonuses,
} from './territory/territoryUtils';

// Phase 1: Settlement
export { runMonthlySettlement } from './settlement';

// Phase 2: Official system
export type {
  RankLevel,
  RankDef,
  Institution,
  PositionScope,
  PositionDef,
  PositionHolding,
  OfficialData,
  MonthlyLedger,
} from './official/types';
