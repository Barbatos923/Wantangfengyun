// ===== "外放内调"交互：京官 ↔ 有地臣属调任 =====
//
// 有地者可能拒绝（发动独立战争），类似剥夺领地。
// 成功则京官继承领地/臣属/军队/副岗，有地者接任京官职位。
// 不产生好感变化（拒绝除外）。

import type { Character } from '@engine/character/types';
import type { Post } from '@engine/territory/types';
import { registerInteraction } from './registry';
import { debugLog } from '@engine/debugLog';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { positionMap } from '@data/positions';
import { random } from '@engine/random';
import { getArmyStrength } from '@engine/military/militaryCalc';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { calcPersonality } from '@engine/character/personalityUtils';
import { findEmperorId } from '@engine/official/postQueries';
import { getEffectiveMinRank } from '@engine/official/selectionCalc';
import { getCentralCandidates } from '@engine/official/reassignCalc';
import type { ReassignCandidate } from '@engine/official/reassignCalc';
import { executeDeclareWar } from './declareWarAction';
import {
  seatPost,
  vacatePost,
  syncArmyForPost,
  cascadeSecondaryOverlord,
  cascadeChildOverlord,
  capitalZhouSeat,
  refreshPostCaches,
  refreshLegitimacyForChar,
} from '@engine/official/postTransfer';
import { findAppointRightHolder } from '@engine/character/successionUtils';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import {
  isCentralOfficial,
  getCentralPostsHeld,
  getCentralRankRange,
  calcReassignChance,
} from '@engine/official/reassignCalc';

// ── 注册交互 ──────────────────────────────────────────────

registerInteraction({
  id: 'reassign',
  name: '外放内调',
  icon: '🔀',
  canShow: (player, target) => {
    // 宽松：player 是皇帝或宰相
    if (!target.alive || !target.official) return false;
    if (!player.official) return false;
    const terrStore = useTerritoryStore.getState();
    const { territories, centralPosts } = terrStore;
    const emperorId = findEmperorId(territories, centralPosts);
    const isEmperor = player.id === emperorId;
    const isChancellor = centralPosts.some(p => p.templateId === 'pos-zaixiang' && p.holderId === player.id);
    return isEmperor || isChancellor;
  },
  canExecuteCheck: (player, target) => {
    if (canReassign(player, target)) return null;
    const terrStore = useTerritoryStore.getState();
    const targetIsCentral = isCentralOfficial(target.id, terrStore.territories, terrStore.centralPosts);
    if (!targetIsCentral) {
      const emperorId = findEmperorId(terrStore.territories, terrStore.centralPosts);
      const targetIsTerritorial = isEligibleTerritorial(target.id, terrStore.territories, terrStore.centralPosts, emperorId);
      if (!targetIsTerritorial) return '非京官或非可调臣属';
    }
    return '无合适候选人';
  },
  paramType: 'reassign',
});

// ── canShow 严格版 ──────────────────────────────────────────────

function canReassign(player: Character, target: Character): boolean {
  if (!target.alive || !target.official) return false;
  if (!player.official) return false;

  const terrStore = useTerritoryStore.getState();
  const territories = terrStore.territories;
  const centralPosts = terrStore.centralPosts;

  const emperorId = findEmperorId(territories, centralPosts);
  const isEmperor = player.id === emperorId;
  const isChancellor = centralPosts.some(p => p.templateId === 'pos-zaixiang' && p.holderId === player.id);
  if (!isEmperor && !isChancellor) return false;

  // 双向入口：target 可以是京官或有地臣属
  const targetIsCentral = isCentralOfficial(target.id, territories, centralPosts);
  const targetIsTerritorial = isEligibleTerritorial(target.id, territories, centralPosts, emperorId);

  if (!targetIsCentral && !targetIsTerritorial) return false;

  // 存在配对候选人（廉价检查，不做全量候选人生成）
  if (targetIsCentral) {
    // 京官 → 检查皇帝是否有可调任的有地直属臣属
    return hasAnyTerritorialVassal(emperorId, territories);
  } else {
    // 有地者 → 检查是否存在品级匹配的京官
    return hasAnyCentralCandidate(target.id, territories, centralPosts);
  }
}

