// ===== NPC 铨选任命行为 =====

import type { NpcBehavior, NpcContext, PlayerTask, TransferEntry } from '../types';
import type { Character } from '@engine/character/types';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useNpcStore } from '../NpcStore';
import {
  getPendingVacancies as getPendingVacanciesConvenience,
  generateCandidates,
  resolveAppointAuthority,
  resolveLegalAppointer,
} from '@engine/official/selectionUtils';
import { getPendingVacancies as getPendingVacanciesPure } from '@engine/official/selectionCalc';
import { registerBehavior } from './index';

// ── 内部实现：拟定调动方案（含连锁） ─────────────────────

/**
 * 为指定经办人拟定一轮完整的调动方案（含连锁）。
 * 纯模拟：不调用 executeAppoint，只返回 TransferEntry[]。
 */
export function planAppointments(npcId: string, sharedUsedIds?: Set<string>): TransferEntry[] {
  const entries: TransferEntry[] = [];
  const usedIds = sharedUsedIds ?? new Set<string>();
  const filledPostIds = new Set<string>();
  const cascadePostIds: string[] = [];

  let vacancies = getPendingVacanciesConvenience(npcId);

  const MAX_ROUNDS = 20;
  let round = 0;

  while (round < MAX_ROUNDS) {
    round++;
    let hadNewEntry = false;

    for (const post of vacancies) {
      if (filledPostIds.has(post.id)) continue;

      const executorId = resolveAppointAuthority(post);
      if (round === 1) {
        if (!executorId || executorId !== npcId) continue;
      } else {
        if (!executorId) continue;
      }

      const legalId = resolveLegalAppointer(executorId, post);
      const candidates = generateCandidates(post, legalId);

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

      if (vacateOldPost && pick.currentPost) {
        if (!filledPostIds.has(pick.currentPost.id)) {
          cascadePostIds.push(pick.currentPost.id);
        }
      }
    }

    if (!hadNewEntry || cascadePostIds.length === 0) break;

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

// ── NpcBehavior 接口适配 ────────────────────────────────

interface AppointData {
  vacancyPostIds: string[];
}

export const appointBehavior: NpcBehavior<AppointData> = {
  id: 'appoint',
  playerMode: 'push-task',

  generateTask(actor: Character, ctx: NpcContext) {
    const vacancies = getPendingVacanciesPure(actor.id, ctx.territories, ctx.centralPosts);
    if (vacancies.length === 0) return null;

    return {
      data: { vacancyPostIds: vacancies.map(v => v.id) },
      weight: 100, // 铨选是高优行政任务
    };
  },

  executeAsNpc(actor: Character, _data: AppointData, ctx: NpcContext) {
    const entries = planAppointments(actor.id, ctx.appointedThisRound);
    if (entries.length === 0) return;

    // 存入 draftPlan，下月呈报
    const npcStore = useNpcStore.getState();
    const existingDraft = npcStore.draftPlan;
    const mergedEntries = existingDraft ? [...existingDraft.entries, ...entries] : entries;
    npcStore.setDraftPlan({ entries: mergedEntries, date: ctx.date });
  },

  generatePlayerTask(_actor: Character, _data: AppointData, _ctx: NpcContext): PlayerTask | null {
    // AlertBar 通过实时空缺计算显示拟定提示，无需额外 PlayerTask
    return null;
  },
};

registerBehavior(appointBehavior);
