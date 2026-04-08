// ===== NPC 军事编制 AI（月结自动执行） =====
// 建军 / 换将 / 调营 / 裁营，跳过玩家角色。

import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from './MilitaryStore';
import { getControlledZhou } from '@engine/official/postQueries';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { unitTypeMap } from '@data/unitTypes';
import type { Character } from '@engine/character/types';
import type { Army, Battalion } from './types';
import type { Territory } from '@engine/territory/types';
import { debugLog } from '@engine/debugLog';

// ── 建军 ────────────────────────────────────────────────────────────────

/** 每 N 个控制州对应 1 支军队 */
const ZHOU_PER_ARMY = 3;
/** 军队数量上限 */
const MAX_ARMIES = 10;

function aiCreateArmy(
  char: Character,
  armies: Army[],
  controlledZhou: Territory[],
): void {
  const targetCount = Math.min(MAX_ARMIES, Math.ceil(controlledZhou.length / ZHOU_PER_ARMY));
  if (armies.length >= targetCount) return;

  // 找一个没有己方军队驻扎的州作为驻地
  const armyLocations = new Set(armies.map(a => a.locationId));
  const location = controlledZhou.find(z => !armyLocations.has(z.id));
  if (!location) return; // 所有州都有军队了

  const name = `${location.name}军`;
  const milStore = useMilitaryStore.getState();
  milStore.createArmy(name, char.id, location.id);
  debugLog('military', `[军编] ${char.name}：建军「${name}」驻${location.name}`);
}

// ── 换将 ────────────────────────────────────────────────────────────────

/** 换将优化阈值：新人选 military 高于现任多少点才替换 */
const COMMANDER_UPGRADE_THRESHOLD = 10;

function aiFillCommanders(
  char: Character,
  armies: Army[],
): void {
  const charStore = useCharacterStore.getState();
  const milStore = useMilitaryStore.getState();

  // 收集已担任将领的角色 ID
  const assignedIds = new Set<string>();
  for (const army of armies) {
    if (army.commanderId) {
      const cmd = charStore.getCharacter(army.commanderId);
      if (cmd?.alive) assignedIds.add(army.commanderId);
    }
  }

  // 候选人池：自己 + 直属臣属（用 vassalIndex），排除已任将
  const buildCandidates = (): Array<{ id: string; military: number }> => {
    const pool: Array<{ id: string; military: number }> = [];
    if (!assignedIds.has(char.id)) {
      pool.push({ id: char.id, military: getEffectiveAbilities(char).military });
    }
    const vassalIds = charStore.vassalIndex.get(char.id);
    if (vassalIds) {
      for (const vId of vassalIds) {
        if (assignedIds.has(vId)) continue;
        const v = charStore.characters.get(vId);
        if (!v?.alive) continue;
        pool.push({ id: v.id, military: getEffectiveAbilities(v).military });
      }
    }
    pool.sort((a, b) => b.military - a.military);
    return pool;
  };

  for (const army of armies) {
    const currentId = army.commanderId;
    const current = currentId ? charStore.getCharacter(currentId) : null;
    const currentAlive = current?.alive ?? false;

    if (!currentAlive) {
      // 补缺
      const candidates = buildCandidates();
      const best = candidates[0];
      if (best) {
        milStore.updateArmy(army.id, { commanderId: best.id });
        assignedIds.add(best.id);
        debugLog('military', `[军编] ${char.name}：${army.name} 补将 → ${charStore.getCharacter(best.id)?.name ?? best.id}（military=${best.military}）`);
      }
    } else {
      // 优化：有更强人选
      const currentMil = getEffectiveAbilities(current!).military;
      const candidates = buildCandidates();
      const better = candidates[0];
      if (better && better.military - currentMil >= COMMANDER_UPGRADE_THRESHOLD) {
        milStore.updateArmy(army.id, { commanderId: better.id });
        assignedIds.add(better.id);
        assignedIds.delete(currentId!);
        debugLog('military', `[军编] ${char.name}：${army.name} 换将 → ${charStore.getCharacter(better.id)?.name ?? better.id}（military=${better.military}，原${current!.name}=${currentMil}）`);
      }
    }
  }
}

// ── 调营 ────────────────────────────────────────────────────────────────

/** 营数差距达到此值时才调营 */
const REBALANCE_THRESHOLD = 3;

