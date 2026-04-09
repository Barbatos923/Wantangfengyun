// ===== NPC 调任行为（皇帝 + ��相） =====
//
// 皇帝：主动制衡地方，避免尾大不掉。
// 宰相：忠诚者制衡地方，自私者政治斗争外放政敌。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import { calcWeight } from '../types';
import type { Character } from '@engine/character/types';
import { positionMap } from '@data/positions';
import { diffDays } from '@engine/dateUtils';
import { findEmperorId } from '@engine/official/postQueries';
import { findAppointRightHolder } from '@engine/character/successionUtils';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { executeReassign, executeReassignSuccess, executeReassignRebel, previewReassignChance, submitReassignProposal } from '@engine/interaction';
import { useStoryEventBus, type StoryEvent } from '@engine/storyEventBus';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import {
  isCentralOfficial,
  getCentralMaxRank,
  getCentralRankRange,
} from '@engine/official/reassignCalc';
import { registerBehavior } from './index';

// ── 辅助 ──────────────────────────────────────────────

/** 获取角色持有的最高 grantsControl 岗位 */
function getBestControlPost(charId: string, ctx: NpcContext) {
  const postIds = ctx.holderIndex.get(charId);
  if (!postIds) return null;
  let best: { postId: string; territoryId: string; tier: string; appointedDate?: import('@engine/types').GameDate } | null = null;
  for (const pid of postIds) {
    const p = ctx.postIndex.get(pid);
    if (!p?.territoryId) continue;
    const tpl = positionMap.get(p.templateId);
    if (!tpl?.grantsControl) continue;
    if (!best || (tpl.minRank > (positionMap.get(ctx.postIndex.get(best.postId)!.templateId)?.minRank ?? 0))) {
      best = { postId: pid, territoryId: p.territoryId, tier: tpl.tier ?? 'zhou', appointedDate: p.appointedDate };
    }
  }
  return best;
}

/** 获取角色在当前岗位的任职天数 */
function getTenureDays(post: { appointedDate?: import('@engine/types').GameDate }, date: import('@engine/types').GameDate): number {
  if (!post.appointedDate) return 0;
  return diffDays(post.appointedDate, date);
}

/** 在品级匹配的京官中选能力最高者 */
function pickBestCentralCandidate(
  tier: string,
  territoryType: string | undefined,
  _emperorId: string,
  ctx: NpcContext,
): string | null {
  const [minRank, maxRank] = getCentralRankRange(tier);
  const isMilitary = territoryType === 'military';
  let bestId: string | null = null;
  let bestAbility = -1;

  // 从 centralPosts 入手（~50个），而非全量遍历 characters
  const seen = new Set<string>();
  for (const cp of ctx.centralPosts) {
    if (!cp.holderId || seen.has(cp.holderId)) continue;
    seen.add(cp.holderId);
    const cpTpl = positionMap.get(cp.templateId);
    if (!cpTpl || cpTpl.scope !== 'central') continue;
    const char = ctx.characters.get(cp.holderId);
    if (!char?.alive || !char.official) continue;
    if (!isCentralOfficial(char.id, ctx.territories, ctx.centralPosts)) continue;
    const rank = getCentralMaxRank(char.id, ctx.territories, ctx.centralPosts);
    if (rank < minRank || rank > maxRank) continue;
    const ability = isMilitary ? char.abilities.military : char.abilities.administration;
    if (ability > bestAbility) {
      bestAbility = ability;
      bestId = char.id;
    }
  }
  return bestId;
}

// ── 皇帝调任行为 ──────────────────────────────────────

interface EmperorReassignData {
  territorialPostId: string;
  replacementId: string;
}

