// ===== 战争 Store =====

import { create } from 'zustand';
import type { War, Campaign, Siege, CasusBelli } from './types';

interface WarState {
  wars: Map<string, War>;
  campaigns: Map<string, Campaign>;
  sieges: Map<string, Siege>;

  // 战争
  declareWar(
    attackerId: string,
    defenderId: string,
    casusBelli: CasusBelli,
    targetTerritoryIds: string[],
    date: { year: number; month: number },
  ): War;
  endWar(warId: string, result: War['result']): void;
  getActiveWars(): War[];
  getWarsByCharacter(charId: string): War[];

  // 行营
  createCampaign(
    warId: string,
    ownerId: string,
    commanderId: string,
    armyIds: string[],
    locationId: string,
  ): Campaign;
  disbandCampaign(campaignId: string): void;
  setCampaignTarget(campaignId: string, targetId: string, route: string[]): void;
  getCampaignsByWar(warId: string): Campaign[];
  getCampaignsAtLocation(territoryId: string): Campaign[];

  // 围城
  startSiege(
    warId: string,
    campaignId: string,
    territoryId: string,
    date: { year: number; month: number },
  ): Siege;
  endSiege(siegeId: string): void;
  getSiegeAtTerritory(territoryId: string): Siege | undefined;

  // 通用
  updateWar(id: string, patch: Partial<War>): void;
  updateCampaign(id: string, patch: Partial<Campaign>): void;
  updateSiege(id: string, patch: Partial<Siege>): void;
}

let _warIdCounter = 1;
let _campaignIdCounter = 1;
let _siegeIdCounter = 1;

function nextWarId(): string {
  return `war_${_warIdCounter++}`;
}

function nextCampaignId(): string {
  return `campaign_${_campaignIdCounter++}`;
}

function nextSiegeId(): string {
  return `siege_${_siegeIdCounter++}`;
}

export const useWarStore = create<WarState>()((set, get) => ({
  wars: new Map(),
  campaigns: new Map(),
  sieges: new Map(),

  // ── 战争 ────────────────────────────────────────────────────────────────

  declareWar(attackerId, defenderId, casusBelli, targetTerritoryIds, date) {
    const war: War = {
      id: nextWarId(),
      attackerId,
      defenderId,
      casusBelli,
      targetTerritoryIds,
      attackerWarScore: 0,
      defenderWarScore: 0,
      startDate: date,
      status: 'active',
    };
    set((state) => {
      const wars = new Map(state.wars);
      wars.set(war.id, war);
      return { wars };
    });
    return war;
  },

  endWar(warId, result) {
    set((state) => {
      const existing = state.wars.get(warId);
      if (!existing) return {};
      const wars = new Map(state.wars);
      wars.set(warId, { ...existing, status: 'ended', result });
      return { wars };
    });
  },

  getActiveWars() {
    const wars: War[] = [];
    for (const war of get().wars.values()) {
      if (war.status === 'active') wars.push(war);
    }
    return wars;
  },

  getWarsByCharacter(charId) {
    const result: War[] = [];
    for (const war of get().wars.values()) {
      if (war.attackerId === charId || war.defenderId === charId) {
        result.push(war);
      }
    }
    return result;
  },

  // ── 行营 ────────────────────────────────────────────────────────────────

  createCampaign(warId, ownerId, commanderId, armyIds, locationId) {
    const campaign: Campaign = {
      id: nextCampaignId(),
      warId,
      ownerId,
      commanderId,
      armyIds,
      incomingArmies: [],
      phaseStrategies: {},
      locationId,
      targetId: null,
      route: [],
      routeProgress: 0,
      status: 'idle',
      musteringTurnsLeft: 0,
    };
    set((state) => {
      const campaigns = new Map(state.campaigns);
      campaigns.set(campaign.id, campaign);
      return { campaigns };
    });
    return campaign;
  },

  disbandCampaign(campaignId) {
    set((state) => {
      const campaigns = new Map(state.campaigns);
      campaigns.delete(campaignId);
      return { campaigns };
    });
  },

  setCampaignTarget(campaignId, targetId, route) {
    set((state) => {
      const existing = state.campaigns.get(campaignId);
      if (!existing) return {};
      const campaigns = new Map(state.campaigns);
      campaigns.set(campaignId, {
        ...existing,
        targetId,
        route,
        routeProgress: 0,
        status: 'marching',
      });
      return { campaigns };
    });
  },

  getCampaignsByWar(warId) {
    const result: Campaign[] = [];
    for (const campaign of get().campaigns.values()) {
      if (campaign.warId === warId) result.push(campaign);
    }
    return result;
  },

  getCampaignsAtLocation(territoryId) {
    const result: Campaign[] = [];
    for (const campaign of get().campaigns.values()) {
      if (campaign.locationId === territoryId) result.push(campaign);
    }
    return result;
  },

  // ── 围城 ────────────────────────────────────────────────────────────────

  startSiege(warId, campaignId, territoryId, date) {
    const siege: Siege = {
      id: nextSiegeId(),
      warId,
      campaignId,
      territoryId,
      progress: 0,
      startDate: date,
    };
    set((state) => {
      const sieges = new Map(state.sieges);
      sieges.set(siege.id, siege);
      return { sieges };
    });
    return siege;
  },

  endSiege(siegeId) {
    set((state) => {
      const sieges = new Map(state.sieges);
      sieges.delete(siegeId);
      return { sieges };
    });
  },

  getSiegeAtTerritory(territoryId) {
    for (const siege of get().sieges.values()) {
      if (siege.territoryId === territoryId) return siege;
    }
    return undefined;
  },

  // ── 通用 patch ───────────────────────────────────────────────────────────

  updateWar(id, patch) {
    set((state) => {
      const existing = state.wars.get(id);
      if (!existing) return {};
      const wars = new Map(state.wars);
      wars.set(id, { ...existing, ...patch });
      return { wars };
    });
  },

  updateCampaign(id, patch) {
    set((state) => {
      const existing = state.campaigns.get(id);
      if (!existing) return {};
      const campaigns = new Map(state.campaigns);
      campaigns.set(id, { ...existing, ...patch });
      return { campaigns };
    });
  },

  updateSiege(id, patch) {
    set((state) => {
      const existing = state.sieges.get(id);
      if (!existing) return {};
      const sieges = new Map(state.sieges);
      sieges.set(id, { ...existing, ...patch });
      return { sieges };
    });
  },
}));
