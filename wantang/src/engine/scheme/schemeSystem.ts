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
import { EventPriority } from '@engine/types';
import type { SchemeInstance, SchemeContext, SchemeEffectOutcome, SchemeTypeDef } from './types';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
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
import { clamp } from './schemeCalc';
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

  const schemeStore = useSchemeStore.getState();

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
    spymasters: schemeStore.spymasters,
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

// ── 暴露检测 ──────────────────────────────────────────

/**
 * 阶段完成时检测暴露。
 * 发现率 = baseDetectionRate + (防御方谋主strat - 攻击方谋主strat) × 3 + 方法修正
 * clamp 到 [2, 85]。
 */
function checkExposure(
  scheme: SchemeInstance,
  def: SchemeTypeDef,
  rng: () => number,
): boolean {
  const config = def.exposureConfig;
  if (!config) return false;

  const attackerStrat = scheme.snapshot.spymasterStrategy;
  const defenderStrat = scheme.snapshot.targetSpymasterStrategy;
  const stratDiff = defenderStrat - attackerStrat;
  const methodMod = config.getMethodExposureModifier?.(scheme) ?? 0;

  const rate = clamp(config.baseDetectionRate + stratDiff * 3 + methodMod, 2, 85);
  debugLog('scheme', `[暴露检测] ${scheme.schemeTypeId} ${scheme.id} | 发现率 ${Math.round(rate)}% (base=${config.baseDetectionRate}, stratDiff=${stratDiff}, methodMod=${methodMod})`);
  return rng() * 100 < rate;
}

/**
 * 暴露后果：独立处理好感/威望/chronicle，不调 def.applyEffects（避免双写史书）。
 */
function applyExposure(
  scheme: SchemeInstance,
  def: SchemeTypeDef,
  _ctx: SchemeContext,
): void {
  const config = def.exposureConfig!;
  const cs = useCharacterStore.getState();
  const initiator = cs.characters.get(scheme.initiatorId);
  const target = cs.characters.get(scheme.primaryTargetId);
  const initiatorName = initiator?.name ?? '?';
  const targetName = target?.name ?? '?';

  // 好感惩罚：目标对发起人
  cs.addOpinion(scheme.primaryTargetId, scheme.initiatorId, {
    reason: `${def.name}败露`,
    value: config.opinionPenalty,
    decayable: true,
  });
  // 离间：次要目标也产生好感惩罚
  if (scheme.data.kind === 'alienation') {
    cs.addOpinion(scheme.data.secondaryTargetId, scheme.initiatorId, {
      reason: `${def.name}败露`,
      value: config.opinionPenalty,
      decayable: true,
    });
  }

  // 威望惩罚
  if (initiator && config.prestigePenalty > 0) {
    cs.updateCharacter(scheme.initiatorId, {
      resources: {
        ...initiator.resources,
        prestige: Math.max(0, initiator.resources.prestige - config.prestigePenalty),
      },
    });
  }

  // chronicle emit（仅 exposed 类型，不重复 emit 失败）
  if (def.chronicleTypes?.exposed) {
    const actors = [scheme.initiatorId, scheme.primaryTargetId];
    if (scheme.data.kind === 'alienation') actors.push(scheme.data.secondaryTargetId);
    const description = `${initiatorName}对${targetName}的${def.name}被察觉`;
    emitChronicleEvent({
      type: def.chronicleTypes.exposed,
      actors,
      territories: [],
      description,
      priority: EventPriority.Normal,
    });
  }
}

/**
 * 暴露时通知玩家。区分发起人和目标两种视角。
 */
