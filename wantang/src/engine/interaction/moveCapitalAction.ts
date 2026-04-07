// ===== 迁都交互 =====

import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { toAbsoluteDay } from '@engine/dateUtils';

/** 迁都冷却天数 */
const MOVE_CAPITAL_COOLDOWN = 360;

/** 检查是否可以迁都到指定州 */
export function canMoveCapital(charId: string, targetZhouId: string): { ok: boolean; reason?: string } {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const char = charStore.characters.get(charId);
  if (!char) return { ok: false, reason: '角色不存在' };

  // 目标州必须是自己控制的
  const controlled = terrStore.controllerIndex.get(charId);
  if (!controlled || !controlled.has(targetZhouId)) {
    return { ok: false, reason: '不是己方控制的州' };
  }

  // 目标州必须是州级
  const t = terrStore.territories.get(targetZhouId);
  if (!t || t.tier !== 'zhou') return { ok: false, reason: '目标不是州级领地' };

  // 不能选当前 capital
  if (char.capital === targetZhouId) return { ok: false, reason: '已是当前治所' };

  // 冷却检查
  if (char.capitalCooldown) {
    const now = toAbsoluteDay(useTurnManager.getState().currentDate);
    if (now - char.capitalCooldown < MOVE_CAPITAL_COOLDOWN) {
      return { ok: false, reason: '迁都冷却中' };
    }
  }

  return { ok: true };
}

/** 执行迁都 */
export function executeMoveCapital(charId: string, targetZhouId: string): void {
  const check = canMoveCapital(charId, targetZhouId);
  if (!check.ok) return;

  const now = toAbsoluteDay(useTurnManager.getState().currentDate);
  useCharacterStore.getState().updateCharacter(charId, {
    capital: targetZhouId,
    capitalCooldown: now,
  });
}

/** 获取可迁都的州列表 */
export function getMoveCapitalOptions(charId: string): Array<{ zhouId: string; name: string; population: number }> {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const char = charStore.characters.get(charId);
  if (!char) return [];

  const controlled = terrStore.controllerIndex.get(charId);
  if (!controlled) return [];

  const options: Array<{ zhouId: string; name: string; population: number }> = [];
  for (const tid of controlled) {
    if (tid === char.capital) continue;
    const t = terrStore.territories.get(tid);
    if (t && t.tier === 'zhou') {
      options.push({ zhouId: t.id, name: t.name, population: t.basePopulation });
    }
  }
  // 按人口降序
  options.sort((a, b) => b.population - a.population);
  return options;
}
