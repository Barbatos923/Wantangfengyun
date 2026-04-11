// ===== 计谋日结系统 =====
//
// 每日推进所有活跃 scheme 的进度，触发死亡终止 / 阶段切换 / 终局结算。
// 由 settlement.ts 在 daily / monthly 两处挂载点调用：
//   - 非月初: runDailySettlement 内, runWarSystem 之后, runDailyNpcEngine 之前
//   - 月初:   runMonthlySettlement 内, runCharacterSystem 之后, runDailyNpcEngine 之前
//
// **mutation 纪律**：所有状态变更必须走 SchemeStore 接口（updateScheme / setStatus），
// 严禁 `scheme.phase.progress += 1` 这种直接 mutate。

import type { GameDate } from '@engine/types';
import type { SchemeInstance, SchemeContext, SchemeEffectOutcome } from './types';
import { useSchemeStore } from './SchemeStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { useStoryEventBus } from '@engine/storyEventBus';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { toAbsoluteDay } from '@engine/dateUtils';
import { random } from '@engine/random';
import { getSchemeType } from './registry';
import { debugLog } from '@engine/debugLog';

// ── 上下文构建 ────────────────────────────────────────

/**
 * 构建 SchemeContext 快照。lazy 函数避免预计算所有 opinion/alliance pair。
 * 同一 tick 内多次调用 getOpinion 重复计算可接受（数据量小），不做缓存。
 */
export function buildSchemeContext(): SchemeContext {
  const cs = useCharacterStore.getState();
  const ts = useTerritoryStore.getState();
  const ws = useWarStore.getState();
  const turn = useTurnManager.getState();
  const currentDay = toAbsoluteDay(turn.currentDate);

  return {
    characters: cs.characters,
    territories: ts.territories,
    currentDate: turn.currentDate,
    getOpinion: (aId, bId) => {
      const a = cs.characters.get(aId);
      const b = cs.characters.get(bId);
      if (!a || !b) return 0;
      const bExpectedLeg = ts.expectedLegitimacy.get(bId) ?? null;
      return calculateBaseOpinion(
        a,
        b,
        bExpectedLeg,
        ts.policyOpinionCache.get(aId) ?? null,
        ts.policyOpinionCache.get(bId) ?? null,
      );
    },
    hasAlliance: (a, b) => ws.hasAlliance(a, b, currentDay),
    vassalIndex: cs.vassalIndex,
  };
}

// ── 死亡终止检查 ──────────────────────────────────────

/**
 * 计谋是否仍然有效：发起人 / primaryTarget / secondaryTarget（若有）任一死亡 → false。
 */
function isSchemeStillValid(
  scheme: SchemeInstance,
  cs: ReturnType<typeof useCharacterStore.getState>,
): boolean {
  const initiator = cs.characters.get(scheme.initiatorId);
  if (!initiator?.alive) return false;
  const primary = cs.characters.get(scheme.primaryTargetId);
  if (!primary?.alive) return false;
  if (scheme.data.kind === 'alienation') {
    const secondary = cs.characters.get(scheme.data.secondaryTargetId);
    if (!secondary?.alive) return false;
  }
  return true;
}

// ── 主入口 ────────────────────────────────────────────

/**
 * 推进所有活跃 scheme。每日调用一次（非月初由 runDailySettlement，月初由 runMonthlySettlement）。
 *
 * @param _date 当前日期（暂未使用，预留给未来基于日期的判断）
 */
export function runSchemeSystem(_date: GameDate): void {
  const store = useSchemeStore.getState();

  // 早退：无活跃 scheme 时跳过整个上下文构建（绝大多数日子的 fast path）
  const active = store.getAllActive();
  if (active.length === 0) return;

  const cs = useCharacterStore.getState();
  const ctx = buildSchemeContext();

  for (const scheme of active) {
    // 1. 死亡终止
    if (!isSchemeStillValid(scheme, cs)) {
      store.setStatus(scheme.id, 'terminated');
      notifySchemeTerminated(scheme);
      debugLog('scheme', `[计谋] terminated ${scheme.schemeTypeId} ${scheme.id}`);
      continue;
    }

    // 2. 推进进度（必须走 store 接口）
    const newProgress = scheme.phase.progress + 1;

    // 3. 阶段未完成 → 单纯推进
    if (newProgress < scheme.phase.phaseDuration) {
      store.updateScheme(scheme.id, {
        phase: { ...scheme.phase, progress: newProgress },
      });
      continue;
    }

    // 4. 阶段完成
    const def = getSchemeType(scheme.schemeTypeId);
    if (!def) {
      // 找不到类型定义（reg 缺失/旧档遗留）→ 终止避免死循环
      console.warn(`[scheme] unknown schemeTypeId: ${scheme.schemeTypeId}, terminating ${scheme.id}`);
      store.setStatus(scheme.id, 'terminated');
      continue;
    }

    if (scheme.phase.current < scheme.phase.total) {
      // 复杂计谋：进入下一阶段，构造临时快照供 onPhaseComplete 计算
      const tickedScheme: SchemeInstance = {
        ...scheme,
        phase: { ...scheme.phase, progress: newProgress },
      };
      const newRate = def.onPhaseComplete?.(tickedScheme, ctx) ?? scheme.currentSuccessRate;
      store.updateScheme(scheme.id, {
        phase: {
          ...scheme.phase,
          current: scheme.phase.current + 1,
          progress: 0,
        },
        currentSuccessRate: newRate,
      });
      debugLog('scheme', `[计谋] ${scheme.schemeTypeId} ${scheme.id} → phase ${scheme.phase.current + 1}/${scheme.phase.total}, rate=${Math.round(newRate)}%`);
    } else {
      // 最终阶段完成 → 结算
      const outcome = def.resolve(scheme, random, ctx);
      def.applyEffects(scheme, outcome, ctx);
      // 同时写入 status 和 resolveDate（供 per-target CD 判定）
      store.updateScheme(scheme.id, {
        status: outcome.kind,
        resolveDate: { ...useTurnManager.getState().currentDate },
      });
      notifySchemeResolved(scheme, outcome);
      debugLog('scheme', `[计谋] ${scheme.schemeTypeId} ${scheme.id} resolved → ${outcome.kind}`);
    }
  }
}

