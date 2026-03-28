// ===== 任命校验（纯函数） =====

import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { getActualController, getHeldPosts, getDirectControlledZhou } from './postQueries';
import { findAppointRightHolder } from '@engine/character/successionUtils';
import { getEffectiveMinRank } from './selectionCalc';

/**
 * 检验是否有权将 appointee 任命至指定岗位。
 *
 * 权限模型（辟署权优先）：
 * 1. 辟署权防火墙：若岗位在辟署权领地内，只有辟署权持有人可任命
 * 2. 朝廷直辖：中央岗位皇帝任命，地方岗位按控制者层级判定
 * 3. 自己持有的 grantsControl 岗位可转让
 */
export function canAppointToPost(
  appointer: Character,
  appointee: Character,
  post: Post,
  territories: Map<string, Territory>,
  centralPosts: Post[],
): { ok: boolean; reason?: string } {
  const tpl = positionMap.get(post.templateId);
  if (!tpl) return { ok: false, reason: '职位模板不存在' };

  // 基本校验
  if (!appointee.alive) return { ok: false, reason: '目标已死亡' };
  if (!appointee.official) return { ok: false, reason: '目标无官职资格' };
  const effectiveMinRank = getEffectiveMinRank(post);
  if (appointee.official.rankLevel < effectiveMinRank) return { ok: false, reason: '品位不足' };

  // 不能任命自己到岗位
  if (appointee.id === appointer.id) return { ok: false, reason: '不能任命自己' };
  // 不能把已在这个岗位上的人再次任命
  if (post.holderId === appointee.id) return { ok: false, reason: '已在此岗' };

  // grantsControl 岗位的转让需要保底检查（至少保留一个直辖州）
  if (tpl.grantsControl && post.holderId === appointer.id && post.territoryId) {
    const territory = territories.get(post.territoryId);
    if (territory?.tier === 'zhou') {
      const check = canGrantTerritory(appointer, post.territoryId, territories);
      if (!check.ok) return check;
    }
  }

  // ── 任命权校验（辟署权优先）──

  // 自己持有的 grantsControl 岗位 → 可转让，无需进一步校验
  if (tpl.grantsControl && post.holderId === appointer.id) {
    return { ok: true };
  }

  // 辟署权防火墙
  if (post.territoryId) {
    const rightHolder = findAppointRightHolder(post.territoryId, territories);
    if (rightHolder) {
      // 该领地受辟署权保护，只有辟署权持有人可任命
      if (rightHolder !== appointer.id) {
        return { ok: false, reason: '受辟署权保护' };
      }
      // appointer 是辟署权持有人 → 允许
      return { ok: true };
    }
  }

  // 朝廷直辖（无辟署权保护）
  const isEmperor = getHeldPosts(appointer.id, territories, centralPosts).some(p => p.templateId === 'pos-emperor');

  if (tpl.scope === 'central') {
    // 中央岗位：只有皇帝可任命
    if (!isEmperor) return { ok: false, reason: '只有皇帝可任命中央职位' };
  } else if (isEmperor) {
    // 皇帝在朝廷直辖区可任命任何岗位（特旨）
  } else {
    // 非皇帝在朝廷直辖区：只能任命自己控制的领地内的岗位
    if (post.territoryId) {
      const territory = territories.get(post.territoryId);
      if (territory) {
        const controller = getActualController(territory);
        if (controller !== appointer.id) {
          return { ok: false, reason: '无权任命此岗位' };
        }
      }
    }
  }

  return { ok: true };
}

/**
 * 校验是否可以将某个州授出（任命刺史/防御使的主岗位）。
 */
export function canGrantTerritory(
  granter: Character,
  territoryId: string,
  territories: Map<string, Territory>,
): { ok: boolean; reason?: string } {
  const territory = territories.get(territoryId);
  if (!territory) return { ok: false, reason: '领地不存在' };
  if (territory.tier !== 'zhou') return { ok: false, reason: '只能授出州级领地' };
  if (getActualController(territory) !== granter.id) return { ok: false, reason: '非直辖领地' };

  const directZhou = getDirectControlledZhou(granter, territories);
  if (directZhou.length <= 1) return { ok: false, reason: '不能授出最后一个直辖州' };

  return { ok: true };
}
