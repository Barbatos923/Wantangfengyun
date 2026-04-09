// ===== LLM Provider 接口 =====
//
// 三个实现：DirectProvider（BYOK，OpenAI 兼容 fetch）、
//          ProxyProvider（Steam 发行后必做，目前未实现）、
//          MockProvider（离线兜底 / 测试 / 缺 key 时降级）。
//
// 接口约定：
// - generate() 必须接 AbortSignal
// - provider 内部不读 Zustand store，配置由 service 在调用 createProvider 时传入
// - 被取消时必须抛 AbortError 或 throw signal.reason，service 层据此区分"取消 vs 真失败"

export interface LlmPrompt {
  system: string;
  user: string;
}

export interface LlmGenerateOptions {
  maxTokens?: number;
  temperature?: number;
  signal: AbortSignal;
  /** 月稿 vs 年史，让 MockProvider 选择不同兜底策略；DirectProvider 也据此选 model */
  kind?: 'month' | 'year';
}

export interface LlmProvider {
  readonly id: 'direct' | 'proxy' | 'mock';
  generate(prompt: LlmPrompt, opts: LlmGenerateOptions): Promise<string>;
}

/** 判断错误是否为主动取消（service 层据此决定丢弃任务而非降级 Mock）。 */
export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}
