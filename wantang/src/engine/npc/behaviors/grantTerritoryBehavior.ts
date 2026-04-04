// ===== NPC 授予直辖领地行为 =====

import type { NpcBehavior, NpcContext, BehaviorTaskResult } from '../types';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { getDirectControlLimit, getVassals } from '@engine/official/postQueries';
import { canGrantTerritory } from '@engine/official/appointValidation';
import { executeAppoint } from '@engine/interaction';
import { getEffectiveAbilities } from '@engine/character/characterUtils';
import { registerBehavior } from './index';

// ── 辅助：从 ctx 快照获取直辖州 ────────────────────────────

function getControlledZhouFromCtx(
  charId: string,
  territories: NpcContext['territories'],
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

// ── 辅助：选择授出的州（basePopulation 最低的） ─────────────

function pickZhouToGrant(
  actor: Character,
  directZhou: Territory[],
  territories: NpcContext['territories'],
): { territory: Territory; postId: string } | null {
  // 按 basePopulation 升序，授出最差的
  const sorted = [...directZhou].sort((a, b) => a.basePopulation - b.basePopulation);

  for (const zhou of sorted) {
    // 校验能否授出（至少保留 1 个直辖州）
    const check = canGrantTerritory(actor, zhou.id, territories as Map<string, Territory>);
    if (!check.ok) continue;

    // 找到该州的 grantsControl 岗位
    const mainPost = zhou.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (mainPost) {
      return { territory: zhou, postId: mainPost.id };
    }
  }

  return null;
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

    // 仅在超额时触发
    if (directZhou.length <= limit) return null;

    // 选择受赠臣属
    const vassal = pickBestVassal(actor, ctx);
    if (!vassal) return null;

    // 选择授出哪个州
    const grant = pickZhouToGrant(actor, directZhou, ctx.territories);
    if (!grant) return null;

    return {
      data: {
        postId: grant.postId,
        vassalId: vassal.id,
        territoryName: grant.territory.name,
      },
      weight: 100, // 超额：必定触发
    };
  },

  executeAsNpc(actor: Character, data: GrantTerritoryData, _ctx: NpcContext) {
    executeAppoint(data.postId, data.vassalId, actor.id);
  },
};

registerBehavior(grantTerritoryBehavior);
