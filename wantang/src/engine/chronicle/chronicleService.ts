// ===== Chronicle Service：调度中枢 =====
//
// 职责：
// 1. 注册 monthly callback，月初触发上月摘要 + 跨年触发上年史
// 2. in-flight 任务管理：requestId / playthroughId 校验 / AbortController
// 3. reconcile：读档后把 generating 降级为 pending 并重新入队
// 4. 失败兜底：真失败 → MockProvider；主动取消 → 直接丢弃，不写 store
// 5. 通知：年史完成走 useTurnManager.addEvent（不暂停游戏）
//
// 与 GPT 评审 v2.1 对齐：AbortError 不降级 Mock。

import { useTurnManager } from '@engine/TurnManager';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import type { GameEvent } from '@engine/types';
import { EventPriority } from '@engine/types';
import { debugLog } from '@engine/debugLog';

import { useChronicleStore, monthKey } from './ChronicleStore';
import type { MonthDraft } from './types';
import {
  buildMonthPrompt,
  buildYearPrompt,
  type NameTable,
  type WorldSnapshot,
} from './chroniclePromptBuilder';
import { createProvider } from './llm/createProvider';
import { isAbortError, type LlmProvider } from './llm/LlmProvider';
import { mockProvider } from './llm/MockProvider';
import { loadLlmConfig } from './llm/llmConfig';

// ── 事件筛选规则（priority 不够，加白名单） ─────────────

const CHRONICLE_TYPE_WHITELIST = new Set<string>([
  '宣战',
  '战争结束',
  '城破',
  '兵变',
  '野战',
  '继位',
  '绝嗣',
  '王朝覆灭',
  '篡夺',
  '建镇',
  '称王',
  '称帝',
  '销毁头衔',
  'chronicle-ready', // 防止递归
]);

function shouldIncludeInChronicle(e: GameEvent): boolean {
  if (e.type === 'chronicle-ready') return false; // 史成通知本身不入史
  if (e.priority >= EventPriority.Major) return true;
  return CHRONICLE_TYPE_WHITELIST.has(e.type);
}

// ── In-flight 任务管理 ──────────────────────────────────

interface InFlightRequest {
  requestId: string;
  playthroughId: string;
  kind: 'month' | 'year';
  year: number;
  month?: number;
  abort: AbortController;
}

const inFlight = new Map<string, InFlightRequest>();

function inFlightKey(kind: 'month' | 'year', year: number, month?: number): string {
  return `${kind}:${year}:${month ?? 0}`;
}

let providerCache: LlmProvider | null = null;
async function getProvider(): Promise<LlmProvider> {
  if (providerCache) return providerCache;
  const cfg = await loadLlmConfig();
  providerCache = createProvider(cfg);
  debugLog('chronicle', '[chronicle] provider =', providerCache.id);
  return providerCache;
}

