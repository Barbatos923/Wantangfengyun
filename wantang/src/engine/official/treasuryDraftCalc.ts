// ===== 国库调拨草案：纯函数计算层 =====
// 草拟人评估 ruler 直辖各州的国库前景，从富裕州向赤字州拟定调拨方案。

import type { Territory, Post } from '@engine/territory/types';
import { positionMap } from '@data/positions';

// ── 类型 ────────────────────────────────────────────────

export interface TreasuryEntry {
  fromZhouId: string;
  toZhouId: string;
  resource: 'money' | 'grain';
  amount: number;
}

/** 一次草拟人提交：携带草拟人 id 用于审批时定向 CD/好感计算 */
export interface TreasurySubmission {
  drafterId: string;
  entries: TreasuryEntry[];
}

export interface TreasuryPlan {
  entries: TreasuryEntry[];
  /** 最严重赤字州的剩余月数（用于权重档位）；无赤字时为 +Infinity */
  urgencyMonths: number;
}

// ── 常量 ────────────────────────────────────────────────

/** 草拟人岗位模板 ID */
const DRAFTER_TEMPLATE_IDS = new Set<string>([
  'pos-sansi-shi',     // 三司使 → 皇帝
  'pos-guo-changshi',  // 国长史 → 行台尚书令/王
  'pos-panguan',       // 节度判官 → 节度使
  'pos-lushibcanjun',  // 录事参军 → 刺史
]);

/** ruler 最高 tier → 该 tier 的主草拟人模板 */
const TIER_TO_DRAFTER: Record<string, string> = {
  tianxia: 'pos-sansi-shi',
  guo: 'pos-guo-changshi',
  dao: 'pos-panguan',
  zhou: 'pos-lushibcanjun',
};
/** tier 优先级（越高越主） */
const TIER_RANK: Record<string, number> = { tianxia: 4, guo: 3, dao: 2, zhou: 1 };

/** 警戒线月数：补到此存量算"安全" */
const SAFE_MONTHS = 9;
/** 富裕门槛月数：超过此存量才允许被抽调 */
const SURPLUS_MONTHS = 18;
/** 单次草案最大 entry 数 */
const MAX_ENTRIES = 6;
/** 至少要连续这么多月为负才视为持续赤字 */
const MIN_NEGATIVE_MONTHS = 2;
/** entry 金额下限（避免微调） */
const MIN_TRANSFER = 50;

// ── 草拟人解析 ──────────────────────────────────────────

/**
 * 找到 ruler 的"主草拟人 tier"。
 * 规则：取 ruler 持有的所有 grantsControl 主岗中的最高 tier。
 * 该 tier 上的所有对应草拟人都视为主草拟人（同 tier 多个领地都允许反馈）。
 * 例：节度使持有 3 道 → 主 tier=dao → 3 个节度判官全部有效。
 */
function getCanonicalDrafterTier(
  rulerId: string,
  territories: Map<string, Territory>,
  holderIndex: Map<string, string[]>,
  postIndex: Map<string, Post>,
): string | null {
  const postIds = holderIndex.get(rulerId);
  if (!postIds) return null;

  let bestRank = 0;
  let bestTier: string | null = null;
  for (const pid of postIds) {
    const p = postIndex.get(pid);
    if (!p) continue;

    // pos-emperor 是 central 特殊岗位，grantsControl=false 但实际是 tianxia 之主
    let tier: string | null = null;
    if (p.templateId === 'pos-emperor') {
      tier = 'tianxia';
    } else {
      const tpl = positionMap.get(p.templateId);
      if (!tpl?.grantsControl) continue;
      if (!p.territoryId) continue;
      const terr = territories.get(p.territoryId);
      if (!terr) continue;
      tier = terr.tier;
    }

    const rank = TIER_RANK[tier] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      bestTier = tier;
    }
  }
  return bestTier;
}

/**
 * actor 是否持有草拟人岗位；返回他服务的 ruler id。
 * 通过 holderIndex/postIndex 索引化：O(actor 持岗数)，通常 ≤ 3。
 * - 中央 pos-sansi-shi → 皇帝
 * - 领地 pos-guo-changshi/pos-panguan/pos-lushibcanjun → 该领地 grantsControl 主岗持有人
 */
