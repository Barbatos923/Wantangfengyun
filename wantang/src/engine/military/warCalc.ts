// ===== 战争计算（纯函数） =====

import type { CasusBelli } from './types';
import type { Territory } from '@engine/territory/types';
import { Era } from '@engine/types';
import { positionMap } from '@data/positions';

/**
 * 获取 attacker 对 defender 可用的所有战争理由。
 * 初版只实现：武力兼并 + 法理宣称。
 */
export function getAvailableCasusBelli(
  attackerId: string,
  defenderId: string,
  _era: Era,
  territories: Map<string, Territory>,
): CasusBelli[] {
  const result: CasusBelli[] = [];

  // 1. 武力兼并：只要不在四级集权下，始终可用
  // （四级集权检查暂不实现，默认可用）
  result.push('annexation');

  // 2. 法理宣称：attacker 持有某道的节度使/观察使，
  //    该道法理下辖的州中有 defender 控制的
  //    即：遍历所有道，看 attacker 是否是该道主岗位持有者
  //    如果是，看该道childIds中的州是否有 defender 控制的
  for (const terr of territories.values()) {
    if (terr.tier !== 'dao') continue;
    // 检查 attacker 是否持有该道主岗位
    const mainPost = terr.posts.find(p => {
      const tpl = positionMap.get(p.templateId);
      return tpl?.grantsControl === true;
    });
    if (!mainPost || mainPost.holderId !== attackerId) continue;

    // 检查该道下辖州中是否有 defender 控制的
    for (const childId of terr.childIds) {
      const child = territories.get(childId);
      if (!child || child.tier !== 'zhou') continue;
      const childMainPost = child.posts.find(p => {
        const tpl = positionMap.get(p.templateId);
        return tpl?.grantsControl === true;
      });
      if (childMainPost?.holderId === defenderId) {
        result.push('deJureClaim');
        return result; // 有一个就够了
      }
    }
  }

  return result;
}

/**
 * 获取某种战争理由在当前时代下的代价。
 */
export function getWarCost(
  casusBelli: CasusBelli,
  era: Era,
): { prestige: number; legitimacy: number } {
  switch (casusBelli) {
    case 'annexation':
      switch (era) {
        case Era.ZhiShi: return { prestige: -40, legitimacy: -20 };
        case Era.WeiShi: return { prestige: -20, legitimacy: -10 };
        case Era.LuanShi: return { prestige: -5, legitimacy: 0 };
      }
      break; // fallthrough guard
    case 'deJureClaim':
      return { prestige: -5, legitimacy: 0 };
    default:
      // 其他理由暂未实现
      return { prestige: -10, legitimacy: -5 };
  }
  return { prestige: -10, legitimacy: -5 }; // fallback
}

/**
 * 获取法理宣称可以争夺的目标领地列表。
 * 即 attacker 持有道，该道下属州中被 defender 控制的。
 */
export function getDeJureTargets(
  attackerId: string,
  defenderId: string,
  territories: Map<string, Territory>,
): string[] {
  const targets: string[] = [];

  for (const terr of territories.values()) {
    if (terr.tier !== 'dao') continue;
    const mainPost = terr.posts.find(p => {
      const tpl = positionMap.get(p.templateId);
      return tpl?.grantsControl === true;
    });
    if (!mainPost || mainPost.holderId !== attackerId) continue;

    for (const childId of terr.childIds) {
      const child = territories.get(childId);
      if (!child || child.tier !== 'zhou') continue;
      const childMainPost = child.posts.find(p => {
        const tpl = positionMap.get(p.templateId);
        return tpl?.grantsControl === true;
      });
      if (childMainPost?.holderId === defenderId) {
        targets.push(childId);
      }
    }
  }

  return targets;
}