/** 判断角色是否为可被内调的有地臣属 */
function isEligibleTerritorial(
  charId: string,
  territories: Map<string, import('@engine/territory/types').Territory>,
  _centralPosts: Post[],
  emperorId: string | null,
): boolean {
  if (!emperorId) return false;

  const char = useCharacterStore.getState().getCharacter(charId);
  if (!char?.alive || !char.official) return false;
  if (char.overlordId !== emperorId) return false; // 须为皇帝直接臣属

  // 须持有 grantsControl 岗位，且任一岗位有辟署权则整体保护
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(charId);
  let hasControlPost = false;
  for (const p of posts) {
    const tpl = positionMap.get(p.templateId);
    if (!tpl?.grantsControl || !p.territoryId) continue;
    hasControlPost = true;
    // 任一岗位有辟署权 → 整体不可调任
    if (p.hasAppointRight) return false;
    const rightHolder = findAppointRightHolder(p.territoryId, territories);
    if (rightHolder) return false;
  }
  return hasControlPost;
}

// ── canShow 廉价检查 ──────────────────────────────────────

/** 皇帝是否有至少一个可调任的有地直属臣属（无辟署权保护） */
function hasAnyTerritorialVassal(
  emperorId: string | null,
  territories: Map<string, import('@engine/territory/types').Territory>,
): boolean {
  if (!emperorId) return false;
  const charStore = useCharacterStore.getState();
  const vassals = charStore.getVassalsByOverlord(emperorId);
  for (const v of vassals) {
    if (!v.alive) continue;
    const terrStore = useTerritoryStore.getState();
    const posts = terrStore.getPostsByHolder(v.id);
    for (const p of posts) {
      const tpl = positionMap.get(p.templateId);
      if (!tpl?.grantsControl || !p.territoryId) continue;
      if (p.hasAppointRight) continue;
      const rh = findAppointRightHolder(p.territoryId, territories);
      if (!rh) return true; // 找到一个即可
    }
  }
  return false;
}

/** 是否存在品级匹配的京官（从 centralPosts 入手，O(centralPosts) 而非 O(characters)） */
function hasAnyCentralCandidate(
  territorialCharId: string,
  _territories: Map<string, import('@engine/territory/types').Territory>,
  centralPosts: Post[],
): boolean {
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(territorialCharId);
  let tier: string | undefined;
  for (const p of posts) {
    const tpl = positionMap.get(p.templateId);
    if (tpl?.grantsControl && tpl.tier) { tier = tpl.tier; break; }
  }
  if (!tier) return false;

  const [minRank, maxRank] = getCentralRankRange(tier);

  for (const cp of centralPosts) {
    if (!cp.holderId) continue;
    const cpTpl = positionMap.get(cp.templateId);
    if (!cpTpl || cpTpl.scope !== 'central') continue;
    const cpRank = cpTpl.minRank;
    if (cpRank < minRank || cpRank > maxRank) continue;
    // 持有人不能有 grantsControl 岗位
    const holderPosts = terrStore.getPostsByHolder(cp.holderId);
    const hasControl = holderPosts.some(p => positionMap.get(p.templateId)?.grantsControl);
    if (!hasControl) return true;
  }
  return false;
}

// ── 预览成功率 ──────────────────────────────────────────

/** UI 用：预览调任成功率 */
export function previewReassignChance(
  actorId: string,
  territorialId: string,
): number {
  const charStore = useCharacterStore.getState();
  const actor = charStore.getCharacter(actorId);
  const target = charStore.getCharacter(territorialId);
  if (!actor || !target) return 50;

  const terrState = useTerritoryStore.getState();
  const bExpectedLeg = terrState.expectedLegitimacy.get(actorId) ?? null;
  const opinion = calculateBaseOpinion(
    target, actor, bExpectedLeg,
    terrState.policyOpinionCache.get(territorialId) ?? null,
  );
  const personality = calcPersonality(target);

  return calcReassignChance(
    opinion,
    getTotalStrength(actorId),
    getTotalStrength(territorialId),
    actor.official?.rankLevel ?? 0,
    target.official?.rankLevel ?? 0,
    actor.resources.legitimacy,
    personality,
  );
}

function getTotalStrength(charId: string): number {
  const milStore = useMilitaryStore.getState();
  const armies = milStore.getArmiesByOwner(charId);
  let total = 0;
  for (const army of armies) {
    total += getArmyStrength(army, milStore.battalions);
  }
  return total;
}

// ── 执行调任 ──────────────────────────────────────────────

/**
 * 执行调任（含骰子判定）。
 * @param territorialPostId 有地者的目标 grantsControl 岗位 ID
 * @param replacementId 京官角色 ID
 * @param appointerId 法理主体（皇帝 ID）
 * @returns true=成功, false=拒绝（独立战争）
 */
