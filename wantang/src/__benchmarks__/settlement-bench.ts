// ===== 月结算压测脚本 =====
//
// 用法：在浏览器控制台中 import 后调用 runBenchmark()
// 或在 App.tsx 中临时引入调用
//
// 目标：5000 角色 + 300 领地 + 1200 岗位，12 轮月结 < 500ms

import type { Character } from '@engine/character/types';
import type { Territory, Post } from '@engine/territory/types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { runMonthlySettlement } from '@engine/settlement';

// ===== 随机工具 =====

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===== 批量生成角色 =====

const TRAIT_IDS = [
  'trait-brave', 'trait-coward', 'trait-just', 'trait-cruel',
  'trait-social', 'trait-shy', 'trait-trusting', 'trait-suspicious',
  'trait-content', 'trait-ambitious', 'trait-anxious',
];

function generateCharacters(count: number): Character[] {
  const chars: Character[] = [];

  // 先生成 ~50 个领主（有 official 数据，会触发经济结算）
  const lordCount = 50;

  for (let i = 0; i < count; i++) {
    const id = `bench-char-${i}`;
    const isLord = i < lordCount;

    // 前 lordCount 个角色互相之间建立效忠链
    let overlordId: string | undefined;
    if (i > 0 && i < lordCount) {
      // 效忠于前面某个领主
      overlordId = `bench-char-${randInt(0, Math.min(i - 1, lordCount - 1))}`;
    } else if (i >= lordCount) {
      // 普通角色效忠于某个领主
      overlordId = `bench-char-${randInt(0, lordCount - 1)}`;
    }

    const traitIds = [];
    const traitCount = randInt(1, 4);
    const shuffled = [...TRAIT_IDS].sort(() => Math.random() - 0.5);
    for (let t = 0; t < traitCount; t++) {
      traitIds.push(shuffled[t]);
    }

    const char: Character = {
      id,
      name: `测试角色${i}`,
      courtesy: `字${i}`,
      gender: '男',
      birthYear: 830 + randInt(0, 30),
      clan: `族${i % 20}`,
      family: { childrenIds: [] },
      abilities: {
        military: randInt(3, 20),
        administration: randInt(3, 20),
        strategy: randInt(3, 20),
        diplomacy: randInt(3, 20),
        scholarship: randInt(3, 20),
      },
      traitIds,
      health: randInt(50, 100),
      stress: randInt(0, 30),
      alive: true,
      resources: {
        money: randInt(1000, 50000),
        grain: randInt(1000, 50000),
        prestige: randInt(0, 100),
        legitimacy: randInt(0, 100),
      },
      relationships: [],
      overlordId,
      isPlayer: i === 0,
      isRuler: i === 0,
      title: isLord ? '节度使' : '百姓',
      official: isLord ? {
        rankLevel: randInt(10, 25),
        virtue: randInt(0, 500),
        isCivil: Math.random() > 0.5,
      } : undefined,
    };

    chars.push(char);
  }

  return chars;
}

// ===== 批量生成领地 =====

