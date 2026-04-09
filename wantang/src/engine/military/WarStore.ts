// ===== 战争 Store =====

import { create } from 'zustand';
import type { War, Campaign, Siege, CasusBelli, Truce } from './types';

interface WarState {
  wars: Map<string, War>;
  campaigns: Map<string, Campaign>;
  sieges: Map<string, Siege>;
  truces: Map<string, Truce>;

  // 停战
  addTruce(partyA: string, partyB: string, expiryDay: number): void;
  hasTruce(a: string, b: string, currentDay: number): boolean;
  cleanExpiredTruces(currentDay: number): void;

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
  /**
   * 战争领袖死亡时，把 attackerId / defenderId 替换为继承人。
   * 仅当 newLeader 当前未在敌对一方时执行；若 newLeader 已在同侧 participants 中，从那里移除。
   * 返回 true 表示替换成功；false 表示 newLeader 在敌对一方或其他原因无法替换。
   */
  replaceLeader(warId: string, oldLeader: string, newLeader: string): boolean;

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
  truces: new Map(),

  // ── 停战 ────────────────────────────────────────────────────────────────

  addTruce(partyA, partyB, expiryDay) {
    const truce: Truce = { id: crypto.randomUUID(), partyA, partyB, expiryDay };
    set((state) => {
      const truces = new Map(state.truces);
      truces.set(truce.id, truce);
      return { truces };
    });
  },

  hasTruce(a, b, currentDay) {
    for (const t of get().truces.values()) {
      if (t.expiryDay <= currentDay) continue;
      if ((t.partyA === a && t.partyB === b) || (t.partyA === b && t.partyB === a)) {
        return true;
      }
    }
    return false;
  },

  cleanExpiredTruces(currentDay) {
    const expired: string[] = [];
    for (const t of get().truces.values()) {
      if (t.expiryDay <= currentDay) expired.push(t.id);
    }
    if (expired.length === 0) return;
    set((state) => {
      const truces = new Map(state.truces);
      for (const id of expired) truces.delete(id);
      return { truces };
    });
  },

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

  replaceLeader(warId, oldLeader, newLeader) {
    let ok = false;
    set((state) => {
      const war = state.wars.get(warId);
      if (!war) return {};
      // 判定 oldLeader 是哪一方
      const isAttacker = war.attackerId === oldLeader;
      const isDefender = war.defenderId === oldLeader;
      if (!isAttacker && !isDefender) return {};
      // newLeader 不能在敌对一方（继承人偶尔可能恰好是敌方臣属）
      const enemyList = isAttacker ? war.defenderParticipants : war.attackerParticipants;
      const enemyLeader = isAttacker ? war.defenderId : war.attackerId;
      if (newLeader === enemyLeader || enemyList.includes(newLeader)) return {};
      const wars = new Map(state.wars);
      const sameSideList = isAttacker ? war.attackerParticipants : war.defenderParticipants;
      // 如果 newLeader 已经在同侧 participants 中，移除（升任领袖）
      const filteredSame = sameSideList.filter((id) => id !== newLeader);
      wars.set(warId, {
        ...war,
        attackerId: isAttacker ? newLeader : war.attackerId,
        defenderId: isDefender ? newLeader : war.defenderId,
        attackerParticipants: isAttacker ? filteredSame : war.attackerParticipants,
        defenderParticipants: isDefender ? filteredSame : war.defenderParticipants,
      });
      ok = true;
      return { wars };
    });
    return ok;
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
      // 集结期间禁止行军：incomingArmies 的 turnsLeft 是基于当前 locationId 算的，
      // 行军会让 locationId 变化导致集结目标失真。等所有军队到位后再下行军令。
      if (existing.incomingArmies.length > 0) return {};
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