/**
 * 调任失败分支：好感惩罚 + 独立战争。
 * 独立导出供 behavior 在玩家拒绝调任时直接调用。
 */
export function executeReassignRebel(
  territorialId: string,
  appointerId: string,
): void {
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;
  charStore.addOpinion(territorialId, appointerId, {
    reason: '强制调任',
    value: -30,
    decayable: true,
  });
  executeDeclareWar(
    territorialId,
    appointerId,
    'independence',
    [],
    date,
    { prestige: 0, legitimacy: 0 },
  );
}

/**
 * 调任成功分支：京官接管有地者全部领地/臣属/军队，有地者接任京官职位。
 * 独立导出供 behavior 在玩家接受调任时直接调用。
 */
export function executeReassignSuccess(
  territorialPostId: string,
  replacementId: string,
  appointerId: string,
): void {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;

  const targetPost = terrStore.findPost(territorialPostId);
  if (!targetPost?.holderId) return;

  const territorialId = targetPost.holderId;
  const replacement = charStore.getCharacter(replacementId);
  if (!replacement) return;

  // 1. 记录快照
  const centralPostsHeld = getCentralPostsHeld(replacementId, terrStore.territories, terrStore.centralPosts);
  const bestCentralPost = centralPostsHeld.reduce<Post | undefined>((best, p) =>
    !best || getEffectiveMinRank(p) > getEffectiveMinRank(best) ? p : best,
  undefined);

  // 2. 收集有地者的所有 grantsControl 岗位（排除治所州，治所随道级联动）
  const capitalZhouIds = new Set<string>();
  for (const t of terrStore.territories.values()) {
    if (t.tier === 'dao' && t.capitalZhouId) capitalZhouIds.add(t.capitalZhouId);
  }

  const allControlPosts = terrStore.getPostsByHolder(territorialId)
    .filter(p => {
      const pTpl = positionMap.get(p.templateId);
      if (!pTpl?.grantsControl || !p.territoryId) return false;
      if (capitalZhouIds.has(p.territoryId)) return false;
      return true;
    });

  // 3. 有地者交出所有领地 → 全部空缺
  for (const p of allControlPosts) {
    vacatePost(p.id);
  }

  // 4. 京官交出中央岗位（若有）
  if (bestCentralPost) {
    vacatePost(bestCentralPost.id);
  }

  // 5. 京官就任所有领地岗位（继承有地者的全部直辖领地）
  const targetFirst = [
    allControlPosts.find(p => p.id === territorialPostId),
    ...allControlPosts.filter(p => p.id !== territorialPostId),
  ].filter(Boolean) as Post[];

  let overlordSet = false;
  for (const p of targetFirst) {
    const pTpl = positionMap.get(p.templateId);
    const pExtra: Partial<Post> = {};
    if (p.successionLaw === 'bureaucratic') {
      const terr = p.territoryId ? terrStore.territories.get(p.territoryId) : undefined;
      pExtra.reviewBaseline = {
        population: terr?.basePopulation ?? 0,
        virtue: replacement.official?.virtue ?? 0,
        date: { year: date.year, month: date.month, day: date.day },
      };
    }
    seatPost(p.id, replacementId, appointerId, date, pExtra);
    syncArmyForPost(p.id, replacementId);

    if (pTpl?.grantsControl && p.territoryId) {
      cascadeSecondaryOverlord(p.territoryId, replacementId);
      cascadeChildOverlord(p.territoryId, replacementId, territorialId);

      // 治所联动
      const freshTerrStore = useTerritoryStore.getState();
      const dao = freshTerrStore.territories.get(p.territoryId);
      if (dao?.capitalZhouId) {
        const capitalZhou = freshTerrStore.territories.get(dao.capitalZhouId);
        let capitalExtra: Partial<Post> | undefined;
        if (capitalZhou) {
          const capPost = capitalZhou.posts.find(cp => positionMap.get(cp.templateId)?.grantsControl === true);
          if (capPost?.successionLaw === 'bureaucratic') {
            capitalExtra = {
              reviewBaseline: {
                population: capitalZhou.basePopulation,
                virtue: replacement.official?.virtue ?? 0,
                date: { year: date.year, month: date.month, day: date.day },
              },
            };
          }
        }
        capitalZhouSeat(p.territoryId, replacementId, appointerId, date, {
          checkCanTake: true,
          extra: capitalExtra,
        });
        cascadeSecondaryOverlord(dao.capitalZhouId, replacementId);
      }
    }

    // 首个岗位（目标岗位）决定 overlordId
    if (!overlordSet && pTpl?.grantsControl && p.territoryId) {
      let effectiveOverlord = appointerId;
      const freshTerrStore = useTerritoryStore.getState();
      const terr = freshTerrStore.territories.get(p.territoryId);
      if (terr?.parentId) {
        const parent = freshTerrStore.territories.get(terr.parentId);
        if (parent) {
          const parentMainPost = parent.posts.find(pp => positionMap.get(pp.templateId)?.grantsControl);
          if (parentMainPost?.holderId) effectiveOverlord = parentMainPost.holderId;
        }
      }
      if (replacementId !== effectiveOverlord) {
        charStore.updateCharacter(replacementId, { overlordId: effectiveOverlord });
      }
      overlordSet = true;
    }
  }

  // 5. 有地者接任中央岗位（若有）
  if (bestCentralPost) {
    seatPost(bestCentralPost.id, territorialId, appointerId, date);
  }

  // 6. 有地者 overlordId → appointer
  if (territorialId !== appointerId) {
    charStore.updateCharacter(territorialId, { overlordId: appointerId });
  }

  // 7. 正统性刷新
  refreshLegitimacyForChar(replacementId);

  // 8. 无好感变化

  // 9. 缓存刷新
  refreshPostCaches([replacementId, territorialId]);

  // 10. 史书 emit
  {
    const appointer = charStore.getCharacter(appointerId);
    const territorial = charStore.getCharacter(territorialId);
    emitChronicleEvent({
      type: '调任',
      actors: [appointerId, territorialId, replacementId],
      territories: [],
      description: `${appointer?.name ?? '?'}调${territorial?.name ?? '?'}入朝，以${replacement.name}代领其地`,
    });
  }
}

