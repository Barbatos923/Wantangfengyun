// ===== 战争参战者工具函数（纯函数，不读 Store） =====

import type { War } from './types';

export type WarSide = 'attacker' | 'defender';

/** 是否在攻方阵营（领袖或参战者） */
export function isOnAttackerSide(charId: string, war: War): boolean {
  return charId === war.attackerId || war.attackerParticipants.includes(charId);
}

/** 是否在守方阵营（领袖或参战者） */
export function isOnDefenderSide(charId: string, war: War): boolean {
  return charId === war.defenderId || war.defenderParticipants.includes(charId);
}

/** 是否参与此战争（任一方） */
export function isWarParticipant(charId: string, war: War): boolean {
  return isOnAttackerSide(charId, war) || isOnDefenderSide(charId, war);
}

/** 返回角色所属阵营，不参战则返回 null */
export function getWarSide(charId: string, war: War): WarSide | null {
  if (isOnAttackerSide(charId, war)) return 'attacker';
  if (isOnDefenderSide(charId, war)) return 'defender';
  return null;
}

/** 是否为战争领袖（宣战双方主体） */
export function isWarLeader(charId: string, war: War): boolean {
  return charId === war.attackerId || charId === war.defenderId;
}

/** 返回对方阵营所有角色 ID */
export function getEnemyIds(charId: string, war: War): string[] {
  if (isOnAttackerSide(charId, war)) {
    return [war.defenderId, ...war.defenderParticipants];
  }
  if (isOnDefenderSide(charId, war)) {
    return [war.attackerId, ...war.attackerParticipants];
  }
  return [];
}

/** 返回对方阵营领袖 ID */
export function getPrimaryEnemyId(charId: string, war: War): string | null {
  if (isOnAttackerSide(charId, war)) return war.defenderId;
  if (isOnDefenderSide(charId, war)) return war.attackerId;
  return null;
}

/** 返回己方阵营所有角色 ID（含自身） */
export function getAlliedIds(charId: string, war: War): string[] {
  if (isOnAttackerSide(charId, war)) {
    return [war.attackerId, ...war.attackerParticipants];
  }
  if (isOnDefenderSide(charId, war)) {
    return [war.defenderId, ...war.defenderParticipants];
  }
  return [];
}

/** 返回己方阵营领袖 ID */
export function getOwnLeaderId(charId: string, war: War): string | null {
  if (isOnAttackerSide(charId, war)) return war.attackerId;
  if (isOnDefenderSide(charId, war)) return war.defenderId;
  return null;
}