/** 配置变更后重建 provider。UI 设置面板保存配置时调。 */
export function invalidateProvider(): void {
  providerCache = null;
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random()}`;
}

function startRequest(kind: 'month' | 'year', year: number, month?: number): InFlightRequest {
  const req: InFlightRequest = {
    requestId: newRequestId(),
    playthroughId: useTurnManager.getState().playthroughId,
    kind,
    year,
    month,
    abort: new AbortController(),
  };
  inFlight.set(inFlightKey(kind, year, month), req);
  return req;
}

/** 三重校验：playthrough 未变 + 未被新请求顶掉 + 未 abort。 */
function isRequestStillValid(req: InFlightRequest): boolean {
  if (req.abort.signal.aborted) return false;
  if (useTurnManager.getState().playthroughId !== req.playthroughId) return false;
  const cur = inFlight.get(inFlightKey(req.kind, req.year, req.month));
  if (!cur || cur.requestId !== req.requestId) return false;
  return true;
}

/**
 * 只有当 inFlight 槽里仍是本请求时才删除，避免误删已被新请求顶占的同 key 槽。
 * 关键：stale 路径绝不能 delete(key)，否则会把刚启动的新周目/重试请求一起踢掉。
 */
function clearOwnSlot(req: InFlightRequest): void {
  const key = inFlightKey(req.kind, req.year, req.month);
  const cur = inFlight.get(key);
  if (cur && cur.requestId === req.requestId) {
    inFlight.delete(key);
  }
}

function finishRequest(req: InFlightRequest, writer: () => void): void {
  if (!isRequestStillValid(req)) {
    debugLog('chronicle', '[chronicle] discard stale result', req.kind, req.year, req.month);
    clearOwnSlot(req);
    return;
  }
  writer();
  clearOwnSlot(req);
}

// ── 数据采集 ────────────────────────────────────────────

function collectMonthEvents(year: number, month: number): GameEvent[] {
  const all = useTurnManager.getState().events;
  return all.filter(
    (e) => e.date.year === year && e.date.month === month && shouldIncludeInChronicle(e),
  );
}

function collectMonthDrafts(year: number): MonthDraft[] {
  const store = useChronicleStore.getState();
  const out: MonthDraft[] = [];
  for (let m = 1; m <= 12; m++) {
    const d = store.monthDrafts.get(monthKey(year, m));
    if (d) out.push(d);
  }
  return out;
}

function buildNameTable(events: GameEvent[]): NameTable {
  const characters = useCharacterStore.getState().characters;
  const territories = useTerritoryStore.getState().territories;
  const charNames: Record<string, string> = {};
  const terrNames: Record<string, string> = {};
  for (const e of events) {
    for (const id of e.actors) {
      const c = characters.get(id);
      if (c) charNames[id] = c.name;
    }
    for (const id of e.territories) {
      const t = territories.get(id);
      if (t) terrNames[id] = t.name;
    }
  }
  return { characters: charNames, territories: terrNames };
}

function freezeWorldSnapshot(year: number): WorldSnapshot {
  // 用现成的 controllerIndex（controllerId → Set<terrId>）聚合，
  // 避免再造一套 controller 真相源——CLAUDE.md 明令"查询走索引，禁止全量遍历"。
  const { controllerIndex } = useTerritoryStore.getState();
  const characters = useCharacterStore.getState().characters;

  const top = Array.from(controllerIndex.entries())
    .map(([id, set]) => ({ id, n: set.size }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map(({ id, n }) => ({
      name: characters.get(id)?.name ?? '?',
      territoryCount: n,
    }));

  return {
    year,
    topPowers: top,
    newTitles: [], // v1 暂不追踪；后续补事件流时填
    destroyedTitles: [],
  };
}

// ── 月度摘要生成 ────────────────────────────────────────

async function generateMonthDraft(year: number, month: number): Promise<void> {
  const key = inFlightKey('month', year, month);
  if (inFlight.has(key)) return;

  const req = startRequest('month', year, month);
  useChronicleStore.getState().upsertMonthDraft({
    year,
    month,
    summary: '',
    status: 'generating',
  });

  const events = collectMonthEvents(year, month);
  if (events.length === 0) {
    finishRequest(req, () => {
      useChronicleStore.getState().upsertMonthDraft({
        year,
        month,
        summary: '',
        status: 'done',
        generatedAt: Date.now(),
      });
    });
    return;
  }

  const names = buildNameTable(events);
  const prompt = buildMonthPrompt(year, month, events, names);
  debugLog('chronicle', '[chronicle] month start', year, month, 'events=', events.length);

  let summary: string;
  try {
    const provider = await getProvider();
    summary = await provider.generate(prompt, {
      maxTokens: 400,
      kind: 'month',
      signal: req.abort.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      debugLog('chronicle', '[chronicle] month aborted', year, month);
      clearOwnSlot(req);
      return; // 主动取消：直接丢弃，不写 store，不降级 Mock
    }
    // 真失败 → Mock 兜底（永不抛）
    // eslint-disable-next-line no-console
    console.warn('[chronicle] month LLM failed, fallback to mock:', err);
    try {
      summary = await mockProvider.generate(prompt, {
        maxTokens: 400,
        kind: 'month',
        signal: req.abort.signal,
      });
    } catch (mockErr) {
      if (isAbortError(mockErr)) {
        clearOwnSlot(req);
        return;
      }
      summary = events.map((e) => e.description).join('；');
    }
  }

  finishRequest(req, () => {
    useChronicleStore.getState().upsertMonthDraft({
      year,
      month,
      summary,
      status: 'done',
      generatedAt: Date.now(),
    });
    debugLog('chronicle', '[chronicle] month done', year, month);
  });
}

// ── 年度成史 ───────────────────────────────────────────

async function waitForMonthDrafts(
  year: number,
  opts: { timeoutMs: number; signal: AbortSignal },
): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (opts.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const drafts = useChronicleStore.getState().monthDrafts;
      let pendingCount = 0;
      for (let m = 1; m <= 12; m++) {
        const d = drafts.get(monthKey(year, m));
        // 没有月稿 = 还没生成；status === generating/pending 也算未完
        if (!d || d.status === 'generating' || d.status === 'pending') {
          pendingCount++;
        }
      }
      if (pendingCount === 0) {
        resolve();
        return;
      }
      if (Date.now() - start >= opts.timeoutMs) {
        // 超时也直接 resolve，让年史用现有的稿子勉强成篇
        resolve();
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

async function generateYearChronicle(year: number): Promise<void> {
  const key = inFlightKey('year', year);
  if (inFlight.has(key)) return;

  const req = startRequest('year', year);
  useChronicleStore.getState().upsertYearChronicle({
    year,
    content: '',
    status: 'generating',
    read: false,
  });
  debugLog('chronicle', '[chronicle] year start', year);

  try {
    await waitForMonthDrafts(year, { timeoutMs: 30_000, signal: req.abort.signal });
  } catch (err) {
    if (isAbortError(err)) {
      debugLog('chronicle', '[chronicle] year aborted (waiting drafts)', year);
      clearOwnSlot(req);
      return;
    }
    // waitForMonthDrafts 不会其他抛出，但保险
  }

  // 等完了再读月稿 + 冻结 worldSnapshot
  const drafts = collectMonthDrafts(year);
  const snapshot = freezeWorldSnapshot(year);
  const prompt = buildYearPrompt(year, drafts, snapshot);

  let content: string;
  try {
    const provider = await getProvider();
    content = await provider.generate(prompt, {
      maxTokens: 2000,
      kind: 'year',
      signal: req.abort.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      debugLog('chronicle', '[chronicle] year aborted', year);
      clearOwnSlot(req);
      return;
    }
    // eslint-disable-next-line no-console
    console.warn('[chronicle] year LLM failed, fallback to mock:', err);
    try {
      content = await mockProvider.generate(prompt, {
        maxTokens: 2000,
        kind: 'year',
        signal: req.abort.signal,
      });
    } catch (mockErr) {
      if (isAbortError(mockErr)) {
        clearOwnSlot(req);
        return;
      }
      content = drafts
        .filter((d) => d.summary)
        .map((d) => `${d.month}月：${d.summary}`)
        .join('\n');
    }
  }

  finishRequest(req, () => {
    useChronicleStore.getState().upsertYearChronicle({
      year,
      content,
      status: 'done',
      generatedAt: Date.now(),
      read: false,
    });
    debugLog('chronicle', '[chronicle] year done', year);
    // 通知：走 addEvent，不走 StoryEventBus（不暂停游戏）
    const turn = useTurnManager.getState();
    turn.addEvent({
      id: `chronicle-${year}-${newRequestId()}`,
      date: turn.currentDate,
      type: 'chronicle-ready',
      actors: [],
      territories: [],
      description: `《晚唐实录·${year}年》已成，可于右上角史书阁查阅。`,
      priority: EventPriority.Normal,
      payload: { year },
    });
  });
}

// ── reconcile：读档/启动后处理遗留任务 ─────────────────

function reconcile(): void {
  const store = useChronicleStore.getState();

  // 月稿：generating → pending（Promise 已死）→ 重新入队
  for (const draft of Array.from(store.monthDrafts.values())) {
    if (draft.status === 'generating') {
      store.upsertMonthDraft({ ...draft, status: 'pending' });
    }
  }
  for (const draft of Array.from(useChronicleStore.getState().monthDrafts.values())) {
    if (draft.status === 'pending') {
      void generateMonthDraft(draft.year, draft.month);
    }
  }

  // 年史
  for (const yc of Array.from(store.yearChronicles.values())) {
    if (yc.status === 'generating') {
      store.upsertYearChronicle({ ...yc, status: 'pending' });
    }
  }
  for (const yc of Array.from(useChronicleStore.getState().yearChronicles.values())) {
    if (yc.status === 'pending') {
      void generateYearChronicle(yc.year);
    }
  }
}

// ── 重试入口（供 UI 调用） ─────────────────────────────

export function retryMonth(year: number, month: number): void {
  useChronicleStore.getState().retryMonthDraft(year, month);
  void generateMonthDraft(year, month);
}

export function retryYear(year: number): void {
  useChronicleStore.getState().retryYearChronicle(year);
  void generateYearChronicle(year);
}

// ── 启动 / 停止 ────────────────────────────────────────

let _started = false;

function previousMonth(date: { year: number; month: number }): { year: number; month: number } {
  if (date.month === 1) return { year: date.year - 1, month: 12 };
  return { year: date.year, month: date.month - 1 };
}

const CALLBACK_ID = 'chronicle-monthly';

export const chronicleService = {
  start(): void {
    if (_started) return;
    _started = true;
    useTurnManager.getState().registerMonthlyCallback(CALLBACK_ID, (date) => {
      // 月初触发：生成上个月摘要
      const prev = previousMonth(date);
      void generateMonthDraft(prev.year, prev.month);
      // 跨年触发：生成上一年的年史
      if (date.month === 1) {
        void generateYearChronicle(prev.year);
      }
    });
    // 处理读档/启动后遗留的 pending/generating 任务
    reconcile();
    debugLog('chronicle', '[chronicle] service started');
  },

  stop(): void {
    if (!_started) return;
    _started = false;
    useTurnManager.getState().unregisterMonthlyCallback(CALLBACK_ID);
    // 取消所有 in-flight
    for (const req of inFlight.values()) {
      req.abort.abort();
    }
    inFlight.clear();
    debugLog('chronicle', '[chronicle] service stopped');
  },
};

// ── 测试用导出 ──────────────────────────────────────────
//
// 这一组 hook 仅供 vitest 使用，不应在生产代码里调用。
// 提供"注入 provider / 重置 in-flight / 直接驱动 generate"的最小面，
// 不暴露 inFlight Map 本体，避免测试绑死内部结构。

function __setProviderForTest(provider: LlmProvider | null): void {
  providerCache = provider;
}

function __resetForTest(): void {
  for (const req of inFlight.values()) {
    req.abort.abort();
  }
  inFlight.clear();
  providerCache = null;
  _started = false;
}

export const __test__ = {
  generateMonthDraft,
  generateYearChronicle,
  CHRONICLE_TYPE_WHITELIST,
  shouldIncludeInChronicle,
  setProviderForTest: __setProviderForTest,
  resetForTest: __resetForTest,
};