/**
 * executeReassign 返回值：
 * - 'success'：调任成功落地
 * - 'rebel'：有地者抗命，触发独立战争
 * - 'stale'：弹窗资格快照已过期，未执行任何状态变更（候选人/岗位/资格变化）
 */
export type ReassignExecuteResult = 'success' | 'rebel' | 'stale';

/**
 * @param expectedTerritorialId 调用方在打开弹窗时看到的有地者 ID。如果在确认时
 * 该岗位的 holder 已经不是这个 ID（被战争/继承/调任换成了别人），返回 'stale'，
 * 避免把旧弹窗的操作意图作用到后来新上任的人身上。
 */
export function executeReassign(
  territorialPostId: string,
  replacementId: string,
  appointerId: string,
  expectedTerritorialId: string,
): ReassignExecuteResult {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();

  const targetPost = terrStore.findPost(territorialPostId);
  // 岗位失效或已空缺：不再执行（之前误返 true，会让 SelectionFlow / 提案路径误判成功）
  if (!targetPost?.holderId) return 'stale';
  // holder 已经被换成别人：旧弹窗的目标已经不存在
  if (targetPost.holderId !== expectedTerritorialId) return 'stale';

  const territorialId = targetPost.holderId;
  const territorial = charStore.getCharacter(territorialId);
  const replacement = charStore.getCharacter(replacementId);
  const appointer = charStore.getCharacter(appointerId);
  if (!territorial?.alive || !replacement?.alive || !appointer?.alive) return 'stale';

  // 瞬时重校验：appointer 仍是皇帝/宰相 + 候选人仍合格
  const territories = terrStore.territories;
  const centralPosts = terrStore.centralPosts;
  const emperorId = findEmperorId(territories, centralPosts);
  const isEmperor = appointerId === emperorId;
  const isChancellor = centralPosts.some((p) => p.templateId === 'pos-zaixiang' && p.holderId === appointerId);
  if (!isEmperor && !isChancellor) return 'stale';

  // 候选人 replacement 必须仍在该 post 的合法京官候选集中
  const candidates: ReassignCandidate[] = getCentralCandidates(targetPost, charStore.characters, territories, centralPosts);
  if (!candidates.some((c) => c.character.id === replacementId)) return 'stale';

  // ── 0. 骰子判定 ──
  const bExpectedLeg = terrStore.expectedLegitimacy.get(appointerId) ?? null;
  const opinion = calculateBaseOpinion(
    territorial, appointer, bExpectedLeg,
    terrStore.policyOpinionCache.get(territorialId) ?? null,
  );
  const personality = calcPersonality(territorial);
  const chance = calcReassignChance(
    opinion,
    getTotalStrength(appointerId),
    getTotalStrength(territorialId),
    appointer.official?.rankLevel ?? 0,
    territorial.official?.rankLevel ?? 0,
    appointer.resources.legitimacy,
    personality,
  );

  const success = random() * 100 < chance;

  debugLog('interaction', `[调任] ${appointer.name} 调任 ${territorial.name} → ${replacement.name}（成功率 ${chance}%）→ ${success ? '成功' : '拒绝（独立战争）'}`);

  if (!success) {
    executeReassignRebel(territorialId, appointerId);
    return 'rebel';
  }

  executeReassignSuccess(territorialPostId, replacementId, appointerId);
  return 'success';
}