export function resolveTreasuryDrafter(
  actorId: string,
  territories: Map<string, Territory>,
  centralPosts: Post[],
  holderIndex: Map<string, string[]>,
  postIndex: Map<string, Post>,
): { rulerId: string } | null {
  const postIds = holderIndex.get(actorId);
  if (!postIds) return null;

  for (const pid of postIds) {
    const post = postIndex.get(pid);
    if (!post) continue;
    if (!DRAFTER_TEMPLATE_IDS.has(post.templateId)) continue;

    // 先解析 rulerId
    let rulerId: string | null = null;
    if (post.templateId === 'pos-sansi-shi') {
      rulerId = centralPosts.find((cp) => cp.templateId === 'pos-emperor')?.holderId ?? null;
      if (!rulerId) {
        for (const t of territories.values()) {
          if (t.tier === 'tianxia') {
            const ep = t.posts.find((tp) => tp.templateId === 'pos-emperor');
            if (ep?.holderId) { rulerId = ep.holderId; break; }
          }
        }
      }
    } else if (post.territoryId) {
      const terr = territories.get(post.territoryId);
      const main = terr?.posts.find((mp) => positionMap.get(mp.templateId)?.grantsControl);
      rulerId = main?.holderId ?? null;
    }
    if (!rulerId) continue;

    // 主草拟人检查：actor 的草拟岗位 tier 必须等于 ruler 的最高 tier
    // 例：节度使最高 tier=dao → 只接受节度判官；N 个录事参军 return null
    // 同 tier 多领地全部允许（节度使持多道 → 各道节度判官都有效）
    const canonicalTier = getCanonicalDrafterTier(rulerId, territories, holderIndex, postIndex);
    if (!canonicalTier) continue;
    if (TIER_TO_DRAFTER[canonicalTier] !== post.templateId) continue;
    // 中央 post 没有 territoryId，已经由 templateId === pos-sansi-shi 唯一保证
    // 领地 post 还要验证所在领地 tier 一致（避免跨 tier 误中）
    if (post.territoryId) {
      const terr = territories.get(post.territoryId);
      if (terr?.tier !== canonicalTier) continue;
    }

    return { rulerId };
  }

  return null;
}

// ── 预测 ────────────────────────────────────────────────

interface ZhouForecast {
  zhouId: string;
  moneyBalance: number;
  grainBalance: number;
  /** 月均净流（负值=流出），由历史平均得出；不足 MIN_NEGATIVE_MONTHS 视为 0 */
  moneyNet: number;
  grainNet: number;
  /** 剩余月数（净流≥0 时为 +Infinity） */
  moneyMonthsLeft: number;
  grainMonthsLeft: number;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const x of arr) s += x;
  return s / arr.length;
}

/** 计算单个州的前景。需要历史长度≥MIN_NEGATIVE_MONTHS 才算稳态；否则视为 Infinity（不参与判定）。 */
export function forecastZhou(
  terr: Territory,
  history: { money: number[]; grain: number[] } | undefined,
): ZhouForecast | null {
  if (!terr.treasury) return null;

  const moneyHist = history?.money ?? [];
  const grainHist = history?.grain ?? [];

  // 稳态：最近 MIN_NEGATIVE_MONTHS 月都为负 → 取均值（过滤过境瞬时项）
  // 开局：只有 1 月数据 → 直接信任（开局通常无大规模行军，误判风险低）
  // 真·首月：0 月数据 → skip（无信号）
  let moneyNet = 0;
  if (moneyHist.length >= MIN_NEGATIVE_MONTHS) {
    const recent = moneyHist.slice(-MIN_NEGATIVE_MONTHS);
    if (recent.every((x) => x < 0)) moneyNet = avg(moneyHist);
  } else if (moneyHist.length === 1 && moneyHist[0] < 0) {
    moneyNet = moneyHist[0];
  }

  let grainNet = 0;
  if (grainHist.length >= MIN_NEGATIVE_MONTHS) {
    const recent = grainHist.slice(-MIN_NEGATIVE_MONTHS);
    if (recent.every((x) => x < 0)) grainNet = avg(grainHist);
  } else if (grainHist.length === 1 && grainHist[0] < 0) {
    grainNet = grainHist[0];
  }

  const moneyMonthsLeft = moneyNet < 0 ? terr.treasury.money / -moneyNet : Infinity;
  const grainMonthsLeft = grainNet < 0 ? terr.treasury.grain / -grainNet : Infinity;

  return {
    zhouId: terr.id,
    moneyBalance: terr.treasury.money,
    grainBalance: terr.treasury.grain,
    moneyNet,
    grainNet,
    moneyMonthsLeft,
    grainMonthsLeft,
  };
}

