// ===== 提交国库调拨草案 =====
// 玩家作为草拟人（三司使/国长史/节度判官/录事参军）向所服务的 ruler 提交国库调拨草案。
// 草案进入 NpcStore.treasuryDrafts buffer，等待审批人（NPC 或玩家）处理。

import type { TreasuryEntry } from '@engine/official/treasuryDraftCalc';
import { useNpcStore } from '@engine/npc/NpcStore';
import { useTurnManager } from '@engine/TurnManager';

export function submitTreasuryDraftAction(
  rulerId: string,
  drafterId: string,
  entries: TreasuryEntry[],
): { ok: boolean; reason?: string } {
  if (!rulerId || !drafterId || entries.length === 0) {
    return { ok: false, reason: '参数不完整' };
  }
  // 草拟人 CD 检查
  const now = useTurnManager.getState().currentDate;
  if (useNpcStore.getState().isTreasuryDrafterCooldown(drafterId, now)) {
    return { ok: false, reason: '上次草案被驳回，仍在冷却期' };
  }
  // 同 drafter 已有 pending submission → 拒绝重复
  const existing = useNpcStore.getState().treasuryDrafts.get(rulerId);
  if (existing?.some((s) => s.drafterId === drafterId)) {
    return { ok: false, reason: '你的上次草案尚未审批' };
  }
  useNpcStore.getState().addTreasuryDraft(rulerId, drafterId, entries);
  return { ok: true };
}