// ── 玩家通知 ──────────────────────────────────────────

/**
 * 计谋结算时通知玩家（D6 决策）。
 * 玩家是发起人 OR 玩家是任一目标 → 推送 StoryEvent（纯通知，effectKey='noop:notification'）。
 */
function notifySchemeResolved(scheme: SchemeInstance, outcome: SchemeEffectOutcome): void {
  const cs = useCharacterStore.getState();
  const playerId = cs.playerId;
  if (!playerId) return;

  const isInitiator = scheme.initiatorId === playerId;
  const isPrimaryTarget = scheme.primaryTargetId === playerId;
  const isSecondaryTarget = scheme.data.kind === 'alienation'
    && scheme.data.secondaryTargetId === playerId;
  if (!isInitiator && !isPrimaryTarget && !isSecondaryTarget) return;

  const def = getSchemeType(scheme.schemeTypeId);
  const schemeName = def?.name ?? '计谋';
  const titlePrefix = isInitiator ? '你的' : '针对你的';
  const outcomeText = outcome.kind === 'success' ? '已成功' : '已败露';
  const title = `${titlePrefix}${schemeName}${outcomeText}`;

  const actors: Array<{ characterId: string; role: string }> = [
    { characterId: scheme.initiatorId, role: isInitiator ? '你（主谋）' : '主谋' },
    { characterId: scheme.primaryTargetId, role: isPrimaryTarget ? '你（目标）' : '目标' },
  ];
  if (scheme.data.kind === 'alienation') {
    actors.push({
      characterId: scheme.data.secondaryTargetId,
      role: isSecondaryTarget ? '你（被离间方）' : '次要目标',
    });
  }

  useStoryEventBus.getState().pushStoryEvent({
    id: crypto.randomUUID(),
    title,
    description: outcome.description,
    actors,
    options: [{
      label: '知悉',
      description: '',
      effects: [],
      effectKey: 'noop:notification',
      effectData: {},
      onSelect: () => { /* noop */ },
    }],
  });
}

/** 死亡终止时通知玩家 */
function notifySchemeTerminated(scheme: SchemeInstance): void {
  const cs = useCharacterStore.getState();
  const playerId = cs.playerId;
  if (!playerId) return;

  const isInitiator = scheme.initiatorId === playerId;
  const isPrimaryTarget = scheme.primaryTargetId === playerId;
  const isSecondaryTarget = scheme.data.kind === 'alienation'
    && scheme.data.secondaryTargetId === playerId;
  if (!isInitiator && !isPrimaryTarget && !isSecondaryTarget) return;

  const def = getSchemeType(scheme.schemeTypeId);
  const schemeName = def?.name ?? '计谋';

  const actors: Array<{ characterId: string; role: string }> = [
    { characterId: scheme.initiatorId, role: '主谋' },
    { characterId: scheme.primaryTargetId, role: '目标' },
  ];
  if (scheme.data.kind === 'alienation') {
    actors.push({ characterId: scheme.data.secondaryTargetId, role: '次要目标' });
  }

  useStoryEventBus.getState().pushStoryEvent({
    id: crypto.randomUUID(),
    title: `${schemeName}终止`,
    description: `因关键人物身故，进行中的${schemeName}已自然终止。`,
    actors,
    options: [{
      label: '知悉',
      description: '',
      effects: [],
      effectKey: 'noop:notification',
      effectData: {},
      onSelect: () => { /* noop */ },
    }],
  });
}
