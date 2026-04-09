// ===== MockProvider：离线 / 测试 / 缺 key 兜底 =====
//
// 永远成功（除非被 abort）。把 prompt.user 段落里的内容做最简单的拼接，
// 给玩家一个"保底可看"的内容。

import type { LlmGenerateOptions, LlmPrompt, LlmProvider } from './LlmProvider';

export const mockProvider: LlmProvider = {
  id: 'mock',
  async generate(prompt: LlmPrompt, opts: LlmGenerateOptions): Promise<string> {
    if (opts.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    // user 段落里 service 已经把事件 / 月稿拼好了，直接回 user 即可
    // 加一个标题前缀，让玩家看出这是兜底内容
    const tag = opts.kind === 'year' ? '【保底年史】' : '【保底摘要】';
    return `${tag}${prompt.user.trim()}`;
  },
};
