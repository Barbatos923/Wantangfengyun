// ===== 种子随机数模块 =====
//
// 使用 seedrandom 的 stateful 模式，可导出/恢复"摇了 N 次后"的中间状态。
// 这让存档具备完全决定性：同一存档读档后续推进走向 100% 一致，
// 既能防 SL 大法，又能让 bug 复现 100% 还原（用户发存档过来直接重现）。

import seedrandom from 'seedrandom';

let rng: seedrandom.StatefulPRNG<seedrandom.State.Arc4> = seedrandom('', { state: true });
let currentSeed = '';

/** 初始化或重新设置随机种子。游戏启动和"新游戏"时调用。 */
export function initRng(seed: string): void {
  currentSeed = seed;
  rng = seedrandom(seed, { state: true });
}

/** 获取当前种子（用于存档序列化）。 */
export function getCurrentSeed(): string {
  return currentSeed;
}

/** 导出当前 RNG 中间状态（已摇骰子次数后的位置），用于存档。 */
export function getRngState(): seedrandom.State.Arc4 {
  return rng.state();
}

/** 从存档恢复 RNG 完整中间状态。读档时调用。 */
export function restoreRng(seed: string, state: seedrandom.State.Arc4): void {
  currentSeed = seed;
  rng = seedrandom('', { state });
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
