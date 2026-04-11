// ===== "计谋"交互入口 + executeInitiateScheme =====
//
// 玩家从交互菜单选"计谋"后弹 SchemeInitFlow 选具体计谋类型 + 参数。
// 真正发起调用 executeInitiateScheme，遵守 execute 二次校验契约。

import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import { useSchemeStore } from '@engine/scheme/SchemeStore';
import {
  buildSchemeContext,
  type SchemeInstance,
} from '@engine/scheme';
import { calcSchemeLimit, getAllSchemeTypes, getSchemeType } from '@engine/scheme';
import { getAlienationMethod } from '@engine/scheme/types/alienation';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { EventPriority } from '@engine/types';
import { toAbsoluteDay } from '@engine/dateUtils';
import { debugLog } from '@engine/debugLog';

// ── 交互注册 ─────────────────────────────────────────

registerInteraction({
  id: 'scheme',
  name: '计谋',
  icon: '🎯',
  canShow: (player, target) => {
    if (player.id === target.id) return false;
    if (!player.alive || !target.alive) return false;
    // 至少有一种已注册的计谋类型对该 target 可见
    const ctx = buildSchemeContext();
    return getAllSchemeTypes().some((def) => def.canShow(player, target, ctx));
  },
  canExecuteCheck: (player) => {
    const limit = calcSchemeLimit(player.abilities.strategy);
    const active = useSchemeStore.getState().getActiveSchemeCount(player.id);
    if (active >= limit) return `谋力有限（${active}/${limit}）`;
    return null;
  },
  paramType: 'scheme',
});

// ── 执行函数 ─────────────────────────────────────────

/**
 * 玩家发起计谋。必须遵守 execute 二次校验契约：
 * - parseParams 失败 → false
 * - canInitiate 失败 → false
 * - 并发上限达到 → false
 * - 资源不足 → false
 * 任一不过返回 false（视为 stale），不写任何状态。
 *
 * @param rawParams 任意 raw 形态入参（UI 表单或 NPC behavior 提供），由 def.parseParams 强类型化
 * @param precomputedRateOverride v2 AI 方法路径专用：LLM 评估得到的最终 initial rate（绕过基础公式）。
 *   v1 预设方法路径永远 undefined。语义从旧的"bonus 叠加"改为"直接覆盖最终 rate"。
 */
export function executeInitiateScheme(
  initiatorId: string,
  schemeTypeId: string,
  rawParams: unknown,
  precomputedRateOverride?: number,
): boolean {
  const def = getSchemeType(schemeTypeId);
  if (!def) {
    debugLog('scheme', `[计谋] unknown schemeTypeId: ${schemeTypeId}`);
    return false;
  }

  // 入口守卫：raw → 强类型 params
  const params = def.parseParams(rawParams);
  if (!params) {
    debugLog('scheme', `[计谋] parseParams 失败: ${schemeTypeId}`);
    return false;
  }

  const cs = useCharacterStore.getState();
  const initiator = cs.characters.get(initiatorId);
  if (!initiator?.alive) return false;

  const ctx = buildSchemeContext();

  // 二次校验：合法性（AI 方法的 override 守卫也走这里）
  const reason = def.canInitiate(initiator, params, ctx, precomputedRateOverride);
  if (reason) {
    debugLog('scheme', `[计谋] canInitiate 失败: ${reason}`);
    return false;
  }

  // 二次校验：并发上限
  const limit = calcSchemeLimit(initiator.abilities.strategy);
  if (useSchemeStore.getState().getActiveSchemeCount(initiatorId) >= limit) {
    debugLog('scheme', `[计谋] 并发上限达到`);
    return false;
  }

  // 二次校验：per-(initiator, target, type) CD（365 天内不能重复针对同一目标）
  const currentAbsDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  if (useSchemeStore.getState().hasRecentScheme(
    initiatorId, params.primaryTargetId, schemeTypeId, currentAbsDay,
  )) {
    debugLog('scheme', `[计谋] per-target CD 未过`);
    return false;
  }

  // 二次校验：资源
  if (initiator.resources.money < def.costMoney) return false;

  // 扣费
  cs.updateCharacter(initiatorId, {
    resources: {
      ...initiator.resources,
      money: initiator.resources.money - def.costMoney,
    },
  });

  // 构建实例
  const result = def.initInstance(initiator, params, ctx, precomputedRateOverride);
  const instance: SchemeInstance = {
    id: crypto.randomUUID(),
    schemeTypeId,
    initiatorId,
    primaryTargetId: params.primaryTargetId,
    startDate: useTurnManager.getState().currentDate,
    status: 'active',
    phase: {
      current: 1,
      total: def.phaseCount,
      progress: 0,
      phaseDuration: def.baseDurationDays,
    },
    snapshot: result.snapshot,
    currentSuccessRate: result.initialSuccessRate,
    data: result.data,
  };
  useSchemeStore.getState().addScheme(instance);

  // 史书 emit
  // 离间事件必须带上 secondaryTarget 和方法名；拉拢只有 initiator/primaryTarget
  const target = cs.characters.get(params.primaryTargetId);
  const targetName = target?.name ?? '?';
  const chronicleActors = [initiatorId, params.primaryTargetId];
  let description = `${initiator.name}对${targetName}发动${def.name}`;

  if (instance.data.kind === 'alienation') {
    const secondary = cs.characters.get(instance.data.secondaryTargetId);
    const secondaryName = secondary?.name ?? '?';
    const method = getAlienationMethod(instance.data.methodId);
    const methodName = method?.name ?? instance.data.methodId;
    chronicleActors.push(instance.data.secondaryTargetId);
    description = `${initiator.name}以${methodName}离间${targetName}与${secondaryName}`;
  }

  emitChronicleEvent({
    type: def.chronicleTypes.initiate,
    actors: chronicleActors,
    territories: [],
    description,
    priority: EventPriority.Normal,
  });

  debugLog('scheme', `[${def.name}] ${initiator.name} → ${targetName} 初始成功率 ${Math.round(result.initialSuccessRate)}%`);
  return true;
}

/**
 * 玩家取消进行中的计谋（v1 简化：直接 remove，无费用退还、无副作用）。
 * 仅允许取消自己发起的计谋。
 */
export function cancelScheme(schemeId: string): boolean {
  const store = useSchemeStore.getState();
  const scheme = store.schemes.get(schemeId);
  if (!scheme) return false;
  const playerId = useCharacterStore.getState().playerId;
  if (scheme.initiatorId !== playerId) return false;
  if (scheme.status !== 'active') return false;
  store.removeScheme(schemeId);
  debugLog('scheme', `[计谋] 玩家取消 ${scheme.schemeTypeId} ${schemeId}`);
  return true;
}