function notifySchemeExposed(scheme: SchemeInstance, def: SchemeTypeDef): void {
  const cs = useCharacterStore.getState();
  const playerId = cs.playerId;
  if (!playerId) return;

  const schemeName = def.name;
  const initiator = cs.characters.get(scheme.initiatorId);
  const target = cs.characters.get(scheme.primaryTargetId);

  const actors: Array<{ characterId: string; role: string }> = [
    { characterId: scheme.initiatorId, role: scheme.initiatorId === playerId ? '你（主谋）' : '主谋' },
    { characterId: scheme.primaryTargetId, role: scheme.primaryTargetId === playerId ? '你（目标）' : '目标' },
  ];
  if (scheme.data.kind === 'alienation') {
    actors.push({ characterId: scheme.data.secondaryTargetId, role: '次要目标' });
  }

  if (scheme.initiatorId === playerId) {
    // 玩家是发起人 —— 坏消息
    useStoryEventBus.getState().pushStoryEvent({
      id: crypto.randomUUID(),
      title: `你的${schemeName}被识破`,
      description: `你对${target?.name ?? '?'}的${schemeName}在进行中被对方察觉，计谋被迫终止。`,
      actors,
      options: [{ label: '知悉', description: '', effects: [], effectKey: 'noop:notification', effectData: {}, onSelect: () => {} }],
    });
  } else if (scheme.primaryTargetId === playerId ||
    (scheme.data.kind === 'alienation' && scheme.data.secondaryTargetId === playerId)) {
    // 玩家是目标/次要目标 —— 好消息
    useStoryEventBus.getState().pushStoryEvent({
      id: crypto.randomUUID(),
      title: `${initiator?.name ?? '?'}的${schemeName}被识破`,
      description: `你的谋主察觉了${initiator?.name ?? '?'}对你策划的${schemeName}阴谋，及时将其挫败。`,
      actors,
      options: [{ label: '知悉', description: '', effects: [], effectKey: 'noop:notification', effectData: {}, onSelect: () => {} }],
    });
  }
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

      // ★ 暴露检测（阶段完成时）
      if (checkExposure(scheme, def, random)) {
        applyExposure(scheme, def, ctx);
        store.updateScheme(scheme.id, {
          status: 'exposed',
          resolveDate: { ...useTurnManager.getState().currentDate },
        });
        notifySchemeExposed(scheme, def);
        debugLog('scheme', `[计谋] ${scheme.schemeTypeId} ${scheme.id} EXPOSED at phase ${scheme.phase.current}/${scheme.phase.total}`);
        continue;
      }

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
      // 最终阶段完成 → 结算前最后一次暴露检测
      if (checkExposure(scheme, def, random)) {
        applyExposure(scheme, def, ctx);
        store.updateScheme(scheme.id, {
          status: 'exposed',
          resolveDate: { ...useTurnManager.getState().currentDate },
        });
        notifySchemeExposed(scheme, def);
        debugLog('scheme', `[计谋] ${scheme.schemeTypeId} ${scheme.id} EXPOSED at final phase`);
        continue;
      }

      // 正常结算
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
 * 计谋结算时通知玩家（成功/失败）。
 * 仅在玩家是发起人时推 StoryEvent。
 * 暴露通知走 notifySchemeExposed（玩家作为发起人或目标都通知）。
 */
function notifySchemeResolved(scheme: SchemeInstance, outcome: SchemeEffectOutcome): void {
  const cs = useCharacterStore.getState();
  const playerId = cs.playerId;
  if (!playerId) return;

  if (scheme.initiatorId !== playerId) return;

  const def = getSchemeType(scheme.schemeTypeId);
  const schemeName = def?.name ?? '计谋';
  const outcomeText = outcome.kind === 'success' ? '已成功' : '已败露';
  const title = `你的${schemeName}${outcomeText}`;

  const actors: Array<{ characterId: string; role: string }> = [
    { characterId: scheme.initiatorId, role: '你（主谋）' },
    { characterId: scheme.primaryTargetId, role: '目标' },
  ];
  if (scheme.data.kind === 'alienation') {
    actors.push({
      characterId: scheme.data.secondaryTargetId,
      role: '次要目标',
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

/** 死亡终止时通知玩家（v1 仅发起人） */
function notifySchemeTerminated(scheme: SchemeInstance): void {
  const cs = useCharacterStore.getState();
  const playerId = cs.playerId;
  if (!playerId) return;

  if (scheme.initiatorId !== playerId) return;

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
