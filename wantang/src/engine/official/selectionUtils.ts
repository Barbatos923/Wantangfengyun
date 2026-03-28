// ===== 铨选系统便捷包装（自动注入 Store） =====

import type { Post } from '@engine/territory/types';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import {
  resolveAppointAuthority as _resolveAuth,
  resolveLegalAppointer as _resolveLegal,
  generateCandidates as _genCandidates,
  getPendingVacancies as _getPending,
} from './selectionCalc';
import type { CandidateEntry } from './selectionCalc';
export type { CandidateEntry, CandidateTier } from './selectionCalc';
export { getEffectiveMinRank, HONORARY_TEMPLATES } from './selectionCalc';

/** 确定空缺岗位的铨选经办人（便捷版） */
export function resolveAppointAuthority(post: Post): string | null {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return _resolveAuth(post, territories, centralPosts);
}

/** 推导法理任命主体（便捷版） */
export function resolveLegalAppointer(executorId: string, post: Post): string {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return _resolveLegal(executorId, post, territories, centralPosts);
}

/** 生成候选人池（便捷版）— appointerId 应传法理主体 ID */
export function generateCandidates(vacantPost: Post, appointerId: string): CandidateEntry[] {
  const { territories, centralPosts } = useTerritoryStore.getState();
  const { characters } = useCharacterStore.getState();
  const currentDate = useTurnManager.getState().currentDate;
  return _genCandidates(vacantPost, appointerId, characters, territories, centralPosts, currentDate);
}

/** 获取玩家需处理的空缺岗位（便捷版） */
export function getPendingVacancies(playerId: string): Post[] {
  const { territories, centralPosts } = useTerritoryStore.getState();
  return _getPending(playerId, territories, centralPosts);
}
