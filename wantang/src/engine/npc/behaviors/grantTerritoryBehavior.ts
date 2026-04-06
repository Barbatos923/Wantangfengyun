// ===== NPC 授予直辖领地行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult } from '../types';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { getDirectControlLimit, getVassals } from '@engine/official/postQueries';
import { canGrantTerritory } from '@engine/official/appointValidation';
import { executeAppoint, executeToggleSuccession, executeToggleAppointRight } from '@engine/interaction';
import { autoTransferChildrenAfterAppoint } from '@engine/official/postTransfer';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { registerBehavior } from './index';

// ── 辅助：从 ctx 快照获取直辖州 ────────────────────────────

function getControlledZhouFromCtx(
  charId: string,
  territories: Map<string, Territory>,
): Territory[] {
  const result: Territory[] = [];
  for (const t of territories.values()) {
    if (t.tier !== 'zhou') continue;
    const mainPost = t.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (mainPost?.holderId === charId) {
      result.push(t);
    }
  }
  return result;
}

// ── 辅助：从 ctx 快照获取直辖道 ────────────────────────────

function getControlledDaoFromCtx(
  charId: string,
  territories: Map<string, Territory>,
): Territory[] {
  const result: Territory[] = [];
  for (const t of territories.values()) {
    if (t.tier !== 'dao') continue;
    const mainPost = t.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (mainPost?.holderId === charId) {
      result.push(t);
    }
  }
  return result;
}

// ── 辅助：选择最佳受赠者（好感 + 能力综合评分） ────────────

function pickBestVassal(
  actor: Character,
  ctx: NpcContext,
): Character | null {
  const vassals = getVassals(actor.id, ctx.characters);
  const candidates = vassals.filter(v => v.alive && v.official);
  if (candidates.length === 0) return null;

  let best: Character | null = null;
  let bestScore = -Infinity;

  for (const v of candidates) {
    const opinion = ctx.getOpinion(actor.id, v.id);
    const abilities = getEffectiveAbilities(v);
    // 综合评分：好感（归一化到 0-1）+ 属性总和（归一化到 0-1）
    // 好感范围约 -100~100，属性总和约 0~150（5项×30）
    const opinionScore = (opinion + 100) / 200;      // 0~1
    const totalAbility = abilities.military + abilities.administration + abilities.strategy + abilities.diplomacy + abilities.scholarship;
    const abilityScore = totalAbility / 150;           // 0~1
    const score = opinionScore * 0.6 + abilityScore * 0.4;

    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }

  return best;
}

// ── 辅助：选择授出的州（优先流官/无辟署权 + 人口低） ─────────────

