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
  type PriorYearMemory,
  type MonthRawFallback,
} from './chroniclePromptBuilder';
import {
  buildCharacterDossier,
  selectKeyCharacters,
  type CharacterDossier,
} from './chronicleDossier';
import { type EventContextSnapshot } from './chronicleEventContext';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { createProvider } from './llm/createProvider';
import { isAbortError, type LlmProvider } from './llm/LlmProvider';
import { mockProvider } from './llm/MockProvider';
import { loadLlmConfig } from './llm/llmConfig';

// ── 事件筛选规则（priority 不够，加白名单） ─────────────

// 白名单：除 priority>=Major 自动入史外，额外允许进入史书的 type 字串。
// 维护原则：与各 emit 处的 type 字串严格对账，新增 emit 时必须同步到这里。
// 显式不入史：'岗位空缺'(与继位/绝嗣重复) / '参战' / '退出战争'(与宣战/战争结束重复，避免月稿啰嗦)。
const CHRONICLE_TYPE_WHITELIST = new Set<string>([
  // —— 军事主线 ——
  '宣战',
  '战争结束',
  '城破',
  '兵变',
  '野战',
  '战争接续',     // characterSystem.ts:343 死亡时战争领袖接续
  // —— 王朝/继承 ——
  '继位',
  '绝嗣',
  '王朝覆灭',
  // —— 头衔 / 主权变动 ——
  '篡夺头衔',     // usurpPostAction.ts:198（修复：原白名单写的"篡夺"与 emit 字串失配）
  '建镇',
  '称王',
  '称帝',
  '销毁头衔',
  // —— 政治骨干（Commit 2 新增） ——
  '任命',
  '罢免',
  '剥夺',
  '抗命',          // 剥夺触发独立战争（Major，但显式列入）
  '调任',
  '转移臣属',
  '归附',          // Major
  '逼迫授权',      // Major
  '留后指定',
  '议定进奉',
  '要求效忠',
  'chronicle-ready', // 防止递归
]);

/** 单月事件截断上限：超过则按 priority 倒序 + 时间正序保留 top N。 */
const MAX_EVENTS_PER_MONTH = 30;

// 头衔聚合用：年史 worldSnapshot 的 newTitles / destroyedTitles 来源。
const NEW_TITLE_TYPES = new Set<string>(['称王', '建镇', '称帝', '篡夺头衔']);
const DESTROYED_TITLE_TYPES = new Set<string>(['销毁头衔', '王朝覆灭']);

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
  const filtered = all.filter(
    (e) => e.date.year === year && e.date.month === month && shouldIncludeInChronicle(e),
  );
  if (filtered.length <= MAX_EVENTS_PER_MONTH) return filtered;
  // 截断：按 priority 倒序，priority 相同按 day 正序，保留 top N
  // 用 stable sort：先按 day 正序，再按 priority 倒序
  const sorted = filtered
    .slice()
    .sort((a, b) => a.date.day - b.date.day)
    .sort((a, b) => b.priority - a.priority);
  debugLog(
    'chronicle',
    `[chronicle] month ${year}/${month} events ${filtered.length} → trimmed ${MAX_EVENTS_PER_MONTH}`,
  );
  // 截断后按时间顺序重排，保证月稿读起来仍是顺序的
  return sorted.slice(0, MAX_EVENTS_PER_MONTH).sort((a, b) => a.date.day - b.date.day);
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

function freezeEventContextSnapshot(year: number): EventContextSnapshot {
  const charState = useCharacterStore.getState();
  const terrState = useTerritoryStore.getState();
  const milState = useMilitaryStore.getState();
  const warState = useWarStore.getState();
  return {
    characters: charState.characters,
    territories: terrState.territories,
    centralPosts: terrState.centralPosts,
    controllerIndex: terrState.controllerIndex,
    vassalIndex: charState.vassalIndex,
    armies: milState.armies,
    battalions: milState.battalions,
    wars: warState.wars,
    currentYear: year,
  };
}

