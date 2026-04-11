/**
 * 计谋系统 — 频率观测长测（不是单元测试，是一次性采样脚本）
 *
 * 目的：跑 N 个月的完整日结/月结管线，观测 NPC 自主发起的拉拢/离间频率，
 *       帮助 calibrate curryFavorBehavior / alienateBehavior 的 weight 公式。
 *
 * 默认 **skip**（单次跑 ~60-90s，不适合进 CI）。需要跑时设环境变量：
 *   PowerShell: `$env:SCHEME_SIM=1; npx vitest run scheme-frequency-sim`
 *   bash:       `SCHEME_SIM=1 npx vitest run scheme-frequency-sim`
 *
 * 报告写到 `scheme-frequency-report.txt`（仓库根目录，已 gitignore 建议）。
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadSampleData } from '@engine/init/loadSampleData';
import {
  runDailySettlement,
  runMonthlySettlement,
} from '@engine/settlement';
import { useTurnManager } from '@engine/TurnManager';
import { useSchemeStore } from '@engine/scheme/SchemeStore';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { addDays } from '@engine/dateUtils';
import { initRng } from '@engine/random';
import '@data/schemes'; // 触发计谋类型自注册
// 用于 monkey-patch 采样 weight 分布
import { curryFavorBehavior } from '@engine/npc/behaviors/curryFavorBehavior';
import { alienateBehavior } from '@engine/npc/behaviors/alienateBehavior';

const MONTHS = 24; // 2 年，足以观察月均频率
const SEED = 'scheme-freq-sim-2026';

const shouldRun = !!process.env.SCHEME_SIM;

describe.skipIf(!shouldRun)('scheme frequency sim (long run)', () => {
  it(`跑 ${MONTHS} 个月观测 NPC 计谋频率`, () => {
    // ── 初始化 ──
    initRng(SEED);
    loadSampleData();

    // ── Monkey-patch generateTask 以采样 weight 分布 ──
    // 只捕获"通过 minWeight 的返回值"（null = 不触发的情况无法采样具体权重）
    interface WeightSample {
      actorId: string;
      weight: number;
    }
    const currySamples: WeightSample[] = [];
    const alienSamples: WeightSample[] = [];
    let curryCalls = 0;
    let curryNullReturns = 0;
    let alienCalls = 0;
    let alienNullReturns = 0;

    const origCurryGen = curryFavorBehavior.generateTask;
    curryFavorBehavior.generateTask = (actor, ctx) => {
      curryCalls++;
      const r = origCurryGen(actor, ctx);
      if (!r) {
        curryNullReturns++;
      } else {
        currySamples.push({ actorId: actor.id, weight: r.weight });
      }
      return r;
    };

    const origAlienGen = alienateBehavior.generateTask;
    alienateBehavior.generateTask = (actor, ctx) => {
      alienCalls++;
      const r = origAlienGen(actor, ctx);
      if (!r) {
        alienNullReturns++;
      } else {
        alienSamples.push({ actorId: actor.id, weight: r.weight });
      }
      return r;
    };

    // 清空玩家身份，避免 standing 任务和玩家通知路径
    useCharacterStore.getState().setPlayerId(null);

    // 清空初始 events 避免 TurnManager archive 500 阈值触发 indexedDB
    useTurnManager.setState({
      currentDate: { year: 870, month: 1, day: 2 },
      events: [],
    });

    const startYear = 870;

    // ── 主循环 ──
    const totalDays = MONTHS * 30 + 10; // 稍多几天，后面靠月份判断停止
    let monthsRun = 0;

    for (let i = 0; i < totalDays && monthsRun < MONTHS; i++) {
      const currentDate = useTurnManager.getState().currentDate;
      const nextDate = addDays(currentDate, 1);
      useTurnManager.setState({ currentDate: nextDate });

      runDailySettlement(nextDate);
      if (nextDate.day === 1) {
        runMonthlySettlement(nextDate);
        monthsRun++;
        // 周期性清空 events 避免 archive 触发 indexedDB（fire-and-forget 会在 node 环境报错）
        if (monthsRun % 6 === 0) {
          useTurnManager.setState({ events: [] });
        }
      }
    }

    // ── 统计 ──
    const schemes = Array.from(useSchemeStore.getState().schemes.values());

    interface Bucket {
      total: number;
      byStatus: Record<string, number>;
      byMonth: Map<string, number>;
      byInitiator: Map<string, number>;
      initialRates: number[];     // snapshot.initialSuccessRate，用于分布统计
    }
    const curry: Bucket = {
      total: 0,
      byStatus: {},
      byMonth: new Map(),
      byInitiator: new Map(),
      initialRates: [],
    };
    const alien: Bucket = {
      total: 0,
      byStatus: {},
      byMonth: new Map(),
      byInitiator: new Map(),
      initialRates: [],
    };

    for (const s of schemes) {
      const bucket = s.schemeTypeId === 'curryFavor' ? curry
        : s.schemeTypeId === 'alienation' ? alien
          : null;
      if (!bucket) continue;
      bucket.total++;
      bucket.byStatus[s.status] = (bucket.byStatus[s.status] ?? 0) + 1;
      bucket.initialRates.push(s.snapshot.initialSuccessRate);
      const monthKey = `${s.startDate.year}-${String(s.startDate.month).padStart(2, '0')}`;
      bucket.byMonth.set(monthKey, (bucket.byMonth.get(monthKey) ?? 0) + 1);
      bucket.byInitiator.set(
        s.initiatorId,
        (bucket.byInitiator.get(s.initiatorId) ?? 0) + 1,
      );
    }

    const cs = useCharacterStore.getState();
    const nameFor = (id: string) => cs.characters.get(id)?.name ?? id;

    const line = '─'.repeat(60);
    const out: string[] = [];
    const log = (s: string) => { out.push(s); };
    log(line);
    log(`计谋频率长测报告（${MONTHS} 个月，起点 ${startYear}-01，seed=${SEED}）`);
    log(line);

    for (const [label, b] of [
      ['拉拢 curryFavor', curry],
      ['离间 alienation', alien],
    ] as const) {
      log('');
      log(`[${label}]`);
      log(`  总数: ${b.total}`);
      log(`  月均: ${(b.total / MONTHS).toFixed(2)} 次/月`);
      log(
        `  按状态: ${Object.entries(b.byStatus).map(([k, v]) => `${k}=${v}`).join(', ') || '(空)'}`,
      );

      // 实际成功率
      const resolved = (b.byStatus.success ?? 0) + (b.byStatus.failure ?? 0);
      if (resolved > 0) {
        const succ = b.byStatus.success ?? 0;
        log(`  实际成功率: ${succ}/${resolved} = ${(succ / resolved * 100).toFixed(1)}%`);
      }

      // initialSuccessRate 分布
      if (b.initialRates.length > 0) {
        const sorted = [...b.initialRates].sort((a, c) => a - c);
        const mean = sorted.reduce((a, c) => a + c, 0) / sorted.length;
        const p10 = sorted[Math.floor(sorted.length * 0.10)];
        const p50 = sorted[Math.floor(sorted.length / 2)];
        const p90 = sorted[Math.floor(sorted.length * 0.90)];
        log(`  初始成功率分布: mean=${mean.toFixed(1)}% p10=${p10.toFixed(0)}% p50=${p50.toFixed(0)}% p90=${p90.toFixed(0)}% min=${sorted[0].toFixed(0)}% max=${sorted[sorted.length - 1].toFixed(0)}%`);
        // 5% 桶直方图
        const rateBuckets: [number, number, string][] = [
          [0, 20, ' 0-20'],
          [20, 35, '20-35'],
          [35, 45, '35-45'],
          [45, 55, '45-55'],
          [55, 65, '55-65'],
          [65, 80, '65-80'],
          [80, 101, '80-95'],
        ];
        const counts = rateBuckets.map(([lo, hi]) =>
          sorted.filter(v => v >= lo && v < hi).length,
        );
        const mx = Math.max(1, ...counts);
        log('  初始成功率桶位:');
        for (let i = 0; i < rateBuckets.length; i++) {
          const [, , name] = rateBuckets[i];
          const c = counts[i];
          const barLen = Math.round(c / mx * 30);
          log(`    ${name}  ${String(c).padStart(3)} ${'#'.repeat(barLen)}`);
        }
      }

      // 月度分布（按月份排序，展开 MONTHS 行）
      const monthEntries = Array.from(b.byMonth.entries()).sort();
      if (monthEntries.length > 0) {
        log('  月度分布:');
        for (const [m, c] of monthEntries) {
          const bar = '#'.repeat(Math.min(c, 40));
          log(`    ${m}: ${String(c).padStart(3)} ${bar}`);
        }
      }

      // TOP 10 发起人
      const topInitiators = Array.from(b.byInitiator.entries())
        .sort((a, c) => c[1] - a[1])
        .slice(0, 10);
      if (topInitiators.length > 0) {
        log('  TOP 10 发起人:');
        for (const [id, c] of topInitiators) {
          log(`    ${c.toString().padStart(3)} × ${nameFor(id)} (${id})`);
        }
      }
    }

    log('');
    log(line);
    log(`拉拢/离间比率: ${curry.total}/${alien.total}${alien.total > 0 ? ` = ${(curry.total / alien.total).toFixed(2)}` : ''}`);
    log(line);

    // ── Weight 分布直方图 ──
    function renderWeightHistogram(
      label: string,
      samples: WeightSample[],
      calls: number,
      nullReturns: number,
    ): void {
      log('');
      log(`[${label} — weight 分布]`);
      log(`  generateTask 调用: ${calls}`);
      log(`  返回 null 的次数: ${nullReturns} (${calls > 0 ? Math.round(nullReturns / calls * 100) : 0}%)`);
      log(`  返回非 null 的次数: ${samples.length} (${calls > 0 ? Math.round(samples.length / calls * 100) : 0}%)`);
      if (samples.length === 0) return;

      // 分桶：[5,10) [10,15) [15,20) [20,30) [30,50) [50,100) [100+]
      const buckets: [number, number, string][] = [
        [5, 10, '5-10'],
        [10, 15, '10-15'],
        [15, 20, '15-20'],
        [20, 30, '20-30'],
        [30, 50, '30-50'],
        [50, 100, '50-100'],
        [100, Infinity, '100+'],
      ];
      const counts = buckets.map(([lo, hi]) => samples.filter(s => s.weight >= lo && s.weight < hi).length);
      const max = Math.max(1, ...counts);
      log('  桶位分布（按 chance%）:');
      for (let i = 0; i < buckets.length; i++) {
        const [, , name] = buckets[i];
        const c = counts[i];
        const barLen = Math.round(c / max * 40);
        log(`    ${name.padEnd(7)} ${String(c).padStart(4)} ${'#'.repeat(barLen)}`);
      }

      // 统计数值
      const sorted = [...samples].map(s => s.weight).sort((a, b) => a - b);
      const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p50 = sorted[Math.floor(sorted.length / 2)];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      const min = sorted[0];
      const max2 = sorted[sorted.length - 1];
      log(`  统计: mean=${mean.toFixed(1)} p50=${p50.toFixed(1)} p90=${p90.toFixed(1)} p99=${p99.toFixed(1)} min=${min.toFixed(1)} max=${max2.toFixed(1)}`);
    }

    renderWeightHistogram('拉拢 curryFavor', currySamples, curryCalls, curryNullReturns);
    renderWeightHistogram('离间 alienation', alienSamples, alienCalls, alienNullReturns);
    log('');
    log(line);

    const report = out.join('\n') + '\n';
    writeFileSync('scheme-frequency-report.txt', report, 'utf8');
    // 也写一份到 stdout（vitest 在 pass 时会缓存，但不至于丢）
    process.stdout.write('\n' + report);

    // 防回归：至少有一些拉拢发生（因为 NPC 应该会跑）
    expect(curry.total + alien.total).toBeGreaterThan(0);
  }, 120_000); // 120s 超时
});