function pickZhouToGrant(
  actor: Character,
  directZhou: Territory[],
  territories: Map<string, Territory>,
): { territory: Territory; postId: string } | null {
  // 综合评分：低分优先授出
  const scored: { territory: Territory; postId: string; score: number }[] = [];

  for (const zhou of directZhou) {
    const check = canGrantTerritory(actor, zhou.id, territories as Map<string, Territory>);
    if (!check.ok) continue;

    const mainPost = zhou.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (!mainPost) continue;

    let score = 0;
    // 流官优先授出（宗法留着更值钱）
    if (mainPost.successionLaw === 'bureaucratic') score -= 100;
    // 无辟署权优先授出
    if (!mainPost.hasAppointRight) score -= 50;
    // 人口低的优先授出
    score += zhou.basePopulation;

    scored.push({ territory: zhou, postId: mainPost.id, score });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.length > 0 ? { territory: scored[0].territory, postId: scored[0].postId } : null;
}

// ── 辅助：选择授出的道（人口低优先） ─────────────

function pickDaoToGrant(
  directDao: Territory[],
): { territory: Territory; postId: string } | null {
  const scored: { territory: Territory; postId: string; score: number }[] = [];

  for (const dao of directDao) {
    const mainPost = dao.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (!mainPost) continue;

    // 人口低的优先授出
    scored.push({ territory: dao, postId: mainPost.id, score: dao.basePopulation });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.length > 0 ? { territory: scored[0].territory, postId: scored[0].postId } : null;
}

// ── 行为定义 ────────────────────────────────────────────────

interface GrantTerritoryData {
  postId: string;
  vassalId: string;
  territoryName: string;
}

export const grantTerritoryBehavior: NpcBehavior<GrantTerritoryData> = {
  id: 'grantTerritory',
  playerMode: 'skip', // 玩家从交互菜单自行操作
  schedule: 'daily',  // 超额是紧急问题，每天检测

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<GrantTerritoryData> | null {
    if (!actor.isRuler) return null;

    const directZhou = getControlledZhouFromCtx(actor.id, ctx.territories);
    const limit = getDirectControlLimit(actor);

    // 仅在州超额时触发
    if (directZhou.length <= limit) return null;

    // 选择受赠臣属
    const vassal = pickBestVassal(actor, ctx);
    if (!vassal) return null;

    // 优先选择可授出的州
    const grant = pickZhouToGrant(actor, directZhou, ctx.territories);
    if (grant) {
      return {
        data: {
          postId: grant.postId,
          vassalId: vassal.id,
          territoryName: grant.territory.name,
        },
        weight: 100,
      };
    }

    // 所有州都是治所州无法授出 → 兜底授道（连带治所州一起转出）
    const directDao = getControlledDaoFromCtx(actor.id, ctx.territories);
    const daoGrant = pickDaoToGrant(directDao);
    if (daoGrant) {
      return {
        data: {
          postId: daoGrant.postId,
          vassalId: vassal.id,
          territoryName: daoGrant.territory.name,
        },
        weight: 100,
      };
    }

    return null;
  },

  executeAsNpc(actor: Character, _data: GrantTerritoryData, ctx: NpcContext) {
    const limit = getDirectControlLimit(actor);
    const usedVassals = new Set<string>();

    // ── 第一轮：优先授州 ──
    for (let i = 0; i < 20; i++) {
      const territories = useTerritoryStore.getState().territories;
      const directZhou = getControlledZhouFromCtx(actor.id, territories);
      if (directZhou.length <= limit) return;

      const vassal = pickBestVassal(actor, ctx);
      if (!vassal || usedVassals.has(vassal.id)) break;
      usedVassals.add(vassal.id);

      const grant = pickZhouToGrant(actor, directZhou, territories);
      if (!grant) break; // 所有州都是治所州无法授出，进入第二轮

      // 先改后授：授出前确保流官 + 无辟署权
      const grantPost = useTerritoryStore.getState().findPost(grant.postId);
      if (grantPost) {
        if (grantPost.successionLaw === 'clan') {
          const capitalZhouId = territories.get(grant.territory.id)?.capitalZhouId;
          executeToggleSuccession(grant.postId, capitalZhouId, useTerritoryStore.getState().territories);
          console.log(`[自身政策] ${actor.name}：${grant.territory.name} 授出前改为流官`);
        }
        const freshPost = useTerritoryStore.getState().findPost(grant.postId);
        if (freshPost?.hasAppointRight) {
          executeToggleAppointRight(grant.postId);
          console.log(`[自身政策] ${actor.name}：${grant.territory.name} 授出前收回辟署权`);
        }
      }

      executeAppoint(grant.postId, vassal.id, actor.id);
      autoTransferChildrenAfterAppoint(grant.postId, actor.id);
    }

    // ── 第二轮：所有州都是治所州无法授出 → 兜底授道 ──
    {
      const territories = useTerritoryStore.getState().territories;
      const directZhou = getControlledZhouFromCtx(actor.id, territories);
      if (directZhou.length <= limit) return;

      // 仍然超额，说明剩余州全是治所州，授道来连带释放治所州
      const directDao = getControlledDaoFromCtx(actor.id, territories);
      for (let i = 0; i < 10; i++) {
        const freshTerritories = useTerritoryStore.getState().territories;
        const freshZhou = getControlledZhouFromCtx(actor.id, freshTerritories);
        if (freshZhou.length <= limit) return;

        const freshDao = getControlledDaoFromCtx(actor.id, freshTerritories);
        const vassal = pickBestVassal(actor, ctx);
        if (!vassal || usedVassals.has(vassal.id)) break;
        usedVassals.add(vassal.id);

        const daoGrant = pickDaoToGrant(freshDao);
        if (!daoGrant) break;

        console.log(`[授予领地] ${actor.name}：授予道级领地 ${daoGrant.territory.name} → ${vassal.name}`);
        executeAppoint(daoGrant.postId, vassal.id, actor.id);
        autoTransferChildrenAfterAppoint(daoGrant.postId, actor.id);
      }
    }
  },
};

registerBehavior(grantTerritoryBehavior);
