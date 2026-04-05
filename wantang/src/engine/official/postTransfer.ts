// ===== 岗位变动原子操作 =====
//
// 所有岗位持有人变更的公共构建块。
// 各场景（任命/罢免/篡夺/继承/战争结算）显式组合这些原子操作，
// 而不是通过 flag 在一个大函数中走不同分支。

import type { GameDate } from '@engine/types';
import type { Post } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { positionMap } from '@data/positions';
import { collectRulerIds } from './postQueries';
import { calculateMonthlyLedger } from './officialUtils';
import { useLedgerStore } from './LedgerStore';

// ── 1. 岗位持有人变更 ────────────────────────────────────────

/** 设置岗位持有人（就任） */
export function seatPost(
  postId: string,
  holderId: string,
  appointedBy: string,
  date: GameDate,
  extra?: Partial<Post>,
): void {
  useTerritoryStore.getState().updatePost(postId, {
    holderId,
    appointedBy,
    appointedDate: { year: date.year, month: date.month, day: date.day },
    ...extra,
  });
}

/** 清空岗位持有人（空缺），记录前任 holderId 供铨选法理转移使用 */
export function vacatePost(postId: string): void {
  const terrStore = useTerritoryStore.getState();
  const post = terrStore.findPost(postId);
  const prevHolderId = post?.holderId ?? null;
  terrStore.updatePost(postId, {
    holderId: null,
    appointedBy: undefined,
    appointedDate: undefined,
    vacatedHolderId: prevHolderId,
  });
}

// ── 2. 军队跟随岗位转移 ──────────────────────────────────────

/** 岗位绑定军队的 owner 随岗位转给新持有人 */
export function syncArmyForPost(postId: string, newOwnerId: string): void {
  useMilitaryStore.getState().syncArmyOwnersByPost(postId, newOwnerId);
}

/** 岗位绑定军队变为私兵（postId → null，保留原 owner） */
export function detachArmiesFromPost(postId: string): void {
  const milStore = useMilitaryStore.getState();
  for (const army of milStore.armies.values()) {
    if (army.postId === postId) {
      milStore.updateArmy(army.id, { postId: null });
    }
  }
}

// ── 3. 效忠链提升 ──────────────────────────────────────────

const TIER_RANK: Record<string, number> = { zhou: 1, dao: 2, guo: 3, tianxia: 4 };

/** 获取角色持有的最高领地层级（无 grantsControl 岗位时返回 0） */
function getHighestTierRank(charId: string): number {
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(charId);
  let max = 0;
  for (const p of posts) {
    if (!positionMap.get(p.templateId)?.grantsControl || !p.territoryId) continue;
    const terr = terrStore.territories.get(p.territoryId);
    if (terr) max = Math.max(max, TIER_RANK[terr.tier] ?? 0);
  }
  return max;
}

/**
 * 篡夺/晋升后调整 overlordId：如果角色与当前 overlord 平级或更高，
 * 沿实际效忠链向上找到更高层级的领主；找不到则独立。
 *
 * @param actorId 需要调整的角色
 * @param newTierRank 新获得岗位的层级（TIER_RANK 值）
 */
export function promoteOverlordIfNeeded(actorId: string, newTierRank: number): void {
  const charStore = useCharacterStore.getState();
  const actor = charStore.getCharacter(actorId);
  if (!actor?.overlordId) return;

  let currentOverlordId: string | undefined = actor.overlordId;

  while (currentOverlordId) {
    if (currentOverlordId === actorId) { currentOverlordId = undefined; break; }
    const overlordTierRank = getHighestTierRank(currentOverlordId);
    if (overlordTierRank > newTierRank) break; // overlord 层级更高，停止
    // overlord 平级或更低 → 继续上溯
    const overlord = charStore.getCharacter(currentOverlordId);
    currentOverlordId = overlord?.overlordId ?? undefined;
  }

  if (currentOverlordId !== actor.overlordId) {
    charStore.updateCharacter(actorId, { overlordId: currentOverlordId });
  }
}