function generateTerritories(count: number, lordCount: number): Territory[] {
  const territories: Territory[] = [];

  for (let i = 0; i < count; i++) {
    const id = `bench-terr-${i}`;
    const controllerId = `bench-char-${i % lordCount}`;

    // 每个领地 4 个岗位：1 个 grantsControl（刺史），3 个副岗位
    const posts: Post[] = [
      {
        id: `bench-post-${i}-0`,
        templateId: 'pos-cishi',
        territoryId: id,
        holderId: controllerId,
        appointedBy: controllerId,
        successionLaw: 'bureaucratic',
        hasAppointRight: false,
      },
      {
        id: `bench-post-${i}-1`,
        templateId: 'pos-lushibcanjun',
        territoryId: id,
        holderId: Math.random() > 0.3 ? `bench-char-${randInt(0, lordCount - 1)}` : null,
        successionLaw: 'bureaucratic',
        hasAppointRight: false,
      },
      {
        id: `bench-post-${i}-2`,
        templateId: 'pos-canjun',
        territoryId: id,
        holderId: Math.random() > 0.5 ? `bench-char-${randInt(0, lordCount - 1)}` : null,
        successionLaw: 'bureaucratic',
        hasAppointRight: false,
      },
      {
        id: `bench-post-${i}-3`,
        templateId: 'pos-panguan',
        territoryId: id,
        holderId: Math.random() > 0.5 ? `bench-char-${randInt(0, lordCount - 1)}` : null,
        successionLaw: 'bureaucratic',
        hasAppointRight: false,
      },
    ];

    const terr: Territory = {
      id,
      name: `测试州${i}`,
      tier: 'zhou',
      territoryType: i % 2 === 0 ? 'civil' : 'military',
      childIds: [],
      dejureControllerId: controllerId,
      posts,
      control: randInt(30, 100),
      development: randInt(20, 80),
      populace: randInt(30, 90),
      buildings: [
        { buildingId: null, level: 0 },
        { buildingId: null, level: 0 },
        { buildingId: null, level: 0 },
        { buildingId: null, level: 0 },
      ],
      constructions: [],
      basePopulation: randInt(50000, 300000),
      conscriptionPool: 0,
      moneyRatio: 0.3 + Math.random() * 0.4,
      grainRatio: 0.3 + Math.random() * 0.4,
    };

    territories.push(terr);
  }

  return territories;
}

// ===== 压测主函数 =====

export function runBenchmark() {
  const CHAR_COUNT = 5000;
  const TERR_COUNT = 300;
  const LORD_COUNT = 50;
  const ROUNDS = 12;

  console.log('=== 月结算压测 ===');
  console.log(`角色: ${CHAR_COUNT}, 领地: ${TERR_COUNT}, 领主: ${LORD_COUNT}, 轮次: ${ROUNDS}`);

  // 生成数据
  const t0 = performance.now();
  const chars = generateCharacters(CHAR_COUNT);
  const terrs = generateTerritories(TERR_COUNT, LORD_COUNT);
  const t1 = performance.now();
  console.log(`数据生成: ${(t1 - t0).toFixed(1)}ms`);

  // 初始化 Store
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  charStore.initCharacters(chars);
  terrStore.initTerritories(terrs);
  const t2 = performance.now();
  console.log(`Store初始化(含索引): ${(t2 - t1).toFixed(1)}ms`);

  // 运行月结
  const roundTimes: number[] = [];
  const startYear = 870;

  for (let r = 0; r < ROUNDS; r++) {
    const month = (r % 12) + 1;
    const year = startYear + Math.floor(r / 12);
    const rs = performance.now();
    runMonthlySettlement({ year, month, day: 1 });
    const re = performance.now();
    const elapsed = re - rs;
    roundTimes.push(elapsed);
    console.log(`  第${r + 1}轮 (${year}年${month}月): ${elapsed.toFixed(1)}ms`);
  }

  const total = roundTimes.reduce((a, b) => a + b, 0);
  const avg = total / ROUNDS;
  const max = Math.max(...roundTimes);

  console.log('--- 结果 ---');
  console.log(`总耗时: ${total.toFixed(1)}ms ${total < 500 ? '✅ PASS' : '❌ FAIL (>500ms)'}`);
  console.log(`平均: ${avg.toFixed(1)}ms/轮`);
  console.log(`最慢: ${max.toFixed(1)}ms ${max < 50 ? '✅' : '⚠️ (>50ms)'}`);

  // 验证索引一致性
  const state = useCharacterStore.getState();
  const aliveCount = state.aliveSet.size;
  const aliveCheck = state.getAliveCharacters().length;
  console.log(`aliveSet大小: ${aliveCount}, getAliveCharacters: ${aliveCheck} ${aliveCount === aliveCheck ? '✅' : '❌'}`);

  const terrState = useTerritoryStore.getState();
  let controllerEntries = 0;
  for (const s of terrState.controllerIndex.values()) {
    controllerEntries += s.size;
  }
  console.log(`controllerIndex条目: ${controllerEntries}`);

  return { total, avg, max, pass: total < 500 };
}