export const emperorReassignBehavior: NpcBehavior<EmperorReassignData> = {
  id: 'emperor-reassign',
  requiredTemplateIds: ['pos-emperor'],
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<EmperorReassignData> | null {
    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    // 已在战争中不调任
    if (ctx.activeWars.some(w => isWarParticipant(actor.id, w))) return null;

    let bestWeight = 0;
    let bestData: EmperorReassignData | null = null;

    // 扫描皇帝直接臣属中的有地者
    const vassals = ctx.vassalIndex.get(actor.id);
    if (!vassals) return null;

    for (const vassalId of vassals) {
      const vassal = ctx.characters.get(vassalId);
      if (!vassal?.alive || !vassal.official) continue;

      const controlPost = getBestControlPost(vassalId, ctx);
      if (!controlPost) continue;

      // 排除辟署权持有者
      const post = ctx.postIndex.get(controlPost.postId);
      if (!post || post.hasAppointRight) continue;
      const rightHolder = findAppointRightHolder(controlPost.territoryId, ctx.territories);
      if (rightHolder) continue;

      // 排除战争中的臣属
      if (ctx.activeWars.some(w => isWarParticipant(vassalId, w))) continue;

      const tpl = positionMap.get(post.templateId);
      if (!tpl) continue;

      // 找匹配京官
      const replacementId = pickBestCentralCandidate(controlPost.tier, tpl.territoryType, actor.id, ctx);
      if (!replacementId) continue;

      // ── 权重计算 ──
      const modifiers: WeightModifier[] = [
        { label: '基础', add: -5 },
      ];

      // 任职时间：超过 5 年（1825 天）加分
      const tenure = getTenureDays(controlPost, ctx.date);
      if (tenure > 1825) modifiers.push({ label: '长期任职', add: 15 });
      else if (tenure > 1095) modifiers.push({ label: '任职超三年', add: 5 });

      // 好感偏低
      const opinion = ctx.getOpinion(vassalId, actor.id);
      if (opinion < -20) modifiers.push({ label: '不满', add: 15 });
      else if (opinion < 0) modifiers.push({ label: '好感偏低', add: 10 });

      // 军力强大（> 皇帝 × 0.5）
      const vassalStr = ctx.getMilitaryStrength(vassalId);
      const emperorStr = ctx.getMilitaryStrength(actor.id);
      if (vassalStr > emperorStr * 0.5) {
        modifiers.push({ label: '军力强大', add: 10 });
      }

      // 皇帝性格
      modifiers.push({ label: '理性', add: personality.rationality * 8 });
      modifiers.push({ label: '多疑', add: personality.vengefulness * 10 });
      modifiers.push({ label: '勤奋', add: personality.energy * 8 });
      modifiers.push({ label: '慈悲抑制', add: -personality.compassion * 8 });

      // 成功率极低时放弃
      const chance = previewReassignChance(actor.id, vassalId);
      if (chance < 30) modifiers.push({ label: '成功率过低', factor: 0 });

      const weight = calcWeight(modifiers);
      if (weight > bestWeight) {
        bestWeight = weight;
        bestData = { territorialPostId: controlPost.postId, replacementId };
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: EmperorReassignData, ctx: NpcContext): void {
    const terrStore = useTerritoryStore.getState();
    const post = terrStore.findPost(data.territorialPostId);
    const territorialId = post?.holderId;

    // ── 玩家是地方官（被调任者）→ 双选项 ──
    if (territorialId && territorialId === ctx.playerId) {
      const terrName = post?.territoryId ? (terrStore.territories.get(post.territoryId)?.name ?? '') : '';
      const postTpl = post ? positionMap.get(post.templateId) : undefined;
      const replacementName = ctx.characters.get(data.replacementId)?.name ?? '???';
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '被调任',
        description: `${actor.name}下令将你调入京师，由${replacementName}接替你的${terrName}${postTpl?.name ?? ''}。`,
        actors: [
          { characterId: actor.id, role: '皇帝' },
          { characterId: territorialId, role: '你' },
          { characterId: data.replacementId, role: '接替者' },
        ],
        options: [
          {
            label: '服从调任',
            description: '交出领地，入京任职。',
            effects: [],
            effectKey: 'reassign:serve',
            effectData: { territorialPostId: data.territorialPostId, replacementId: data.replacementId, emperorId: actor.id },
            onSelect: () => {
              executeReassignSuccess(data.territorialPostId, data.replacementId, actor.id);
            },
          },
          {
            label: '抗命不从',
            description: '拒绝调任，发动独立战争。',
            effects: [
              { label: '好感', value: -30, type: 'negative' },
            ],
            effectKey: 'reassign:rebel',
            effectData: { playerId: ctx.playerId!, emperorId: actor.id },
            onSelect: () => {
              executeReassignRebel(ctx.playerId!, actor.id);
            },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    // ── 玩家是京官（被外放者）→ 先执行，成功则纯通知 ──
    if (data.replacementId === ctx.playerId) {
      // territorialId 必须存在（前面已经 narrow 过 post 持有者非玩家分支）
      if (!territorialId) return;
      const result = executeReassign(data.territorialPostId, data.replacementId, actor.id, territorialId);
      if (result === 'success') {
        const freshTerrStore = useTerritoryStore.getState();
        const freshPost = freshTerrStore.findPost(data.territorialPostId);
        const terrName = freshPost?.territoryId ? (freshTerrStore.territories.get(freshPost.territoryId)?.name ?? '') : '';
        const postTpl = freshPost ? positionMap.get(freshPost.templateId) : undefined;
        const event: StoryEvent = {
          id: crypto.randomUUID(),
          title: '外放任职',
          description: `${actor.name}将你外放为${terrName}${postTpl?.name ?? ''}。`,
          actors: [
            { characterId: actor.id, role: '皇帝' },
            { characterId: data.replacementId, role: '你' },
          ],
          options: [
            {
              label: '知悉',
              description: '赴任就职。',
              effects: [],
              effectKey: 'noop:notification',
              onSelect: () => { /* 已执行 */ },
            },
          ],
        };
        useStoryEventBus.getState().pushStoryEvent(event);
      }
      return;
    }

    // ── 无关玩家 → 正常执行 ──
    if (territorialId) {
      executeReassign(data.territorialPostId, data.replacementId, actor.id, territorialId);
    }
  },
};

registerBehavior(emperorReassignBehavior);

// ── 宰相调任行为 ─────────────────────��────────────────

interface ChancellorReassignData {
  territorialPostId: string;
  replacementId: string;
  territorialId: string;
}

export const chancellorReassignBehavior: NpcBehavior<ChancellorReassignData> = {
  id: 'chancellor-reassign',
  requiredTemplateIds: ['pos-zaixiang'],
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<ChancellorReassignData> | null {
    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    const emperorId = findEmperorId(ctx.territories, ctx.centralPosts);
    if (!emperorId) return null;

    // 宰相自己不能在战争中
    if (ctx.activeWars.some(w => isWarParticipant(actor.id, w))) return null;

    let bestWeight = 0;
    let bestData: ChancellorReassignData | null = null;

    // 扫描皇帝直接臣属
    const vassals = ctx.vassalIndex.get(emperorId);
    if (!vassals) return null;

    for (const vassalId of vassals) {
      const vassal = ctx.characters.get(vassalId);
      if (!vassal?.alive || !vassal.official) continue;

      const controlPost = getBestControlPost(vassalId, ctx);
      if (!controlPost) continue;

      const post = ctx.postIndex.get(controlPost.postId);
      if (!post || post.hasAppointRight) continue;
      const rightHolder = findAppointRightHolder(controlPost.territoryId, ctx.territories);
      if (rightHolder) continue;

      if (ctx.activeWars.some(w => isWarParticipant(vassalId, w))) continue;

      const tpl = positionMap.get(post.templateId);
      if (!tpl) continue;

      const replacementId = pickBestCentralCandidate(controlPost.tier, tpl.territoryType, emperorId, ctx);
      if (!replacementId) continue;

      // ── 权重计算 ──
      const modifiers: WeightModifier[] = [
        { label: '基础', add: -8 },
      ];

      // 忠诚/荣誉型宰相：制衡地方（类似皇帝逻辑）
      const tenure = getTenureDays(controlPost, ctx.date);
      if (tenure > 1825) modifiers.push({ label: '长期任职', add: 10 });

      const opinion = ctx.getOpinion(vassalId, emperorId);
      if (opinion < 0) modifiers.push({ label: '对朝廷不满', add: 8 });

      modifiers.push({ label: '荣誉', add: personality.honor * 8 });
      modifiers.push({ label: '理性', add: personality.rationality * 6 });

      // 自私/贪婪型宰相：政治斗争
      const chancellorOpinion = ctx.getOpinion(actor.id, vassalId);
      if (chancellorOpinion < -20) {
        modifiers.push({ label: '政敌', add: 15 });
      }
      modifiers.push({ label: '贪婪', add: personality.greed * 8 });

      // 成功率评估（宰相会考虑皇帝是否会批准+有地者是否会拒绝）
      const chance = previewReassignChance(emperorId, vassalId);
      if (chance < 40) modifiers.push({ label: '成功率偏低', factor: 0.3 });

      const weight = calcWeight(modifiers);
      if (weight > bestWeight) {
        bestWeight = weight;
        bestData = { territorialPostId: controlPost.postId, replacementId, territorialId: vassalId };
      }
    }

    if (!bestData || bestWeight <= 0) return null;

    return { data: bestData, weight: bestWeight };
  },

  executeAsNpc(actor: Character, data: ChancellorReassignData, ctx: NpcContext): void {
    const emperorId = findEmperorId(ctx.territories, ctx.centralPosts);
    if (!emperorId) return;

    // ── 玩家是地方官（被调任者）→ 双选项 ──
    if (data.territorialId === ctx.playerId) {
      const terrStore = useTerritoryStore.getState();
      const post = terrStore.findPost(data.territorialPostId);
      const terrName = post?.territoryId ? (terrStore.territories.get(post.territoryId)?.name ?? '') : '';
      const postTpl = post ? positionMap.get(post.templateId) : undefined;
      const replacementName = ctx.characters.get(data.replacementId)?.name ?? '???';
      const emperorName = ctx.characters.get(emperorId)?.name ?? '???';
      const event: StoryEvent = {
        id: crypto.randomUUID(),
        title: '被调任',
        description: `经${actor.name}提议，${emperorName}下令将你调入京师，由${replacementName}接替你的${terrName}${postTpl?.name ?? ''}。`,
        actors: [
          { characterId: emperorId, role: '皇帝' },
          { characterId: actor.id, role: '宰相' },
          { characterId: data.territorialId, role: '你' },
          { characterId: data.replacementId, role: '接替者' },
        ],
        options: [
          {
            label: '服从调任',
            description: '交出领地，入京任职。',
            effects: [],
            effectKey: 'reassign:serve',
            effectData: { territorialPostId: data.territorialPostId, replacementId: data.replacementId, emperorId },
            onSelect: () => {
              executeReassignSuccess(data.territorialPostId, data.replacementId, emperorId);
            },
          },
          {
            label: '抗命不从',
            description: '拒绝调任，发动独立战争。',
            effects: [
              { label: '好感', value: -30, type: 'negative' },
            ],
            effectKey: 'reassign:rebel',
            effectData: { playerId: ctx.playerId!, emperorId },
            onSelect: () => {
              executeReassignRebel(ctx.playerId!, emperorId);
            },
          },
        ],
      };
      useStoryEventBus.getState().pushStoryEvent(event);
      return;
    }

    // ── 玩家是京官（被外放者）→ 走提案流程，成功则纯通知 ──
    if (data.replacementId === ctx.playerId) {
      const result = submitReassignProposal(data.territorialPostId, data.replacementId, emperorId, actor.id);
      if (result.type === 'success') {
        const freshTerrStore = useTerritoryStore.getState();
        const freshPost = freshTerrStore.findPost(data.territorialPostId);
        const terrName = freshPost?.territoryId ? (freshTerrStore.territories.get(freshPost.territoryId)?.name ?? '') : '';
        const postTpl = freshPost ? positionMap.get(freshPost.templateId) : undefined;
        const event: StoryEvent = {
          id: crypto.randomUUID(),
          title: '外放任职',
          description: `经${actor.name}提议，你被外放为${terrName}${postTpl?.name ?? ''}。`,
          actors: [
            { characterId: actor.id, role: '宰相' },
            { characterId: data.replacementId, role: '你' },
          ],
          options: [
            {
              label: '知悉',
              description: '赴任就职。',
              effects: [],
              effectKey: 'noop:notification',
              onSelect: () => { /* 已执行 */ },
            },
          ],
        };
        useStoryEventBus.getState().pushStoryEvent(event);
      }
      return;
    }

    // ── 无关玩家 → 统一走提案流程 ──
    submitReassignProposal(data.territorialPostId, data.replacementId, emperorId, actor.id);
  },
};

registerBehavior(chancellorReassignBehavior);