// ── 3b. 法理下级可选转移 ────────────────────────────────────

export interface TransferableChild {
  charId: string;
  charName: string;
  territoryId: string;
  territoryName: string;
  postId: string;
}

/**
 * 获取可转移的法理后代主岗持有人。
 * 递归遍历 territoryId 的所有法理后代（国→道→州），
 * 返回 overlordId 匹配的主岗持有人。
 *
 * 判定逻辑：A 的法理后代中，overlordId === appointerId（任命者的臣属）
 * 或 overlordId === prevHolderId（前任的臣属）均可转移。
 *
 * @param territoryId 被任命岗位所在领地
 * @param newHolderId 新任者（排除自身 + 已效忠者）
 * @param appointerId 任命者
 * @param deJure 法理模式（铨选）：前任的臣属也可转移
 * @param prevHolderId 前任持有人 ID（铨选模式需要，从 post.vacatedHolderId 提前读取）
 */
export function getTransferableChildren(
  territoryId: string,
  newHolderId: string,
  appointerId: string,
  deJure?: boolean,
  prevHolderId?: string | null,
): TransferableChild[] {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const terr = terrStore.territories.get(territoryId);
  if (!terr) return [];

  // 递归收集所有法理后代领地
  const descendantIds: string[] = [];
  const collect = (tId: string) => {
    const t = terrStore.territories.get(tId);
    if (!t) return;
    for (const cId of t.childIds) {
      descendantIds.push(cId);
      collect(cId);
    }
  };
  collect(territoryId);

  const result: TransferableChild[] = [];
  for (const descId of descendantIds) {
    const desc = terrStore.territories.get(descId);
    if (!desc) continue;
    const mainPost = desc.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (!mainPost?.holderId) continue;
    if (mainPost.holderId === newHolderId) continue;
    const holder = charStore.getCharacter(mainPost.holderId);
    if (!holder?.alive) continue;
    if (holder.overlordId === newHolderId) continue;

    // 任命者自己的臣属：始终可转移
    if (holder.overlordId === appointerId) {
      result.push({ charId: mainPost.holderId, charName: holder.name, territoryId: descId, territoryName: desc.name, postId: mainPost.id });
      continue;
    }

    // 铨选模式：前任的臣属也可转移
    if (deJure && prevHolderId && holder.overlordId === prevHolderId) {
      result.push({ charId: mainPost.holderId, charName: holder.name, territoryId: descId, territoryName: desc.name, postId: mainPost.id });
      continue;
    }
  }
  return result;
}

/**
 * 批量转移法理下级的 overlordId 给新领主，并给予好感加成。
 * 新领主对任命者+好感（感激一并交付臣属），公式与"转移臣属"一致：
 * 每个被转移臣属贡献 floor((5 + minRank/29 * 25) / 2)，累加。
 *
 * @param charIds 要转移的角色 ID 列表
 * @param newOverlordId 新领主（被任命的节度使）
 * @param appointerId 任命者（把臣属交出的人）
 */
export function transferChildren(
  charIds: string[],
  newOverlordId: string,
  appointerId?: string,
): void {
  if (charIds.length === 0) return;
  const filtered = charIds.filter(cid => cid !== newOverlordId);
  if (filtered.length === 0) return;
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();

  charStore.batchMutate(chars => {
    for (const cid of filtered) {
      const c = chars.get(cid);
      if (c) c.overlordId = newOverlordId;
    }
  });

  // 新领主对任命者+好感：每个被转移臣属贡献授予职位好感的一半
  if (appointerId && appointerId !== newOverlordId) {
    let totalOpinion = 0;
    for (const cid of filtered) {
      const posts = terrStore.getPostsByHolder(cid);
      let maxRank = 0;
      for (const p of posts) {
        const tpl = positionMap.get(p.templateId);
        if (tpl?.grantsControl && tpl.minRank > maxRank) {
          maxRank = tpl.minRank;
        }
      }
      if (maxRank > 0) {
        totalOpinion += Math.floor((5 + (maxRank / 29) * 25) / 2);
      }
    }
    if (totalOpinion > 0) {
      charStore.addOpinion(newOverlordId, appointerId, {
        reason: '转授法理臣属',
        value: totalOpinion,
        decayable: true,
      });
    }
  }
}

