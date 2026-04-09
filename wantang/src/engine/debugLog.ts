/**
 * 轻量调试日志开关。默认全部关闭。
 *
 * 在浏览器 DevTools 里临时开启某一类：
 *   window.__DEBUG__.policy = true
 *   window.__DEBUG__.military = true
 *   window.__DEBUG__.interaction = true
 *   window.__DEBUG__.inheritance = true
 *   window.__DEBUG__.emperor = true
 *   window.__DEBUG__.war = true
 *
 * 用法：debugLog('policy', `[政策] xxx`)
 *
 * 这是为了把 NPC 行为/交互骰子/军编等"调试时极有价值、平时是噪音"的
 * console.log 收敛到一个开关下，避免控制台被流水账淹没。
 */

export type DebugCategory =
  | 'policy'        // NPC 行政/政策 behaviors
  | 'military'      // 军编 AI / 战斗结算
  | 'interaction'   // 玩家/NPC 交互骰子
  | 'inheritance'   // 继承 / 留后
  | 'emperor'       // 皇帝 AI 决策
  | 'war'           // 宣战 / 战争结束
  | 'chronicle';    // AI 史书：月稿 / 年史 / provider / stale 丢弃

const FLAGS: Record<DebugCategory, boolean> = {
  policy: false,
  military: false,
  interaction: false,
  inheritance: false,
  emperor: false,
  war: false,
  chronicle: false,
};

if (typeof window !== 'undefined') {
  (window as unknown as { __DEBUG__: Record<DebugCategory, boolean> }).__DEBUG__ = FLAGS;
}

export function debugLog(cat: DebugCategory, ...args: unknown[]): void {
  if (FLAGS[cat]) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}
