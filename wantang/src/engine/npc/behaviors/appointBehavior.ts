// ===== NPC 铨选任命行为 — 拟定调动方案（不执行） =====

import type { TransferEntry } from '../types';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import {
  getPendingVacancies,
  generateCandidates,
  resolveAppointAuthority,
  resolveLegalAppointer,
} from '@engine/official/selectionUtils';


/**
 * 为指定经办人拟定一轮完整的调动方案（含连锁）。
 *
 * 纯模拟：不调用 executeAppoint，只返回 TransferEntry[]。
 * 连锁逻辑：升调/平调会留下新坑，模拟继续填坑直到无新空缺。
 */
export function planAppointments(npcId: string, sharedUsedIds?: Set<string>): TransferEntry[] {
  const entries: TransferEntry[] = [];
  const usedIds = sharedUsedIds ?? new Set<string>();
  const filledPostIds = new Set<string>();
  // 模拟产生的连锁空缺 postId 队列
  const cascadePostIds: string[] = [];

  // 第一轮：从 store 获取真实空缺
  let vacancies = getPendingVacancies(npcId);

  const MAX_ROUNDS = 20;
  let round = 0;

  while (round < MAX_ROUNDS) {
    round++;
    let hadNewEntry = false;

    for (const post of vacancies) {
      if (filledPostIds.has(post.id)) continue;

      // 第一轮：只处理该经办人负责的岗位
      // 连锁轮（round > 1）：跨经办人继续填坑，确保连锁到新授为止
      const executorId = resolveAppointAuthority(post);
      if (round === 1) {
        if (!executorId || executorId !== npcId) continue;
      } else {
        if (!executorId) continue;
      }

      const legalId = resolveLegalAppointer(executorId, post);
      const candidates = generateCandidates(post, legalId);

      // NPC 不会破格任命品位不足的候选人；连锁轮优先选新授（fresh）
      let pick = candidates.find(c => !usedIds.has(c.character.id) && !c.underRank);
      if (round > 1) {
        const freshPick = candidates.find(c => !usedIds.has(c.character.id) && !c.underRank && c.tier === 'fresh');
        if (freshPick) pick = freshPick;
      }
      if (!pick) continue;

      const vacateOldPost = pick.tier === 'promote' || pick.tier === 'transfer';

      entries.push({
        postId: post.id,
        appointeeId: pick.character.id,
        legalAppointerId: legalId,
        vacateOldPost,
        proposedBy: npcId,
      });

      usedIds.add(pick.character.id);
      filledPostIds.add(post.id);
      hadNewEntry = true;

      // 升调/平调 → 预判该候选人当前岗位将空出
      if (vacateOldPost && pick.currentPost) {
        if (!filledPostIds.has(pick.currentPost.id)) {
          cascadePostIds.push(pick.currentPost.id);
        }
      }
    }

    if (!hadNewEntry || cascadePostIds.length === 0) break;

    // 下一轮：处理连锁空缺
    const terrStore = useTerritoryStore.getState();
    vacancies = [];
    for (const pid of cascadePostIds) {
      if (filledPostIds.has(pid)) continue;
      const p = terrStore.findPost(pid);
      if (p) vacancies.push(p);
    }
    cascadePostIds.length = 0;
  }

  return entries;
}
