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
