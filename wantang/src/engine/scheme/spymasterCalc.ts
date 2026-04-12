// ===== 谋主系统纯函数 =====
//
// resolveSpymaster：解析某角色的实际谋主（无指定/已死/非直属臣属 → 退化为自身）
// autoSelectSpymaster：NPC 自动选谋主（直属臣属中 strategy 最高者）
// refreshNpcSpymasters：月结批量刷新 NPC 谋主

import type { Character } from '@engine/character/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useSchemeStore } from './SchemeStore';
import { debugLog } from '@engine/debugLog';

/**
 * 解析某角色的谋主。
 * - spymasters map 中有指定 → 检查该人存活且仍是直属臣属 → 返回该角色
 * - 否则退化为自身
 */
export function resolveSpymaster(
  charId: string,
  spymasters: Map<string, string>,
  characters: Map<string, Character>,
  vassalIndex: Map<string, Set<string>>,
): Character {
  const smId = spymasters.get(charId);
  if (smId && smId !== charId) {
    const sm = characters.get(smId);
    if (sm?.alive) {
      const vassals = vassalIndex.get(charId);
      if (vassals?.has(smId)) return sm;
    }
  }
  return characters.get(charId)!;
}

/**
 * NPC 自动选谋主：直属臣属中 strategy 最高者。
 * 若最高 strategy <= 自身 strategy，则不指定（自己就是最佳谋主）。
 * @returns 选中的臣属 ID，或 null（不指定 / 自身更优）
 */
export function autoSelectSpymaster(
  charId: string,
  characters: Map<string, Character>,
  vassalIndex: Map<string, Set<string>>,
): string | null {
  const self = characters.get(charId);
  if (!self?.alive) return null;
  const vassals = vassalIndex.get(charId);
  if (!vassals || vassals.size === 0) return null;

  let bestId: string | null = null;
  let bestStrat = self.abilities.strategy; // 门槛 = 自身
  for (const vId of vassals) {
    const v = characters.get(vId);
    if (!v?.alive) continue;
    if (v.abilities.strategy > bestStrat) {
      bestStrat = v.abilities.strategy;
      bestId = vId;
    }
  }
  return bestId;
}

/**
 * 月结批量刷新 NPC 谋主。跳过玩家（玩家手动管理）。
 * 调用时机：月结 runSchemeSystem 之前。
 */
export function refreshNpcSpymasters(): void {
  const cs = useCharacterStore.getState();
  const store = useSchemeStore.getState();
  for (const char of cs.characters.values()) {
    if (!char.alive) continue;
    if (char.id === cs.playerId) continue;
    if (!char.isRuler) continue; // 只有 ruler 才有臣属可选
    const best = autoSelectSpymaster(char.id, cs.characters, cs.vassalIndex);
    if (best) {
      store.setSpymaster(char.id, best);
    } else {
      store.removeSpymaster(char.id);
    }
  }
  debugLog('scheme', `[谋主] NPC 谋主刷新完成，当前指定 ${store.spymasters.size} 人`);
}