/**
 * 任命后自动转移所有法理直接下级（NPC 用）。
 * 检查 postId 是否为 grantsControl 且有 territoryId，
 * 如有则将所有可转移的法理下级 overlordId 设为新持有人。
 */
export function autoTransferChildrenAfterAppoint(
  postId: string,
  appointerId?: string,
  deJure?: boolean,
): void {
  const terrStore = useTerritoryStore.getState();
  const post = terrStore.findPost(postId);
  if (!post?.holderId || !post.territoryId) return;
  if (!appointerId) return;
  const tpl = positionMap.get(post.templateId);
  if (!tpl?.grantsControl) return;

  const prevHolderId = deJure ? (post.vacatedHolderId ?? null) : null;
  const children = getTransferableChildren(post.territoryId, post.holderId, appointerId, deJure, prevHolderId);
  if (children.length > 0) {
    transferChildren(children.map(c => c.charId), post.holderId, appointerId);
  }
}

// ── 4. 效忠级联 ─────────────────────────────────────────────

/**
 * 同领地副岗持有人归附新主岗持有人。
 *
 * @param territoryId 领地 ID
 * @param newOverlordId 新的 overlordId（通常是新主岗持有人）
 * @param prevHolderId 可选，仅当副岗持有人��� overlordId === prevHolderId 时才更新。
 *                     不传则无条件更新所有副岗持有人（用于战争结算强制归附）。
 */
export function cascadeSecondaryOverlord(
  territoryId: string,
  newOverlordId: string,
  prevHolderId?: string,
): void {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const terr = terrStore.territories.get(territoryId);
  if (!terr) return;

  const cascadeIds: string[] = [];
  for (const p of terr.posts) {
    if (positionMap.get(p.templateId)?.grantsControl) continue;
    if (!p.holderId || p.holderId === newOverlordId) continue;
    const holder = charStore.getCharacter(p.holderId);
    if (!holder?.alive) continue;
    if (prevHolderId !== undefined && holder.overlordId !== prevHolderId) continue;
    if (holder.overlordId === newOverlordId) continue;
    cascadeIds.push(p.holderId);
  }

  if (cascadeIds.length > 0) {
    charStore.batchMutate(chars => {
      for (const cid of cascadeIds) {
        const c = chars.get(cid);
        if (c) c.overlordId = newOverlordId;
      }
    });
  }
}

/**
 * 法理后代主岗持有人效忠回退。
 * 递归遍历 territoryId 的所有法理后代领地，
 * 仅当后代的 overlordId 原指向 prevHolderId 时才回退给 newOverlordId。
 *
 * @param territoryId 父领地 ID
 * @param newOverlordId 回退目标
 * @param prevHolderId 原持有人
 */
export function cascadeChildOverlord(
  territoryId: string,
  newOverlordId: string,
  prevHolderId: string,
): void {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const terr = terrStore.territories.get(territoryId);
  if (!terr) return;

  // 递归收集所有法理后代领地 ID
  const descendantIds: string[] = [];
  const collect = (tId: string) => {
    const t = terrStore.territories.get(tId);
    if (!t) return;
    for (const cId of t.childIds) {
      descendantIds.push(cId);
      collect(cId);
    }
  };
  collect(territoryId);

  const cascadeIds: string[] = [];
  for (const descId of descendantIds) {
    const desc = terrStore.territories.get(descId);
    if (!desc) continue;
    const mainPost = desc.posts.find(p => positionMap.get(p.templateId)?.grantsControl);
    if (!mainPost?.holderId) continue;
    const holder = charStore.getCharacter(mainPost.holderId);
    if (holder?.alive && holder.overlordId === prevHolderId) {
      cascadeIds.push(mainPost.holderId);
    }
  }

  // 排除 newOverlordId 自身防止自我领主
  const filtered = cascadeIds.filter(cid => cid !== newOverlordId);
  if (filtered.length > 0) {
    charStore.batchMutate(chars => {
      for (const cid of filtered) {
        const c = chars.get(cid);
        if (c) c.overlordId = newOverlordId;
      }
    });
  }
}

