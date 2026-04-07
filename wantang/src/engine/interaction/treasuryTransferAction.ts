// ===== 国库运输交互 =====

import { useTerritoryStore } from '@engine/territory/TerritoryStore';

/** 检查是否可以在两州之间运输国库 */
export function canTransferTreasury(
  charId: string,
  fromZhouId: string,
  toZhouId: string,
  amount: { money?: number; grain?: number },
): { ok: boolean; reason?: string } {
  if (fromZhouId === toZhouId) return { ok: false, reason: '源和目标相同' };

  const terrStore = useTerritoryStore.getState();
  const controlled = terrStore.controllerIndex.get(charId);
  if (!controlled) return { ok: false, reason: '无控制领地' };

  if (!controlled.has(fromZhouId)) return { ok: false, reason: '源州不在己方控制下' };
  if (!controlled.has(toZhouId)) return { ok: false, reason: '目标州不在己方控制下' };

  const fromT = terrStore.territories.get(fromZhouId);
  if (!fromT?.treasury) return { ok: false, reason: '源州无国库' };

  const toT = terrStore.territories.get(toZhouId);
  if (!toT?.treasury) return { ok: false, reason: '目标州无国库' };

  // 检查余额
  if (amount.money && amount.money > 0 && fromT.treasury.money < amount.money) {
    return { ok: false, reason: `源州金钱不足（有 ${Math.floor(fromT.treasury.money)}，需 ${amount.money}）` };
  }
  if (amount.grain && amount.grain > 0 && fromT.treasury.grain < amount.grain) {
    return { ok: false, reason: `源州粮草不足（有 ${Math.floor(fromT.treasury.grain)}，需 ${amount.grain}）` };
  }

  return { ok: true };
}

/** 执行国库运输（即时到账，Phase 1 不考虑运输延迟） */
export function executeTransferTreasury(
  charId: string,
  fromZhouId: string,
  toZhouId: string,
  amount: { money?: number; grain?: number },
): void {
  const check = canTransferTreasury(charId, fromZhouId, toZhouId, amount);
  if (!check.ok) return;

  const terrStore = useTerritoryStore.getState();
  // 从源州扣
  terrStore.addTreasury(fromZhouId, {
    money: -(amount.money ?? 0),
    grain: -(amount.grain ?? 0),
  });
  // 加到目标州
  terrStore.addTreasury(toZhouId, {
    money: amount.money ?? 0,
    grain: amount.grain ?? 0,
  });
}
