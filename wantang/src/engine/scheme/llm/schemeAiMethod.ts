// ===== 计谋 AI 方法 orchestration =====
//
// 职责：
// - 加载 LlmConfig + 检测 mock 兜底
// - 委托 def.buildAiMethodPrompt 构造 prompt
// - 调用 provider.generate
// - 严格 parse 响应（整段必须是一个整数）
// - clamp 到 [-20, 100] 后返回 { ok, rate, raw }
//
// 不处理 UI loading 状态；abort 信号由 UI 层通过 signal 参数传入。
// 见 plan：C:\Users\zxy19\.claude\plans\snoopy-dancing-manatee.md

import type { LlmPrompt } from '@engine/chronicle/llm/LlmProvider';
import { createProvider } from '@engine/chronicle/llm/createProvider';
import { loadLlmConfig } from '@engine/chronicle/llm/llmConfig';
import {
  buildSchemeContext,
  calcSchemeLimit,
  getSchemeType,
  useSchemeStore,
} from '@engine/scheme';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTurnManager } from '@engine/TurnManager';
import { toAbsoluteDay } from '@engine/dateUtils';
import { debugLog } from '@engine/debugLog';

/** AI 方法 rate 值域，与 alienation.ts 的 AI 分支 clamp 保持一致 */
const AI_RATE_MIN = -20;
const AI_RATE_MAX = 100;

export type EvaluateCustomResult =
  | { ok: true; rate: number; raw: string }
  | { ok: false; error: string };

/**
 * 评估玩家自拟的计谋策略。
 *
 * 调用方（SchemeInitFlow）负责：
 * - 提供 AbortController 的 signal；关闭弹窗时 abort 以中断 pending fetch
 * - 拿到 rate 后作为 precomputedRateOverride 传给 executeInitiateScheme
 *
 * 失败模式全部走 `{ ok: false, error }` 返回，不抛异常——UI 展示 error 文案并退回写入界面。
 */
export async function evaluateCustomSchemeRate(args: {
  initiatorId: string;
  schemeTypeId: string;
  rawParams: unknown;
  customDescription: string;
  signal: AbortSignal;
}): Promise<EvaluateCustomResult> {
  const { initiatorId, schemeTypeId, rawParams, customDescription, signal } = args;

  // 1. 配置 + mock 兜底检测
  const cfg = await loadLlmConfig();
  const effectiveProvider =
    cfg.provider === 'direct' && !cfg.apiKey?.trim() ? 'mock' : cfg.provider;
  if (effectiveProvider !== 'direct') {
    return { ok: false, error: '未配置 LLM API Key，请在「设置 → LLM 配置」中配置。' };
  }

  // 2. type def + prompt builder 校验
  const def = getSchemeType(schemeTypeId);
  if (!def) return { ok: false, error: `未知计谋类型：${schemeTypeId}` };
  if (!def.buildAiMethodPrompt) {
    return { ok: false, error: `${def.name} 不支持自拟妙计` };
  }

  // 3. params 强类型化
  const params = def.parseParams(rawParams);
  if (!params) return { ok: false, error: 'params 解析失败' };

  // 4. 取 initiator + 构造 ctx
  const cs = useCharacterStore.getState();
  const initiator = cs.characters.get(initiatorId);
  if (!initiator?.alive) return { ok: false, error: '主谋不存在或已身故' };

  const ctx = buildSchemeContext();

  // 5. Preflight —— 镜像 executeInitiateScheme 的 stale 校验序列，避免对无效局面白烧 LLM 调用：
  //    (a) def.canInitiate（skipAiGuard: true 绕过"AI 无 override"守卫，保留其余通用校验）
  //    (b) 并发上限
  //    (c) per-(initiator, target, type) 365 天 CD
  //    (d) 资源（canInitiate 已涵盖，这里不重复）
  //    LLM 返回后 executeInitiateScheme 会再跑一次不带 skipAiGuard 的 canInitiate 最终兜底。
  const preflightReason = def.canInitiate(initiator, params, ctx, undefined, { skipAiGuard: true });
  if (preflightReason) {
    return { ok: false, error: preflightReason };
  }
  const concurrencyLimit = calcSchemeLimit(initiator.abilities.strategy);
  if (useSchemeStore.getState().getActiveSchemeCount(initiatorId) >= concurrencyLimit) {
    return { ok: false, error: '谋力已达上限，无法再新增计谋' };
  }
  const currentAbsDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  if (useSchemeStore.getState().hasRecentScheme(
    initiatorId, params.primaryTargetId, schemeTypeId, currentAbsDay,
  )) {
    return { ok: false, error: '同一目标的同类计谋冷却未过（365 天内不能重复施展）' };
  }

  // 6. 构造 prompt + 调试日志
  let prompt: LlmPrompt;
  try {
    prompt = def.buildAiMethodPrompt(initiator, params, customDescription, ctx);
  } catch (e) {
    return { ok: false, error: `prompt 构造失败：${(e as Error).message}` };
  }

  // 调试日志：完整 prompt 仅在 window.__DEBUG__.scheme = true 时输出。
  // 注意：prompt 包含玩家自拟描述 + 三方人物上下文，是隐秘信息，禁止无条件打到控制台。
  debugLog('scheme',
    `[AI 方法] prompt 构造完成\n── system ──\n${prompt.system}\n── user ──\n${prompt.user}`);

  // 7. 调 LLM
  const provider = createProvider(cfg);
  let raw: string;
  try {
    raw = await provider.generate(prompt, {
      maxTokens: 120,
      temperature: 0.4,
      signal,
    });
  } catch (e) {
    if (signal.aborted) return { ok: false, error: '已取消' };
    return { ok: false, error: `LLM 调用失败：${(e as Error).message}` };
  }

  // 8. 严格 parse：整段必须是一个带符号整数（允许前后空白 + 可选 % 后缀）
  const rate = parseRate(raw);
  if (rate === null) {
    debugLog('scheme', `[AI 方法] 无法解析 LLM 响应：${raw.slice(0, 200)}`);
    return {
      ok: false,
      error: `谋士回应格式错误：${raw.slice(0, 40)}${raw.length > 40 ? '...' : ''}`,
    };
  }

  // 9. clamp
  const clamped = Math.max(AI_RATE_MIN, Math.min(AI_RATE_MAX, rate));
  debugLog('scheme', `[AI 方法] 评估完成 raw=${rate} clamped=${clamped}`);
  return { ok: true, rate: clamped, raw };
}

/**
 * UI mount 时异步探测 LLM 是否可用。
 * 返回 false → 自拟妙计卡片 disabled + 显示 tooltip 引导配置。
 */
export async function isAiMethodAvailable(): Promise<boolean> {
  const cfg = await loadLlmConfig();
  if (cfg.provider !== 'direct') return false;
  if (!cfg.apiKey?.trim()) return false;
  return true;
}

/**
 * 严格提取整数。
 *
 * 契约：整段 trim + 去全/半角百分号后，必须整体匹配 /^-?\d+(?:\.\d+)?$/，否则返回 null。
 * 设计动机：LLM 偏题（"先说 3 点理由，最终 45"）会被拒而不是误吃到第一个数字。
 * 小数四舍五入到整数。
 */
function parseRate(text: string): number | null {
  const cleaned = text.replace(/[％%]/g, '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

// 导出 parseRate 供测试（如果未来加入单测）
export { parseRate as __parseRate_test };