// ── 4. 治所联动 ─────────────────────────────────────────────

/**
 * 道级→治所刺史联动：就任。
 * 当道级主岗获得新持有人时，治所刺史跟随就任。
 *
 * @param daoTerritoryId 道级领地 ID
 * @param newHolderId 新持有人
 * @param appointedBy 任命者
 * @param date 日期
 * @param opts.checkCanTake 是否检查治所是否可接管（任命场景需要，继承/篡夺不需要）
 * @param opts.oldHolderId 旧持有人（��承场景用，只有治所仍在旧人手中才联动）
 */
export function capitalZhouSeat(
  daoTerritoryId: string,
  newHolderId: string,
  appointedBy: string,
  date: GameDate,
  opts?: {
    checkCanTake?: boolean;
    appointerId?: string;
    oldHolderId?: string;
    extra?: Partial<Post>;
  },
): void {
  const terrStore = useTerritoryStore.getState();
  const dao = terrStore.territories.get(daoTerritoryId);
  if (!dao?.capitalZhouId) return;

  const capitalZhou = terrStore.territories.get(dao.capitalZhouId);
  if (!capitalZhou) return;

  const capitalPost = capitalZhou.posts.find(p =>
    positionMap.get(p.templateId)?.grantsControl === true,
  );
  if (!capitalPost) return;

  // 已经是新持有人就跳过
  if (capitalPost.holderId === newHolderId) return;

  // 继承/篡夺场景：仅当治所仍在旧持有人手中时才联动
  if (opts?.oldHolderId !== undefined && capitalPost.holderId !== opts.oldHolderId) return;

  // 任命场景：检查能否接管
  if (opts?.checkCanTake) {
    const charStore = useCharacterStore.getState();
    const capitalHolderId = capitalPost.holderId;
    const appointerId = opts.appointerId ?? appointedBy;
    const canTake = !capitalHolderId ||
      capitalHolderId === appointerId ||
      charStore.getCharacter(capitalHolderId)?.overlordId === appointerId;
    if (!canTake) return;

    // 清退治所前任
    if (capitalPost.holderId && capitalPost.holderId !== appointerId) {
      charStore.updateCharacter(capitalPost.holderId, { overlordId: appointerId });
    }
  }

  terrStore.updatePost(capitalPost.id, {
    holderId: newHolderId,
    appointedBy,
    appointedDate: { year: date.year, month: date.month, day: date.day },
    ...opts?.extra,
  });
  syncArmyForPost(capitalPost.id, newHolderId);
}

/** 道级→治所刺史联动：空缺 */
export function capitalZhouVacate(
  daoTerritoryId: string,
  oldHolderId?: string,
): void {
  const terrStore = useTerritoryStore.getState();
  const dao = terrStore.territories.get(daoTerritoryId);
  if (!dao?.capitalZhouId) return;

  const capitalZhou = terrStore.territories.get(dao.capitalZhouId);
  if (!capitalZhou) return;

  const capitalPost = capitalZhou.posts.find(p =>
    positionMap.get(p.templateId)?.grantsControl === true,
  );
  if (!capitalPost) return;

  // 仅当治所仍在旧持有人手中时才空缺（有 oldHolderId 约束时）
  if (oldHolderId !== undefined && capitalPost.holderId !== oldHolderId) return;

  vacatePost(capitalPost.id);
}

/**
 * 治所州失陷：销毁父道主岗 + 清空副岗 + 军队变私兵。
 * 检查 transferredTerritoryIds 中是否有治所州，如有则销毁对应道级主岗。
 */
