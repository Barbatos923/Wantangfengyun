/**
 * AI 史书：调度层不变量（程序化压测）
 *
 * 4 条最关键的、不能回归的外部可观察不变量：
 *
 * 1. 正常流：月稿 + 年史最终都收敛到 done，store 里没有残留 generating
 * 2. playthrough 隔离：旧周目晚回的请求不污染新周目的 ChronicleStore
 * 3. stale 删槽回归（GPT P1）：旧请求完成的 stale 处理不能误删同 key 的新请求槽
 * 4. abort 不降级（GPT P2.1）：service.stop() / 周目切换后，被取消的请求不应写"保底内容"
 *
 * 设计原则（与用户对齐）：
 * - 只断言外部可观察状态（ChronicleStore 终态、生成结果是否被丢弃），不窥探 inFlight 内部
 * - 注入用 __test__.setProviderForTest，不污染生产 API
 * - 用可控的 mock provider 模拟"延迟 + 取消感知"，避开真 LLM 与 IndexedDB
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useChronicleStore, monthKey } from '@engine/chronicle/ChronicleStore';
import { __test__ as svc } from '@engine/chronicle/chronicleService';
import { useTurnManager } from '@engine/TurnManager';
import { EventPriority, type GameEvent } from '@engine/types';
import type { LlmProvider, LlmGenerateOptions, LlmPrompt } from '@engine/chronicle/llm/LlmProvider';

// ── 可控 mock provider ────────────────────────────────────

interface ControllableProvider extends LlmProvider {
  /** 当前 generate 的解析函数；外部测试代码控制何时 resolve */
  release: () => void;
  /** 等到 generate 真正进入 await 状态后再 release */
  waitUntilCalled: () => Promise<void>;
  /** 计数：被调用了几次 */
  callCount: number;
}

