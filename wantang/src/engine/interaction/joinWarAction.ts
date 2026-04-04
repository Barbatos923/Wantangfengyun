// ===== 加入战争 / 召集参战 交互 =====

import type { Character } from '@engine/character/types';
import type { War } from '@engine/military/types';
import { useWarStore } from '@engine/military/WarStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { isWarParticipant, getWarSide } from '@engine/military/warParticipantUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { calcPersonality } from '@engine/character/personalityUtils';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { random } from '@engine/random';
import { registerInteraction } from './registry';

// ── 交互注册：干涉战争（领主 → 臣属的战争） ────────────────

registerInteraction({
  id: 'joinWar',
  name: '干涉战争',
  icon: '🛡',
  canShow: (player, target) => getJoinableWars(player, target).length > 0,
  paramType: 'joinWar',
});

// ── 交互注册：召集参战（领袖 → 臣属加入自己的战争） ─────────

registerInteraction({
  id: 'callToArms',
  name: '召集参战',
  icon: '📯',
  canShow: (player, target) => getCallableWars(player, target).length > 0,
  paramType: 'callToArms',
});

// ── 查询：干涉战争（玩家可通过 target 干涉的战争列表） ──────

export interface JoinableWar {
  war: War;
  targetSide: 'attacker' | 'defender';
}

export function getJoinableWars(player: Character, target: Character): JoinableWar[] {
  if (target.overlordId !== player.id) return [];
  const result: JoinableWar[] = [];
  for (const war of useWarStore.getState().getActiveWars()) {
    if (isWarParticipant(player.id, war)) continue;
    const side = getWarSide(target.id, war);
    if (!side) continue;
    result.push({ war, targetSide: side });
  }
  return result;
}

// ── 查询：召集参战（玩家作为领袖的战争中，target 可被召集的） ─

export interface CallableWar {
  war: War;
  side: 'attacker' | 'defender';
}

export function getCallableWars(player: Character, target: Character): CallableWar[] {
  if (target.overlordId !== player.id) return []; // target 必须是玩家的直属臣属
  if (!target.alive || !target.isRuler) return [];

  const result: CallableWar[] = [];
  for (const war of useWarStore.getState().getActiveWars()) {
    // 玩家必须是参战方（领袖或参与者均可召集己方臣属）
    const playerSide = getWarSide(player.id, war);
    if (!playerSide) continue;
    // target 不能已参战
    if (isWarParticipant(target.id, war)) continue;
    // target 不能是对方领袖（独立战争防护）
    if (target.id === war.attackerId || target.id === war.defenderId) continue;
    result.push({ war, side: playerSide });
  }
  return result;
}

// ── 召集参战概率计算（纯函数） ─────────────────────────────

export interface CallToArmsChanceResult {
  chance: number; // 0~100
  breakdown: {
    base: number;
    opinion: number;
    honor: number;
    boldness: number;
  };
}

export function calcCallToArmsChance(
  summonerId: string,
  targetId: string,
): CallToArmsChanceResult {
  const charStore = useCharacterStore.getState();
  const target = charStore.getCharacter(targetId);
  if (!target) return { chance: 50, breakdown: { base: 60, opinion: 0, honor: 0, boldness: 0 } };

  const personality = calcPersonality(target);
  const expLegMap = useTerritoryStore.getState().expectedLegitimacy;
  const summoner = charStore.getCharacter(summonerId);
  if (!summoner) return { chance: 50, breakdown: { base: 60, opinion: 0, honor: 0, boldness: 0 } };
  const opinion = calculateBaseOpinion(target, summoner, expLegMap.get(summonerId) ?? null);

  const base = 60;
  const opinionMod = Math.round(opinion);
  const honorMod = Math.round(personality.honor * 15);
  const boldnessMod = -Math.round(personality.boldness * 10);

  const chance = Math.min(95, Math.max(5, base + opinionMod + honorMod + boldnessMod));

  return {
    chance,
    breakdown: {
      base,
      opinion: opinionMod,
      honor: honorMod,
      boldness: boldnessMod,
    },
  };
}

// ── 执行召集参战 ────────────────────────────────────────────

export interface CallToArmsResult {
  success: boolean;
  targetName: string;
}

export function executeCallToArms(
  summonerId: string,
  targetId: string,
  warId: string,
  side: 'attacker' | 'defender',
): CallToArmsResult {
  const charStore = useCharacterStore.getState();
  const target = charStore.getCharacter(targetId);
  const targetName = target?.name ?? '???';

  const { chance } = calcCallToArmsChance(summonerId, targetId);
  const roll = random() * 100;

  if (roll < chance) {
    executeJoinWar(targetId, warId, side);
    return { success: true, targetName };
  } else {
    charStore.setOpinion(targetId, summonerId, {
      reason: '拒绝参战',
      value: -30,
      decayable: true,
    });
    return { success: false, targetName };
  }
}

// ── 执行加入战争 ────────────────────────────────────────────

export function executeJoinWar(
  charId: string,
  warId: string,
  side: 'attacker' | 'defender',
): boolean {
  const warStore = useWarStore.getState();
  const war = warStore.wars.get(warId);
  if (!war || war.status !== 'active') return false;
  if (isWarParticipant(charId, war)) return false;
  const existingSide = getWarSide(charId, war);
  if (existingSide && existingSide !== side) return false;
  warStore.addParticipant(warId, charId, side);
  return true;
}
