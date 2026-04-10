// ===== 角色地理位置解析（纯函数） =====
//
// resolveLocation 不读 Store，由调用方传入快照。
// 优先级：行营指挥官 → 治所 → 领主治所 → undefined

import type { Character } from './types';
import type { Campaign } from '@engine/military/types';

/** 上溯领主链最大深度（防环） */
const MAX_OVERLORD_DEPTH = 5;

/**
 * 解析角色当前物理位置。
 *
 * 1. 如果角色是某个活跃行营的 commanderId → campaign.locationId
 * 2. 如果角色有 capital → capital
 * 3. 如果角色有 overlordId → 递归取领主的 capital（最多上溯 MAX_OVERLORD_DEPTH 层）
 * 4. 以上都没有 → undefined
 */
export function resolveLocation(
  charId: string,
  characters: Map<string, Character>,
  campaigns: Map<string, Campaign>,
): string | undefined {
  // 1. 行营指挥官 → 行营位置
  for (const campaign of campaigns.values()) {
    if (campaign.commanderId === charId) return campaign.locationId;
  }

  const char = characters.get(charId);
  if (!char) return undefined;

  // 2. 有治所 → 治所
  if (char.capital) return char.capital;

  // 3. 上溯领主链找 capital
  let current: Character | undefined = char;
  for (let depth = 0; depth < MAX_OVERLORD_DEPTH; depth++) {
    if (!current?.overlordId) break;
    current = characters.get(current.overlordId);
    if (current?.capital) return current.capital;
  }

  // 4. 兜底
  return undefined;
}