// ── 宰相提案（NPC 皇帝评估 + 玩家皇帝 StoryEvent） ──────

import { useStoryEventBus } from '@engine/storyEventBus';

export type ReassignProposalResult =
  | { type: 'async' }          // 玩家皇帝审批（StoryEvent 已推送）
  | { type: 'emperor-reject' } // NPC 皇帝驳回
  | { type: 'rebel' }          // 皇帝批准但有地者抗命
  | { type: 'success' };       // 调任成功

/**
 * 宰相提交调任提案。
 * - 皇帝是玩家 → 推 StoryEvent 异步审批
 * - 皇帝是 NPC → 自动评估（成功率 > 40% 批准，否则驳回）
 */
export function submitReassignProposal(
  territorialPostId: string,
  replacementId: string,
  emperorId: string,
  chancellorId: string,
): ReassignProposalResult {
  const charStore = useCharacterStore.getState();
  const playerId = charStore.playerId;

  if (emperorId === playerId) {
    // 玩家是皇帝 → 推 StoryEvent
    const terrStore = useTerritoryStore.getState();
    const post = terrStore.findPost(territorialPostId);
    const territorialId = post?.holderId;
    const territorial = territorialId ? charStore.getCharacter(territorialId) : undefined;
    const replacement = charStore.getCharacter(replacementId);
    const chancellor = charStore.getCharacter(chancellorId);
    const terrName = post?.territoryId ? terrStore.territories.get(post.territoryId)?.name ?? '' : '';
    const postTpl = post ? positionMap.get(post.templateId) : undefined;

    useStoryEventBus.getState().pushStoryEvent({
      id: crypto.randomUUID(),
      title: '宰相提议调任',
      description: `${chancellor?.name ?? '宰相'}提议将${replacement?.name ?? '?'}外放为${terrName}${postTpl?.name ?? ''}，将${territorial?.name ?? '?'}调入京师。`,
      actors: [
        { characterId: emperorId, role: '皇帝' },
        ...(territorialId ? [{ characterId: territorialId, role: '被调任者' }] : []),
        { characterId: replacementId, role: '外放者' },
      ],
      options: [
        {
          label: '准奏',
          description: '批准调任提案',
          effects: [],
          effectKey: 'reassignProposal:approve',
          // 把提案时看到的有地者 ID 写进 effectData，审批落地时用它做 stale 校验
          effectData: { territorialPostId, replacementId, emperorId, expectedTerritorialId: territorialId ?? '' },
          onSelect: () => {
            if (territorialId) executeReassign(territorialPostId, replacementId, emperorId, territorialId);
          },
        },
        {
          label: '驳回',
          description: '否决此提案',
          effects: [],
          effectKey: 'reassignProposal:reject',
          effectData: {},
          onSelect: () => { /* 无操作 */ },
        },
      ],
    });
    return { type: 'async' };
  }

  // 皇帝是 NPC → 骰子判定是否批准（成功率即批准概率）
  const post = useTerritoryStore.getState().findPost(territorialPostId);
  const territorialId = post?.holderId ?? '';
  const chance = previewReassignChance(emperorId, territorialId);
  const approved = random() * 100 < chance;
  const chancellor = useCharacterStore.getState().getCharacter(chancellorId);
  const emperor = useCharacterStore.getState().getCharacter(emperorId);
  debugLog('interaction', `[调任提案] ${chancellor?.name ?? '?'} 提议调任（批准率 ${chance}%）→ 皇帝${emperor?.name ?? '?'} ${approved ? '批准' : '驳回'}`);
  if (!approved) {
    return { type: 'emperor-reject' };
  }
  const result = executeReassign(territorialPostId, replacementId, emperorId, territorialId);
  if (result === 'success') return { type: 'success' };
  if (result === 'rebel') return { type: 'rebel' };
  // stale：候选人/岗位/资格在 NPC 评估期间变化，按 emperor-reject 兜底（语义最接近）
  return { type: 'emperor-reject' };
}
