// ===== 任命校验（纯函数） =====

import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import { positionMap } from '@data/positions';
import { getActualController, getHeldPosts, getDirectControlledZhou } from './postQueries';

/**
 * 检验是否有权将 appointee 任命至指定岗位。
 * v2 任命权基于层级：
 * - 中央岗位：只有皇帝能任命
 * - 地方主岗位(grantsControl)：当前持有者可转让，皇帝/父级领地控制者可任命空缺
 * - 地方副岗位：该领地主岗位持有者可任命
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
  if (appointee.official.rankLevel < tpl.minRank) return { ok: false, reason: '品位不足' };

  // 占用校验：grantsControl 岗位允许任命者转让自己持有的岗位
  if (post.holderId !== null && !(tpl.grantsControl && post.holderId === appointer.id)) {
    return { ok: false, reason: '已有人在任' };
  }

  // grantsControl 岗位的转让需要保底检查（至少保留一个直辖州）
  if (tpl.grantsControl && post.holderId === appointer.id && post.territoryId) {
    const territory = territories.get(post.territoryId);
    if (territory?.tier === 'zhou') {
      const check = canGrantTerritory(appointer, post.territoryId, territories);
      if (!check.ok) return check;
    }
  }

  // 任命权校验
  const isEmperor = getHeldPosts(appointer.id, territories, centralPosts).some(p => p.templateId === 'pos-emperor');

  if (tpl.scope === 'central') {
    if (!isEmperor) return { ok: false, reason: '只有皇帝可任命中央职位' };
  } else if (tpl.grantsControl) {
    if (post.holderId === appointer.id) {
      // 自己持有的，可以转让
    } else if (isEmperor) {
      // 皇帝可以任命任何空缺主岗位
    } else if (post.territoryId) {
      const territory = territories.get(post.territoryId);
      if (territory?.parentId) {
        const parentTerritory = territories.get(territory.parentId);
        if (parentTerritory) {
          const parentController = getActualController(parentTerritory);
          if (parentController !== appointer.id) {
            return { ok: false, reason: '无权任命此岗位' };
          }
        } else {
          return { ok: false, reason: '无权任命此岗位' };
        }
      } else {
        return { ok: false, reason: '无权任命此岗位' };
      }
    } else {
      return { ok: false, reason: '无权任命此岗位' };
    }
  } else {
    // 地方副岗位：该领地主岗位持有者可任命
    if (post.territoryId) {
      const territory = territories.get(post.territoryId);
      if (territory) {
        const controller = getActualController(territory);
        if (controller !== appointer.id) {
          return { ok: false, reason: '非该领地控制人' };
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
