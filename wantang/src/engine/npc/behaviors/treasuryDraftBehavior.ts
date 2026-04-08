// ===== NPC 国库调拨草拟行为 =====
// 草拟人（三司使/国长史/节度判官/录事参军）评估 ruler 直辖各州国库前景，
// 从富裕州向赤字州拟定调拨方案，存入 NpcStore.treasuryDrafts 等待批准人处理。
//
// playerMode: 'skip' —— 玩家草拟入口走 UI 面板（独立 React 组件 + interaction action），
// 不挂常驻 PlayerTask，避免重蹈 deploy standing 模式分桶 bug 的覆辙。

import type { NpcBehavior, NpcContext, BehaviorTaskResult, WeightModifier } from '../types';
import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import { calcWeight } from '../types';
import { useNpcStore } from '../NpcStore';
import {
  resolveTreasuryDrafter,
  planTreasuryDraft,
  type TreasuryEntry,
} from '@engine/official/treasuryDraftCalc';
import { registerBehavior } from './index';

interface TreasuryDraftData {
  rulerId: string;
  entries: TreasuryEntry[];
}

/** 收集 ruler 直接控制的所有州（仅 zhou tier 且有 treasury） */
function collectRulerZhous(rulerId: string, ctx: NpcContext): Territory[] {
  const ids = ctx.controllerIndex.get(rulerId);
  if (!ids) return [];
  const out: Territory[] = [];
  for (const id of ids) {
    const t = ctx.territories.get(id);
    if (!t) continue;
    if (t.tier !== 'zhou') continue;
    if (!t.treasury) continue;
    out.push(t);
  }
  return out;
}

export const treasuryDraftBehavior: NpcBehavior<TreasuryDraftData> = {
  id: 'treasury-draft',
  schedule: 'monthly-slot',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<TreasuryDraftData> | null {
    if (!actor.alive) return null;

    const resolved = resolveTreasuryDrafter(
      actor.id, ctx.territories, ctx.centralPosts, ctx.holderIndex, ctx.postIndex,
    );
    if (!resolved) return null;
    const { rulerId } = resolved;

    // 该草拟人在 CD 中 → 跳过
    if (useNpcStore.getState().isTreasuryDrafterCooldown(actor.id, ctx.date)) return null;
    // 该草拟人已有待批 submission（buffer 中） → 跳过
    const existing = useNpcStore.getState().treasuryDrafts.get(rulerId);
    if (existing?.some((s) => s.drafterId === actor.id)) return null;
    // ruler 已有 pending 玩家审批任务 → 跳过
    // （generatePlayerTask 会把 buffer 搬到 task.data 然后清空 buffer，
    //   不挡这一层会让 drafter 以为没 pending 而重复提交，导致重复草案堆积）
    const hasPlayerTask = useNpcStore.getState().playerTasks.some(
      (t) => t.type === 'treasury-approve' && t.actorId === rulerId,
    );
    if (hasPlayerTask) return null;

    // 至少需要 2 个直辖州才能调拨
    const zhous = collectRulerZhous(rulerId, ctx);
    if (zhous.length < 2) return null;

    const { entries, urgencyMonths } = planTreasuryDraft(zhous, ctx.treasuryHistory);
    if (entries.length === 0) return null;

    // ── 紧迫度档位 ──
    let urgencyWeight: number;
    if (urgencyMonths < 3) urgencyWeight = 100;        // 必触发
    else if (urgencyMonths < 6) urgencyWeight = 60;
    else if (urgencyMonths < 12) urgencyWeight = 25;
    else return null;

    const personality = ctx.personalityCache.get(actor.id);
    if (!personality) return null;

    // 性格修正：理性=长期规划，-胆识=谨慎，精力=勤奋
    const modifiers: WeightModifier[] = [
      { label: '紧迫度', add: urgencyWeight },
      { label: '理性', add: personality.rationality * 10 },
      { label: '谨慎', add: -personality.boldness * 8 },
      { label: '勤奋', add: personality.energy * 8 },
    ];
    const weight = calcWeight(modifiers);
    if (weight <= 0) return null;

    // 紧迫度档位 ≥60（< 6 月）视为行政职责，forced 触发不与自愿行为竞争 maxActions。
    // < 12 月（urgencyWeight=25）保持 voluntary，由性格和 maxActions 决定是否动手。
    const forced = urgencyWeight >= 60;

    return { data: { rulerId, entries }, weight, forced };
  },

  executeAsNpc(actor: Character, data: TreasuryDraftData, _ctx: NpcContext): void {
    useNpcStore.getState().addTreasuryDraft(data.rulerId, actor.id, data.entries);
  },
};

registerBehavior(treasuryDraftBehavior);