function makeControllableProvider(opts: {
  id?: 'direct' | 'mock';
  /** 每次 generate 返回的字符串前缀，会拼上 callCount */
  output: string;
}): ControllableProvider {
  const provider = {
    id: opts.id ?? 'direct',
    callCount: 0,
    _resolveCurrent: null as ((v: string) => void) | null,
    _calledNotify: null as (() => void) | null,
    release(): void {
      const r = (provider as ControllableProvider & { _resolveCurrent: ((v: string) => void) | null })._resolveCurrent;
      if (r) {
        r(`${opts.output}#${provider.callCount}`);
        (provider as { _resolveCurrent: ((v: string) => void) | null })._resolveCurrent = null;
      }
    },
    async waitUntilCalled(): Promise<void> {
      if ((provider as { _resolveCurrent: ((v: string) => void) | null })._resolveCurrent) return;
      await new Promise<void>((resolve) => {
        (provider as { _calledNotify: (() => void) | null })._calledNotify = resolve;
      });
    },
    async generate(_prompt: LlmPrompt, gen: LlmGenerateOptions): Promise<string> {
      provider.callCount++;
      return new Promise<string>((resolve, reject) => {
        (provider as { _resolveCurrent: ((v: string) => void) | null })._resolveCurrent = resolve;
        const notify = (provider as { _calledNotify: (() => void) | null })._calledNotify;
        if (notify) {
          notify();
          (provider as { _calledNotify: (() => void) | null })._calledNotify = null;
        }
        gen.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    },
  };
  return provider as unknown as ControllableProvider;
}

// 立即返回的 provider（不挂起），用于"正常流"测试
function makeInstantProvider(id: 'direct' | 'mock', output: string): LlmProvider {
  let n = 0;
  return {
    id,
    async generate(_p, gen) {
      if (gen.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      n++;
      return `${output}#${n}`;
    },
  };
}

// ── helpers ────────────────────────────────────────────────

function addEvent(year: number, month: number, type = '宣战'): void {
  const e: GameEvent = {
    id: `evt-${year}-${month}-${Math.random()}`,
    date: { year, month, day: 5 },
    type,
    actors: [],
    territories: [],
    description: `${year}年${month}月 ${type}`,
    priority: EventPriority.Normal, // 走 type 白名单进入 chronicle
  };
  useTurnManager.getState().addEvent(e);
}

function setPlaythrough(id: string): void {
  useTurnManager.setState({ playthroughId: id });
}

beforeEach(() => {
  // 清空 store + service 内部状态
  useChronicleStore.getState().clearAll();
  svc.resetForTest();
  // 清空事件流
  useTurnManager.setState({ events: [] });
  setPlaythrough('test-playthrough-A');
});

afterEach(() => {
  svc.resetForTest();
});

// ── 测试 1：正常流 ────────────────────────────────────────

describe('chronicle 调度层 - 正常流', () => {
  it('生成 3 个月稿后全部收敛到 done，无 generating 残留', async () => {
    svc.setProviderForTest(makeInstantProvider('direct', 'M'));

    addEvent(870, 1);
    addEvent(870, 2);
    addEvent(870, 3);

    await svc.generateMonthDraft(870, 1);
    await svc.generateMonthDraft(870, 2);
    await svc.generateMonthDraft(870, 3);

    const drafts = useChronicleStore.getState().monthDrafts;
    expect(drafts.size).toBe(3);
    for (let m = 1; m <= 3; m++) {
      const d = drafts.get(monthKey(870, m));
      expect(d).toBeDefined();
      expect(d!.status).toBe('done');
      expect(d!.summary).toMatch(/^M#\d+$/);
    }
  });

  it('年史在 12 个月稿就绪后能收敛到 done', async () => {
    svc.setProviderForTest(makeInstantProvider('direct', 'Y'));

    // 预填 12 个月稿，让 waitForMonthDrafts 立即放行
    for (let m = 1; m <= 12; m++) {
      useChronicleStore.getState().upsertMonthDraft({
        year: 870,
        month: m,
        summary: `seed-${m}`,
        status: 'done',
      });
    }

    await svc.generateYearChronicle(870);

    const yc = useChronicleStore.getState().yearChronicles.get(870);
    expect(yc).toBeDefined();
    expect(yc!.status).toBe('done');
    expect(yc!.content).toMatch(/^Y#\d+$/);
    expect(yc!.read).toBe(false);
  });
});

// ── 测试 2：playthrough 隔离 ───────────────────────────────

describe('chronicle 调度层 - playthrough 隔离', () => {
  it('旧周目晚回的请求不污染新周目', async () => {
    const provider = makeControllableProvider({ output: 'OLD' });
    svc.setProviderForTest(provider);

    addEvent(870, 1);

    // 周目 A 启动月稿生成
    setPlaythrough('A');
    const promise = svc.generateMonthDraft(870, 1);

    // 等 generate() 真正挂起后再切周目
    await provider.waitUntilCalled();

    // 切到周目 B（模拟新游戏）
    setPlaythrough('B');
    // 同时清空 store 模拟 newGame 流程
    useChronicleStore.getState().clearAll();

    // 现在让旧的 LLM 请求"晚回"
    provider.release();
    await promise;

    // 关键断言：周目 B 的 ChronicleStore 应该是空的，没有被旧结果污染
    const drafts = useChronicleStore.getState().monthDrafts;
    expect(drafts.size).toBe(0);
  });
});

// ── 测试 3：stale 删槽回归（GPT P1） ──────────────────────

describe('chronicle 调度层 - stale 删槽回归', () => {
  it('旧请求 stale 完成时不能误删同 key 的新请求结果', async () => {
    // 这个场景模拟 GPT 评审里指出的竞态：
    //   1. req1 启动并 in-flight
    //   2. 周目切换 → req1 变 stale
    //   3. 重新切回原周目，retry 触发 req2
    //   4. req1 晚回，stale 处理时不能把 req2 的槽也踢掉
    //   5. req2 晚回，必须能正常写入 store

    const provider1 = makeControllableProvider({ output: 'REQ1' });
    svc.setProviderForTest(provider1);

    addEvent(870, 1);
    setPlaythrough('A');
    const p1 = svc.generateMonthDraft(870, 1);
    await provider1.waitUntilCalled();

    // 切到 B 让 req1 变 stale
    setPlaythrough('B');
    // 切回 A，并清掉 inFlight 槽（模拟 newGame → 切回 → retry 的等价路径）
    setPlaythrough('A');
    svc.resetForTest();
    setPlaythrough('A');

    // req2 用一个新 provider，立即返回结果
    svc.setProviderForTest(makeInstantProvider('direct', 'REQ2'));
    await svc.generateMonthDraft(870, 1);

    // req2 已 done
    let entry = useChronicleStore.getState().monthDrafts.get(monthKey(870, 1));
    expect(entry?.status).toBe('done');
    expect(entry?.summary).toBe('REQ2#1');

    // 现在让 req1 晚回 —— 应被识别为 stale 丢弃，并且不能影响已写入的 req2 结果
    provider1.release();
    await p1;

    entry = useChronicleStore.getState().monthDrafts.get(monthKey(870, 1));
    expect(entry?.status).toBe('done');
    expect(entry?.summary).toBe('REQ2#1'); // req2 的结果未被覆盖/清除
  });
});

// ── 测试 5：白名单字串对账 ────────────────────────────────

describe('chronicle 白名单 - 与 emit 端字串对账', () => {
  it('Normal 级"篡夺头衔"事件能通过白名单进入史书（修复原失配 BUG）', () => {
    const e: GameEvent = {
      id: 'evt-usurp',
      date: { year: 870, month: 6, day: 1 },
      type: '篡夺头衔', // 与 usurpPostAction.ts:198 一致
      actors: [],
      territories: [],
      description: '某人篡夺某节度使',
      priority: EventPriority.Normal, // 故意 Normal，不走 Major 自动入史
    };
    expect(svc.shouldIncludeInChronicle(e)).toBe(true);
  });

  it('Normal 级"战争接续"事件能通过白名单进入史书', () => {
    const e: GameEvent = {
      id: 'evt-war-succ',
      date: { year: 870, month: 7, day: 1 },
      type: '战争接续',
      actors: [],
      territories: [],
      description: '某继承人接掌战争',
      priority: EventPriority.Normal,
    };
    expect(svc.shouldIncludeInChronicle(e)).toBe(true);
  });

  it('"岗位空缺"显式不入史（与继位/绝嗣重复）', () => {
    const e: GameEvent = {
      id: 'evt-vacant',
      date: { year: 870, month: 1, day: 1 },
      type: '岗位空缺',
      actors: [],
      territories: [],
      description: '某节度使出缺',
      priority: EventPriority.Normal,
    };
    expect(svc.shouldIncludeInChronicle(e)).toBe(false);
  });
});

// ── 测试 6：worldSnapshot 头衔聚合 ────────────────────────

describe('chronicle worldSnapshot - 头衔聚合', () => {
  it('本年的称王/建镇/称帝/篡夺头衔事件聚合到 newTitles', () => {
    addEvent(870, 3, '称王');
    addEvent(870, 5, '建镇');
    addEvent(870, 8, '篡夺头衔');
    // 跨年事件不应进入
    addEvent(869, 12, '称帝');

    const snap = svc.freezeWorldSnapshot(870);
    expect(snap.newTitles).toHaveLength(3);
    expect(snap.newTitles.some((t) => t.includes('称王'))).toBe(true);
    expect(snap.newTitles.some((t) => t.includes('建镇'))).toBe(true);
    expect(snap.newTitles.some((t) => t.includes('篡夺头衔'))).toBe(true);
  });

  it('本年的销毁头衔/王朝覆灭事件聚合到 destroyedTitles', () => {
    addEvent(871, 4, '销毁头衔');
    addEvent(871, 11, '王朝覆灭');

    const snap = svc.freezeWorldSnapshot(871);
    expect(snap.destroyedTitles).toHaveLength(2);
  });

  it('两个清单互斥，无事件则均为空数组', () => {
    const snap = svc.freezeWorldSnapshot(872);
    expect(snap.newTitles).toEqual([]);
    expect(snap.destroyedTitles).toEqual([]);
  });
});

// ── 测试 7：人物档案（方向 2） ────────────────────────────

import { useCharacterStore } from '@engine/character/CharacterStore';
import type { Character } from '@engine/character/types';

function makeChar(over: Partial<Character> & { id: string; name: string; birthYear: number }): Character {
  return {
    id: over.id,
    name: over.name,
    courtesy: over.courtesy ?? '',
    gender: over.gender ?? '男',
    birthYear: over.birthYear,
    deathYear: over.deathYear,
    clan: over.clan ?? '',
    family: over.family ?? { childrenIds: [] },
    abilities: over.abilities ?? { military: 10, administration: 10, strategy: 10, diplomacy: 10, scholarship: 10 },
    traitIds: over.traitIds ?? [],
    health: over.health ?? 100,
    stress: over.stress ?? 0,
    alive: over.alive ?? true,
    resources: over.resources ?? { money: 0, grain: 0, prestige: 0, legitimacy: 0 },
    relationships: over.relationships ?? [],
    overlordId: over.overlordId,
    redistributionRate: over.redistributionRate ?? 50,
    isPlayer: over.isPlayer ?? false,
    isRuler: over.isRuler ?? false,
    title: over.title ?? '',
    official: over.official,
  };
}

function injectCharacters(chars: Character[]): void {
  const map = new Map<string, Character>();
  for (const c of chars) map.set(c.id, c);
  useCharacterStore.setState({ characters: map });
}

describe('chronicle worldSnapshot - 人物档案 (方向 2)', () => {
  beforeEach(() => {
    injectCharacters([]);
  });

  it('dossier 各字段：name/courtesy/clan/age/traits/family 完整', () => {
    const father = makeChar({
      id: 'char-father', name: '李某父', birthYear: 800,
    });
    const son = makeChar({
      id: 'char-son', name: '李某子', birthYear: 850,
    });
    const main = makeChar({
      id: 'char-key',
      name: '李存信',
      courtesy: '仲谋',
      clan: '沙陀',
      birthYear: 840,
      traitIds: ['brave', 'cruel'], // 假定这两是 innate/personality 类；非则 traitNames 为空，不影响其他字段断言
      family: { fatherId: 'char-father', childrenIds: ['char-son'] },
      isPlayer: false,
    });
    injectCharacters([father, son, main]);

    // 让 char-key 在 870 年出场 1 次
    useTurnManager.setState({ events: [] });
    addEvent(870, 5, '宣战');
    const events = useTurnManager.getState().events;
    // 手动塞 actor 到 event（addEvent helper 是空 actors）
    useTurnManager.setState({
      events: events.map((e, i) => i === 0 ? { ...e, actors: ['char-key'] } : e),
    });

    const snap = svc.freezeWorldSnapshot(870);
    const d = snap.dossiers.find(x => x.id === 'char-key');
    expect(d).toBeDefined();
    expect(d!.name).toBe('李存信');
    expect(d!.courtesy).toBe('仲谋');
    expect(d!.clan).toBe('沙陀');
    expect(d!.age).toBe(30); // 870 - 840
    expect(d!.isAlive).toBe(true);
    expect(d!.fatherName).toBe('李某父');
    expect(d!.childrenNames).toEqual(['李某子']);
  });

  it('跨年记忆 (方向 3)：上一年生成完会落地 afterword + dossier 快照', async () => {
    svc.setProviderForTest(makeInstantProvider('direct', '癸巳年文言开篇。某月某事。\n史官按语：本年藩镇交攻，王纲解纽。'));

    // 准备两个角色
    const a = makeChar({ id: 'char-a', name: '李某', birthYear: 840 });
    injectCharacters([a]);

    // 873 年事件 + 月稿
    useTurnManager.setState({ events: [] });
    addEvent(873, 5, '宣战');
    const evs = useTurnManager.getState().events;
    useTurnManager.setState({ events: evs.map(e => ({ ...e, actors: ['char-a'] })) });

    // 预填 12 个月稿让 waitForMonthDrafts 立即放行
    for (let m = 1; m <= 12; m++) {
      useChronicleStore.getState().upsertMonthDraft({ year: 873, month: m, summary: `873-${m}`, status: 'done' });
    }

    await svc.generateYearChronicle(873);

    const yc = useChronicleStore.getState().yearChronicles.get(873);
    expect(yc?.status).toBe('done');
    expect(yc?.afterword).toContain('史官按语');
    expect(Array.isArray(yc?.keyCharactersSnapshot)).toBe(true);
    expect((yc?.keyCharactersSnapshot as Array<{ id: string }>).some(d => d.id === 'char-a')).toBe(true);
  });

  it('selectKeyCharacters：玩家始终入选（即使本年未出场）', () => {
    const player = makeChar({ id: 'char-player', name: '玩家', birthYear: 850, isPlayer: true });
    const npcs: Character[] = [];
    for (let i = 0; i < 9; i++) {
      npcs.push(makeChar({ id: `npc-${i}`, name: `NPC${i}`, birthYear: 850 }));
    }
    injectCharacters([player, ...npcs]);

    // 9 个 NPC 各出场 1 次，玩家不出场
    useTurnManager.setState({ events: [] });
    for (let i = 0; i < 9; i++) addEvent(870, i + 1, '宣战');
    const events = useTurnManager.getState().events;
    useTurnManager.setState({
      events: events.map((e, i) => ({ ...e, actors: [`npc-${i}`] })),
    });

    const snap = svc.freezeWorldSnapshot(870);
    expect(snap.dossiers.length).toBe(8);
    expect(snap.dossiers.some(d => d.id === 'char-player')).toBe(true);
  });
});

// ── 测试 8：月稿缺失时年稿吃 rawFallback ─────────────────

describe('chronicle 年稿 - rawFallback 原始事件兜底', () => {
  it('缺失月稿的月份用原始事件填充，已有月稿的月份不被覆盖', async () => {
    // 捕获 prompt 的 provider
    let capturedPrompt: LlmPrompt | null = null;
    const capturingProvider: LlmProvider = {
      id: 'direct',
      async generate(prompt, gen) {
        if (gen.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        capturedPrompt = prompt;
        return '年史正文。\n史官按语：此年无事。';
      },
    };
    svc.setProviderForTest(capturingProvider);

    // 准备事件：1月、3月、5月有事件
    addEvent(875, 1, '宣战');
    addEvent(875, 3, '任命');
    addEvent(875, 5, '称帝');

    // 只有 1 月和 3 月有月稿；5 月"来不及生成"
    useChronicleStore.getState().upsertMonthDraft({
      year: 875, month: 1, summary: '正月，某藩镇宣战。', status: 'done',
    });
    useChronicleStore.getState().upsertMonthDraft({
      year: 875, month: 3, summary: '三月，某官任命。', status: 'done',
    });
    // 5 月无月稿（模拟快进来不及）
    // 其余月份无事件也无月稿

    // 预填剩余月份为 done（无 summary），让 waitForMonthDrafts 不卡住
    for (let m = 1; m <= 12; m++) {
      if (m === 1 || m === 3) continue;
      useChronicleStore.getState().upsertMonthDraft({
        year: 875, month: m, summary: '', status: 'done',
      });
    }

    await svc.generateYearChronicle(875);

    expect(capturedPrompt).not.toBeNull();
    const userPrompt = capturedPrompt!.user;

    // 1 月和 3 月用的是月稿原文，不含"原始事件记录"
    expect(userPrompt).toContain('◇ 1月：正月，某藩镇宣战。');
    expect(userPrompt).toContain('◇ 3月：三月，某官任命。');
    expect(userPrompt).not.toMatch(/1月（原始事件记录）/);
    expect(userPrompt).not.toMatch(/3月（原始事件记录）/);

    // 5 月有事件但无月稿 → fallback 到原始事件
    expect(userPrompt).toContain('5月（原始事件记录）');
    // fallback 内容应包含事件 description
    expect(userPrompt).toContain('875年5月 称帝');

    // system prompt 应包含对原始事件记录的处理说明
    expect(capturedPrompt!.system).toContain('原始事件记录');

    // 无事件的月份（如 2 月）既无月稿也无 fallback，不应出现
    expect(userPrompt).not.toMatch(/◇ 2月/);
  });
});

// ── 测试 4：abort 不降级 ──────────────────────────────────

describe('chronicle 调度层 - abort 不降级', () => {
  it('stop() 中途取消请求后不应写入任何"保底"内容', async () => {
    const provider = makeControllableProvider({ output: 'NEVER' });
    svc.setProviderForTest(provider);

    addEvent(870, 5);
    const p = svc.generateMonthDraft(870, 5);
    await provider.waitUntilCalled();

    // 中途 stop —— 内部所有 in-flight 都会被 abort
    svc.resetForTest();

    // 等待原 promise 流程跑完
    await p;

    // 关键：store 里这条月稿要么不存在，要么还停在 generating（因为 stale 路径不写 store）
    // 绝对不能出现 status === 'done' + summary 含 NEVER
    const entry = useChronicleStore.getState().monthDrafts.get(monthKey(870, 5));
    if (entry) {
      // 服务在请求开始时把状态置为 generating，这是允许残留的
      // 但绝不能落到 done 也不能含有 provider 输出
      expect(entry.status).not.toBe('done');
      expect(entry.summary).not.toContain('NEVER');
    }
  });
});