// ── 规划 ────────────────────────────────────────────────

interface DeficitTarget {
  zhouId: string;
  resource: 'money' | 'grain';
  /** 需要补充的金额（达到 SAFE_MONTHS 存量） */
  needed: number;
  /** 当前剩余月数（用于排序：越小越紧迫） */
  monthsLeft: number;
}

interface SurplusSource {
  zhouId: string;
  resource: 'money' | 'grain';
  /** 可调出量（保留 SAFE_MONTHS 自用后剩余） */
  available: number;
}

/**
 * 规划国库调拨。
 * 输入：ruler 直辖的所有州 + 它们的历史 buffer。
 * 输出：entries（贪心匹配，单条 ≥ MIN_TRANSFER）+ 最严重赤字的 monthsLeft。
 */
export function planTreasuryDraft(
  zhous: Territory[],
  historyMap: Map<string, { money: number[]; grain: number[] }>,
): TreasuryPlan {
  const forecasts: ZhouForecast[] = [];
  for (const z of zhous) {
    const f = forecastZhou(z, historyMap.get(z.id));
    if (f) forecasts.push(f);
  }

  if (forecasts.length < 2) return { entries: [], urgencyMonths: Infinity };

  // 收集 deficit / surplus（money / grain 分开）
  const deficits: DeficitTarget[] = [];
  const surpluses: SurplusSource[] = [];

  for (const f of forecasts) {
    // money
    if (f.moneyMonthsLeft < 12) {
      const targetBalance = SAFE_MONTHS * -f.moneyNet; // moneyNet < 0
      const needed = targetBalance - f.moneyBalance;
      if (needed > MIN_TRANSFER) {
        deficits.push({ zhouId: f.zhouId, resource: 'money', needed, monthsLeft: f.moneyMonthsLeft });
      }
    } else if (f.moneyMonthsLeft >= SURPLUS_MONTHS || (f.moneyNet >= 0 && f.moneyBalance > 1000)) {
      const reserve = f.moneyNet < 0 ? SAFE_MONTHS * -f.moneyNet : 0;
      const available = f.moneyBalance - reserve;
      if (available > MIN_TRANSFER) {
        surpluses.push({ zhouId: f.zhouId, resource: 'money', available });
      }
    }

    // grain
    if (f.grainMonthsLeft < 12) {
      const targetBalance = SAFE_MONTHS * -f.grainNet;
      const needed = targetBalance - f.grainBalance;
      if (needed > MIN_TRANSFER) {
        deficits.push({ zhouId: f.zhouId, resource: 'grain', needed, monthsLeft: f.grainMonthsLeft });
      }
    } else if (f.grainMonthsLeft >= SURPLUS_MONTHS || (f.grainNet >= 0 && f.grainBalance > 1000)) {
      const reserve = f.grainNet < 0 ? SAFE_MONTHS * -f.grainNet : 0;
      const available = f.grainBalance - reserve;
      if (available > MIN_TRANSFER) {
        surpluses.push({ zhouId: f.zhouId, resource: 'grain', available });
      }
    }
  }

  if (deficits.length === 0) return { entries: [], urgencyMonths: Infinity };

  deficits.sort((a, b) => a.monthsLeft - b.monthsLeft);
  // surplus 按 available 降序（每次取最富的）
  const sortSurpluses = () => surpluses.sort((a, b) => b.available - a.available);

  const entries: TreasuryEntry[] = [];

  for (const d of deficits) {
    if (entries.length >= MAX_ENTRIES) break;
    let needed = d.needed;
    sortSurpluses();
    for (const s of surpluses) {
      if (needed <= 0) break;
      if (entries.length >= MAX_ENTRIES) break;
      if (s.resource !== d.resource) continue;
      if (s.zhouId === d.zhouId) continue;
      if (s.available < MIN_TRANSFER) continue;
      const give = Math.floor(Math.min(needed, s.available));
      if (give < MIN_TRANSFER) continue;
      entries.push({
        fromZhouId: s.zhouId,
        toZhouId: d.zhouId,
        resource: d.resource,
        amount: give,
      });
      s.available -= give;
      needed -= give;
    }
  }

  const urgencyMonths = deficits[0]?.monthsLeft ?? Infinity;
  return { entries, urgencyMonths };
}