function aiRebalanceBattalions(
  char: Character,
  armies: Army[],
): void {
  if (armies.length < 2) return;

  const milStore = useMilitaryStore.getState();

  // 找营数最多和最少的军队
  let maxArmy = armies[0];
  let minArmy = armies[0];
  for (const army of armies) {
    if (army.battalionIds.length > maxArmy.battalionIds.length) maxArmy = army;
    if (army.battalionIds.length < minArmy.battalionIds.length) minArmy = army;
  }

  if (maxArmy.id === minArmy.id) return;
  if (maxArmy.battalionIds.length - minArmy.battalionIds.length < REBALANCE_THRESHOLD) return;

  // 从最多的军队中转出 strength 最低的营
  const battalions = milStore.battalions;
  let weakestBat: Battalion | null = null;
  let weakestStr = Infinity;
  for (const batId of maxArmy.battalionIds) {
    const bat = battalions.get(batId);
    if (bat && bat.currentStrength < weakestStr) {
      weakestStr = bat.currentStrength;
      weakestBat = bat;
    }
  }

  if (weakestBat) {
    milStore.transferBattalion(weakestBat.id, minArmy.id);
    debugLog('military', `[军编] ${char.name}：调营 ${weakestBat.name} 从${maxArmy.name} → ${minArmy.name}`);
  }
}

// ── 裁营 ────────────────────────────────────────────────────────────────

/** 空壳营阈值：strength 低于此值直接解散 */
const SHELL_BATTALION_THRESHOLD = 100;
/** 每月最多财政裁营数 */
const MAX_FISCAL_DISBAND = 2;

function aiDisbandBattalions(
  char: Character,
  armies: Army[],
): void {
  const milStore = useMilitaryStore.getState();
  const battalions = milStore.battalions;

  // 收集 owner 的所有营
  const ownerBattalions: Battalion[] = [];
  for (const army of armies) {
    for (const batId of army.battalionIds) {
      const bat = battalions.get(batId);
      if (bat) ownerBattalions.push(bat);
    }
  }

  // 1. 空壳营裁减
  for (const bat of ownerBattalions) {
    if (bat.currentStrength < SHELL_BATTALION_THRESHOLD) {
      milStore.disbandBattalion(bat.id);
      debugLog('military', `[军编] ${char.name}：裁空壳营 ${bat.name}（strength=${bat.currentStrength}）`);
    }
  }

  // 2. 财政裁减：净粮草为负时裁弱营
  // 重新获取最新状态（空壳营已裁）
  const freshArmies = milStore.getArmiesByOwner(char.id);
  // 用本月 ledger 评估净粮草（economySystem 已在本月结跑过，数据最新且精确）
  // 首月无 ledger 时跳过财政裁营
  const ledger = useLedgerStore.getState().allLedgers.get(char.id);
  if (!ledger) return;
  let netGrain =
    (ledger.territoryIncome.grain + ledger.vassalTribute.grain + ledger.redistributionReceived.grain)
    - (ledger.militaryMaintenance.grain + ledger.redistributionPaid.grain + ledger.overlordTribute.grain);

  if (netGrain >= 0) return;

  // 收集剩余营按 strength 升序
  const remaining: Battalion[] = [];
  for (const army of freshArmies) {
    for (const batId of army.battalionIds) {
      const bat = milStore.battalions.get(batId);
      if (bat) remaining.push(bat);
    }
  }
  remaining.sort((a, b) => a.currentStrength - b.currentStrength);

  let disbanded = 0;
  for (const bat of remaining) {
    if (netGrain >= 0 || disbanded >= MAX_FISCAL_DISBAND) break;
    // 估算该营月粮耗
    const def = unitTypeMap.get(bat.unitType);
    const grainSaved = def ? (bat.currentStrength / 1000) * def.grainCostPerThousand : 0;
    milStore.disbandBattalion(bat.id);
    netGrain += grainSaved;
    disbanded++;
    debugLog('military', `[军编] ${char.name}：财政裁营 ${bat.name}（strength=${bat.currentStrength}，净粮草=${Math.round(netGrain)}）`);
  }
}

// ── 入口 ────────────────────────────────────────────────────────────────

/**
 * NPC 军事编制 AI 入口。在 militarySystem 月结中调用。
 * 对每个 isRuler 且非玩家的角色执行建军/换将/调营/裁营。
 */
export function runMilitaryAI(): void {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const milStore = useMilitaryStore.getState();
  const playerId = charStore.playerId;

  for (const char of charStore.characters.values()) {
    if (!char.alive || !char.isRuler) continue;
    if (char.id === playerId) continue; // 跳过玩家

    const armies = milStore.getArmiesByOwner(char.id);
    const controlledZhou = getControlledZhou(char.id, terrStore.territories);

    if (controlledZhou.length === 0) continue; // 无地角色跳过

    // 1. 建军
    aiCreateArmy(char, armies, controlledZhou);

    // 2. 换将（重新获取军队列表，可能刚建了新军）
    const armiesAfterCreate = milStore.getArmiesByOwner(char.id);
    aiFillCommanders(char, armiesAfterCreate);

    // 3. 调营
    const armiesAfterCommander = milStore.getArmiesByOwner(char.id);
    aiRebalanceBattalions(char, armiesAfterCommander);

    // 4. 裁营
    const armiesAfterRebalance = milStore.getArmiesByOwner(char.id);
    aiDisbandBattalions(char, armiesAfterRebalance);
  }
}
