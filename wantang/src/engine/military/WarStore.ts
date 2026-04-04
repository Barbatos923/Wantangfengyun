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
    date: { year: number; month: number; day: number },
  ): War;
  endWar(warId: string, result: War['result']): void;
  getActiveWars(): War[];
  getWarsByCharacter(charId: string): War[];
  addParticipant(warId: string, charId: string, side: 'attacker' | 'defender'): void;
  removeParticipant(warId: string, charId: string): void;

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
    date: { year: number; month: number; day: number },
  ): Siege;
  endSiege(siegeId: string): void;
  getSiegeAtTerritory(territoryId: string): Siege | undefined;

  // 通用
  updateWar(id: string, patch: Partial<War>): void;
  updateCampaign(id: string, patch: Partial<Campaign>): void;
  updateSiege(id: string, patch: Partial<Siege>): void;
}


export const useWarStore = create<WarState>()((set, get) => ({
  wars: new Map(),
  campaigns: new Map(),
  sieges: new Map(),

  // ── 战争 ────────────────────────────────────────────────────────────────

  declareWar(attackerId, defenderId, casusBelli, targetTerritoryIds, date) {
    const war: War = {
      id: crypto.randomUUID(),
      attackerId,
      defenderId,
      attackerParticipants: [],
      defenderParticipants: [],
      casusBelli,
      targetTerritoryIds,
      warScore: 0,
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
      if (
        war.attackerId === charId || war.defenderId === charId ||
        war.attackerParticipants.includes(charId) ||
        war.defenderParticipants.includes(charId)
      ) {
        result.push(war);
      }
    }
    return result;
  },

  addParticipant(warId, charId, side) {
    set((state) => {
      const war = state.wars.get(warId);
      if (!war || war.status !== 'active') return {};
      // 不能把领袖加入参战者列表（防止 attackerId 出现在 defenderParticipants 等异常）
      if (charId === war.attackerId || charId === war.defenderId) return {};
      // 不能重复加入
      if (war.attackerParticipants.includes(charId) || war.defenderParticipants.includes(charId)) return {};
      const wars = new Map(state.wars);
      if (side === 'attacker') {
        wars.set(warId, { ...war, attackerParticipants: [...war.attackerParticipants, charId] });
      } else {
        wars.set(warId, { ...war, defenderParticipants: [...war.defenderParticipants, charId] });
      }
      return { wars };
    });
  },

  removeParticipant(warId, charId) {
    set((state) => {
      const war = state.wars.get(warId);
      if (!war) return {};
      const wars = new Map(state.wars);
      wars.set(warId, {
        ...war,
        attackerParticipants: war.attackerParticipants.filter(id => id !== charId),
        defenderParticipants: war.defenderParticipants.filter(id => id !== charId),
      });
      return { wars };
    });
  },

  // ── 行营 ────────────────────────────────────────────────────────────────

  createCampaign(warId, ownerId, commanderId, armyIds, locationId) {
    const campaign: Campaign = {
      id: crypto.randomUUID(),
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
      marchProgress: 0,
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
        marchProgress: 0,
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
      id: crypto.randomUUID(),
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