export function checkCapitalZhouLost(transferredTerritoryIds: string[]): void {
  const terrStore = useTerritoryStore.getState();
  const territories = terrStore.territories;

  // 建立 capitalZhouId → daoId 反向映射
  const capitalToDao = new Map<string, string>();
  for (const t of territories.values()) {
    if (t.tier === 'dao' && t.capitalZhouId) {
      capitalToDao.set(t.capitalZhouId, t.id);
    }
  }

  for (const tId of transferredTerritoryIds) {
    const daoId = capitalToDao.get(tId);
    if (!daoId) continue;

    const dao = terrStore.territories.get(daoId);
    if (!dao) continue;

    const daoMainPost = dao.posts.find(p => positionMap.get(p.templateId)?.grantsControl === true);
    if (!daoMainPost?.holderId) continue;

    // 治所州的新控制者
    const capitalZhou = terrStore.territories.get(tId);
    if (!capitalZhou) continue;
    const capitalPost = capitalZhou.posts.find(p => positionMap.get(p.templateId)?.grantsControl === true);
    const newCapitalHolder = capitalPost?.holderId ?? null;

    // 治所州已不在道主岗持有者手中 → 销毁
    if (newCapitalHolder !== daoMainPost.holderId) {
      destroyMainPost(daoMainPost.id, daoId);
    }
  }
}

/**
 * 销毁 grantsControl 主岗：清空同领地副岗 + 军队变私�� + 移除主岗。
 */
export function destroyMainPost(postId: string, territoryId: string): void {
  const terrStore = useTerritoryStore.getState();
  const freshTerr = terrStore.territories.get(territoryId);
  if (!freshTerr) return;

  // 清��所有副岗
  for (const p of freshTerr.posts) {
    if (p.id === postId) continue;
    if (p.holderId) {
      vacatePost(p.id);
    }
  }

  // 主岗绑定军队变为私兵
  detachArmiesFromPost(postId);

  // 移除主岗
  terrStore.removePost(postId);
}

// ── 5. 独立统治者辟署权自动授予 ─────────────────────────────

/**
 * 确保独立统治者拥有辟署权。
 * 角色变为独立（overlordId === undefined）时调用，
 * 为其持有的所有 grantsControl 主岗授予 hasAppointRight。
 */
export function ensureAppointRight(charId: string): void {
  const terrStore = useTerritoryStore.getState();
  const posts = terrStore.getPostsByHolder(charId);
  for (const p of posts) {
    if (p.hasAppointRight) continue;
    const tpl = positionMap.get(p.templateId);
    if (!tpl?.grantsControl) continue;
    terrStore.updatePost(p.id, { hasAppointRight: true });
  }
}

// ── 6. 缓存刷新（合并为一次调用） ──────────────────────────

/**
 * 岗位变动后统一刷新缓存。
 * @param affectedCharIds 受影响的角色 ID（用于增量更新正统性）
 * @param fullLegitimacyRefresh 是否全量刷新正统性（战争/继承等批量场景）
 */
export function refreshPostCaches(
  affectedCharIds?: string[],
  fullLegitimacyRefresh?: boolean,
): void {
  const terrStore = useTerritoryStore.getState();

  // 刷新 isRuler
  const rulerIds = collectRulerIds(terrStore.territories);
  useCharacterStore.getState().refreshIsRuler(rulerIds);

  // 刷新正统性预期缓存
  if (fullLegitimacyRefresh) {
    terrStore.refreshExpectedLegitimacy();
  } else if (affectedCharIds) {
    for (const charId of affectedCharIds) {
      terrStore.updateExpectedLegitimacy(charId);
    }
  }

  // 重算玩家 ledger
  refreshPlayerLedger();
}

/** 立即重算玩家 ledger */
export function refreshPlayerLedger(): void {
  const charStore = useCharacterStore.getState();
  const playerId = charStore.playerId;
  if (!playerId) return;
  const player = charStore.getCharacter(playerId);
  if (!player) return;
  const territories = useTerritoryStore.getState().territories;
  const characters = charStore.characters;
  const ledger = calculateMonthlyLedger(player, territories, characters);
  useLedgerStore.getState().updatePlayerLedger(ledger);
}