function freezeWorldSnapshot(year: number): WorldSnapshot {
  // 用现成的 controllerIndex（controllerId → Set<terrId>）聚合，
  // 避免再造一套 controller 真相源——CLAUDE.md 明令"查询走索引，禁止全量遍历"。
  const territoryState = useTerritoryStore.getState();
  const { controllerIndex } = territoryState;
  const characters = useCharacterStore.getState().characters;

  const top = Array.from(controllerIndex.entries())
    .map(([id, set]) => ({ id, n: set.size }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map(({ id, n }) => ({
      name: characters.get(id)?.name ?? '?',
      territoryCount: n,
    }));

  // 聚合本年头衔变动：扫一次 events 把 NEW_TITLE_TYPES / DESTROYED_TITLE_TYPES 摘出来。
  // description 已经是"X 在 Y 设节度使"这类自然语言，直接复用避免再拼一遍。
  const allEvents = useTurnManager.getState().events;
  const newTitles: string[] = [];
  const destroyedTitles: string[] = [];
  const yearEvents: typeof allEvents = [];
  for (const e of allEvents) {
    if (e.date.year !== year) continue;
    yearEvents.push(e);
    if (NEW_TITLE_TYPES.has(e.type)) newTitles.push(e.description);
    else if (DESTROYED_TITLE_TYPES.has(e.type)) destroyedTitles.push(e.description);
  }

  // 关键人物档案（方向 2）：基于本年事件出场频次选 top 8 + 玩家
  const keyCharIds = selectKeyCharacters(yearEvents, characters, 8);
  const dossiers: CharacterDossier[] = [];
  for (const id of keyCharIds) {
    const d = buildCharacterDossier(id, characters, territoryState.territories, year);
    if (d) dossiers.push(d);
  }

  return {
    year,
    topPowers: top,
    newTitles,
    destroyedTitles,
    dossiers,
  };
}

// ── 跨年记忆（方向 3） ──────────────────────────────────

/**
 * 从年史正文末段提取"史官按语"。
 * 优先匹配"史官按语"标记，找不到则取末尾约 250 字作为兜底（绝大部分模型都会
 * 遵守 system prompt 把按语放末尾）。
 */
function extractAfterword(content: string): string {
  if (!content) return '';
  const trimmed = content.trim();
  // 找"史官按语"或类似关键词
  const markers = ['史官按语', '史臣曰', '论曰'];
  for (const m of markers) {
    const idx = trimmed.lastIndexOf(m);
    if (idx >= 0) {
      const slice = trimmed.slice(idx).trim();
      // 截到 400 字（按语本身限制 200 字，留余量给标记前缀）
      return slice.length > 400 ? slice.slice(0, 400) : slice;
    }
  }
  // 兜底：取末尾 250 字
  return trimmed.length > 250 ? trimmed.slice(-250) : trimmed;
}

/**
 * 读取上一年史的"前情提要"。无上一年 / 上一年未生成 / 上一年失败 → 返回 undefined。
 */
function loadPriorYearMemory(priorYear: number): PriorYearMemory | undefined {
  const yc = useChronicleStore.getState().yearChronicles.get(priorYear);
  if (!yc || yc.status !== 'done') return undefined;
  if (!yc.afterword) return undefined;
  // dossier 快照：旧档可能没有，按空数组处理
  const dossiers = Array.isArray(yc.keyCharactersSnapshot)
    ? (yc.keyCharactersSnapshot as PriorYearMemory['dossiers'])
    : [];
  return {
    year: priorYear,
    afterword: yc.afterword,
    dossiers,
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
  const ctxSnap = freezeEventContextSnapshot(year);
  const prompt = buildMonthPrompt(year, month, events, names, ctxSnap);
  debugLog('chronicle', '[chronicle] month start', year, month, 'events=', events.length);

  // ━━ DEBUG: 月度素材 & prompt 审查 ━━
  debugLog('chronicle', `[月度 ${year}年${month}月] 事件数=${events.length}`);
  debugLog('chronicle', '事件表:', events.map(e => ({
    日期: `${e.date.month}/${e.date.day}`,
    类型: e.type,
    优先级: e.priority,
    描述: e.description.slice(0, 60),
    人物: e.actors.map(id => names.characters[id] ?? id).join(','),
    地点: e.territories.map(id => names.territories[id] ?? id).join(','),
  })));
  debugLog('chronicle', '[SYSTEM PROMPT]', prompt.system);
  debugLog('chronicle', '[USER PROMPT]', prompt.user);

  let summary: string;
  try {
    const provider = await getProvider();
    summary = await provider.generate(prompt, {
      // 1500 而非 400：思考型模型(K2 等)前几千 token 全在 reasoning，
      // 400 上限会让最终 content 被截到只剩几个字
      maxTokens: 1500,
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
    await waitForMonthDrafts(year, { timeoutMs: 0, signal: req.abort.signal });
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
  // 方向 3：跨年记忆 — 读取上一年史的按语 + dossier 快照（若存在）
  const priorMemory = loadPriorYearMemory(year - 1);

  // 为缺失月稿的月份构建原始事件 fallback
  const draftByMonth = new Map<number, MonthDraft>();
  for (const d of drafts) draftByMonth.set(d.month, d);
  const rawFallback: MonthRawFallback = new Map();
  const ctxSnap = freezeEventContextSnapshot(year);
  for (let m = 1; m <= 12; m++) {
    const d = draftByMonth.get(m);
    if (d?.summary?.trim()) continue; // 有月稿，不需要 fallback
    const events = collectMonthEvents(year, m);
    if (events.length === 0) continue; // 无事件也无需 fallback
    const names = buildNameTable(events);
    const monthPrompt = buildMonthPrompt(year, m, events, names, ctxSnap);
    rawFallback.set(m, monthPrompt.user);
  }

  const prompt = buildYearPrompt(year, drafts, snapshot, priorMemory, rawFallback);

  // ━━ DEBUG: 年度素材 & prompt 审查 ━━
  debugLog('chronicle', `[年度 ${year}年] 月稿汇总:`);
  for (const d of drafts) {
    debugLog('chronicle', `  ${d.month}月 [${d.status}]: ${(d.summary || '(空)').slice(0, 80)}${(d.summary?.length ?? 0) > 80 ? '…' : ''}`);
  }
  debugLog('chronicle', 'WorldSnapshot — Top5势力:', snapshot.topPowers, '新建头衔:', snapshot.newTitles, '覆灭头衔:', snapshot.destroyedTitles);
  debugLog('chronicle', '关键人物档案:', snapshot.dossiers.map(d => ({
    姓名: d.name, 字: d.courtesy, 年龄: d.age, 存活: d.isAlive, 玩家: d.isPlayer,
    主岗: d.mainPostName, 品级: d.rankName, 特质: d.traitNames.join('/'),
    父: d.fatherName, 子: d.childrenNames.join('/'),
  })));
  if (priorMemory) {
    debugLog('chronicle', '跨年记忆 — 上年按语:', priorMemory.afterword.slice(0, 120), '上年人物:', priorMemory.dossiers.map(d => d.name).join(', '));
  } else {
    debugLog('chronicle', '(无跨年记忆)');
  }
  debugLog('chronicle', '[SYSTEM PROMPT]', prompt.system);
  debugLog('chronicle', '[USER PROMPT]', prompt.user);
  debugLog('chronicle', `prompt 总字符数: system=${prompt.system.length}, user=${prompt.user.length}`);

  let content: string;
  try {
    const provider = await getProvider();
    content = await provider.generate(prompt, {
      // 8000 而非 2000：思考型模型(K2 等)reasoning 经常吃掉 4000+ token，
      // 留给文言正文不足时会被截到只剩"○咸"几个字
      maxTokens: 8000,
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
    // 方向 3：提取按语 + freeze dossier 快照供下一年读取
    const afterword = extractAfterword(content);
    useChronicleStore.getState().upsertYearChronicle({
      year,
      content,
      status: 'done',
      generatedAt: Date.now(),
      read: false,
      afterword,
      keyCharactersSnapshot: snapshot.dossiers,
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
  freezeWorldSnapshot,
  setProviderForTest: __setProviderForTest,
  resetForTest: __resetForTest,
};
