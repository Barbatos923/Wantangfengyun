// ===== 种子随机数模块 =====

import seedrandom from 'seedrandom';

let rng: seedrandom.PRNG = seedrandom();
let currentSeed = '';

/** 初始化或重新设置随机种子。游戏启动和读档时调用。 */
export function initRng(seed: string): void {
  currentSeed = seed;
  rng = seedrandom(seed);
}

/** 获取当前种子（用于存档序列化）。 */
export function getCurrentSeed(): string {
  return currentSeed;
}

/** 返回 [0, 1) 的确定性随机数，替代 Math.random()。 */
export function random(): number {
  return rng();
}

/** 随机整数 [min, max]（闭区间）。 */
export function randInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

/** Fisher-Yates 洗牌（原地修改并返回）。 */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
