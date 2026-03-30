/**
 * Phase 2 重构安全网测试
 *
 * 目的：在将 territories.ts / initialArmies.ts JSON 化，
 *       以及将 traits.ts 中的查询函数剥离之前，
 *       锁定这三个文件的"数据完整性契约"与"查询行为契约"。
 *
 * 重构后：
 *   - createAllTerritories() 改为从 JSON 读取，测试应全部继续通过
 *   - getTraitsByCategory / getEducationTrait 移到 characterUtils，
 *     只需把 import 路径改成新路径，测试应全部继续通过
 */

import { describe, it, expect } from 'vitest';
import { createAllTerritories } from '@data/territories';
import { createAllArmies, createAllBattalions } from '@data/initialArmies';
<<<<<<< HEAD
import { ALL_TRAITS, traitMap } from '@data/traits';
import { getTraitsByCategory, getEducationTrait } from '@engine/character/characterUtils';
=======
import {
  ALL_TRAITS,
  traitMap,
  getTraitsByCategory,
  getEducationTrait,
} from '@data/traits';
>>>>>>> 649782b93a3eead49926567b09c7206751f66480

// ─────────────────────────────────────────────────────────────────
// 1. createAllTerritories — 领地数据完整性
// ─────────────────────────────────────────────────────────────────
describe('createAllTerritories', () => {
  const territories = createAllTerritories();

  it('应返回非空数组', () => {
    expect(territories.length).toBeGreaterThan(0);
  });

  it('每个领地应有唯一 id', () => {
    const ids = territories.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('应同时包含 dao 和 zhou 两种 tier', () => {
    const tiers = new Set(territories.map((t) => t.tier));
    expect(tiers.has('dao')).toBe(true);
    expect(tiers.has('zhou')).toBe(true);
  });

  it('dao 的数量应大于 0', () => {
    const daos = territories.filter((t) => t.tier === 'dao');
    expect(daos.length).toBeGreaterThan(0);
  });

  it('zhou 的数量应大于 dao 的数量', () => {
    const daos = territories.filter((t) => t.tier === 'dao');
    const zhous = territories.filter((t) => t.tier === 'zhou');
    expect(zhous.length).toBeGreaterThan(daos.length);
  });

  it('每个 dao 应有 capitalZhouId', () => {
    const daos = territories.filter((t) => t.tier === 'dao');
    for (const dao of daos) {
      expect(dao.capitalZhouId, `dao ${dao.id} 缺少 capitalZhouId`).toBeTruthy();
    }
  });

  it('每个 dao 的 capitalZhouId 应指向一个真实存在的 zhou', () => {
    const allIds = new Set(territories.map((t) => t.id));
    const daos = territories.filter((t) => t.tier === 'dao');
    for (const dao of daos) {
      expect(
        allIds.has(dao.capitalZhouId!),
        `dao ${dao.id} 的 capitalZhouId=${dao.capitalZhouId} 不存在`,
      ).toBe(true);
    }
  });

  it('每个 zhou 应有 parentId 指向一个 dao', () => {
    const daoIds = new Set(
      territories.filter((t) => t.tier === 'dao').map((t) => t.id),
    );
    const zhous = territories.filter((t) => t.tier === 'zhou');
    for (const zhou of zhous) {
      expect(zhou.parentId, `zhou ${zhou.id} 缺少 parentId`).toBeTruthy();
      expect(
        daoIds.has(zhou.parentId!),
        `zhou ${zhou.id} 的 parentId=${zhou.parentId} 不是有效的 dao`,
      ).toBe(true);
    }
  });

  it('每个 zhou 的 dejureControllerId 应等于其 parentId（后处理验证）', () => {
    const zhous = territories.filter((t) => t.tier === 'zhou');
    for (const zhou of zhous) {
      expect(
        zhou.dejureControllerId,
        `zhou ${zhou.id} 的 dejureControllerId 应等于 parentId`,
      ).toBe(zhou.parentId);
    }
  });

  it('dao 和 zhou 级领地的 posts 数组应非空（guo/tianxia 级为空是正常的）', () => {
    const daoAndZhou = territories.filter((t) => t.tier === 'dao' || t.tier === 'zhou');
    for (const t of daoAndZhou) {
      expect(t.posts.length, `${t.id} 的 posts 为空`).toBeGreaterThan(0);
    }
  });

  it('guo 级领地的 posts 应为空数组（纯法理层级，无实际官职）', () => {
    const guos = territories.filter((t) => t.tier === 'guo');
    expect(guos.length).toBeGreaterThan(0);
    for (const guo of guos) {
      expect(guo.posts.length).toBe(0);
    }
  });

  it('所有 post 的 id 在全局应唯一', () => {
    const postIds = territories.flatMap((t) => t.posts.map((p) => p.id));
    const unique = new Set(postIds);
    expect(unique.size).toBe(postIds.length);
  });

  it('每个 post 应有合法的 successionLaw', () => {
    const validLaws = new Set(['clan', 'bureaucratic']);
    const allPosts = territories.flatMap((t) => t.posts);
    for (const post of allPosts) {
      expect(
        validLaws.has(post.successionLaw),
        `post ${post.id} 的 successionLaw=${post.successionLaw} 不合法`,
      ).toBe(true);
    }
  });

  it('长安（zhou-changan）应存在', () => {
    const changan = territories.find((t) => t.id === 'zhou-changan');
    expect(changan).toBeDefined();
    expect(changan?.name).toBe('长安');
  });
});

// ─────────────────────────────────────────────────────────────────
// 2. createAllArmies / createAllBattalions — 军队数据完整性
// ─────────────────────────────────────────────────────────────────
describe('createAllArmies', () => {
  const armies = createAllArmies();

  it('应返回非空数组', () => {
    expect(armies.length).toBeGreaterThan(0);
  });

  it('每个 army 应有唯一 id', () => {
    const ids = armies.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('每个 army 应有 name 和 ownerId', () => {
    for (const army of armies) {
      expect(army.name, `army ${army.id} 缺少 name`).toBeTruthy();
      expect(army.ownerId, `army ${army.id} 缺少 ownerId`).toBeTruthy();
    }
  });

  it('神策军（army-shence）应存在', () => {
    const shence = armies.find((a) => a.id === 'army-shence');
    expect(shence).toBeDefined();
  });
});

describe('createAllBattalions', () => {
  const battalions = createAllBattalions();
  const armies = createAllArmies();
  const armyIds = new Set(armies.map((a) => a.id));

  it('应返回非空数组', () => {
    expect(battalions.length).toBeGreaterThan(0);
  });

  it('每个 battalion 应有唯一 id', () => {
    const ids = battalions.map((b) => b.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('每个 battalion 的 armyId 应指向一个真实存在的 army', () => {
    for (const bat of battalions) {
      expect(
        armyIds.has(bat.armyId),
        `battalion ${bat.id} 的 armyId=${bat.armyId} 不存在`,
      ).toBe(true);
    }
  });

  it('currentStrength 应大于 0', () => {
    for (const bat of battalions) {
      expect(bat.currentStrength, `battalion ${bat.id} 的 currentStrength <= 0`).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// 3. traits 查询函数 — 行为契约（剥离后 import 路径会变，但行为不变）
// ─────────────────────────────────────────────────────────────────
describe('ALL_TRAITS & traitMap', () => {
  it('ALL_TRAITS 应为非空数组', () => {
    expect(ALL_TRAITS.length).toBeGreaterThan(0);
  });

  it('traitMap 的 size 应等于 ALL_TRAITS 的长度', () => {
    expect(traitMap.size).toBe(ALL_TRAITS.length);
  });

  it('ALL_TRAITS 中每个 trait 的 id 应唯一', () => {
    const ids = ALL_TRAITS.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe('getTraitsByCategory', () => {
  it('应返回 category 匹配的 trait 数组', () => {
    const innate = getTraitsByCategory('innate');
    expect(innate.length).toBeGreaterThan(0);
    for (const t of innate) {
      expect(t.category).toBe('innate');
    }
  });

  it('education 类 trait 应存在', () => {
    const edu = getTraitsByCategory('education');
    expect(edu.length).toBeGreaterThan(0);
  });

  it('personality 类 trait 应存在', () => {
    const personality = getTraitsByCategory('personality');
    expect(personality.length).toBeGreaterThan(0);
  });

  it('getTraitsByCategory 结果与手动 filter 结果应一致', () => {
    const manual = ALL_TRAITS.filter((t) => t.category === 'innate');
    const query = getTraitsByCategory('innate');
    expect(query).toEqual(manual);
  });
});

describe('getEducationTrait', () => {
  it('应能通过 ability + level 查找到对应 trait', () => {
    // education trait 的 id 格式为 trait-edu-{ability}-{level}
    const trait = getEducationTrait('military', 1);
    expect(trait).toBeDefined();
    expect(trait?.id).toBe('trait-edu-military-1');
  });

  it('不存在的 ability+level 组合应返回 undefined', () => {
    const trait = getEducationTrait('military', 999);
    expect(trait).toBeUndefined();
  });

  it('返回的 trait 应属于 education 类别', () => {
    const trait = getEducationTrait('administration', 2);
    if (trait) {
      expect(trait.category).toBe('education');
    }
  });
});
