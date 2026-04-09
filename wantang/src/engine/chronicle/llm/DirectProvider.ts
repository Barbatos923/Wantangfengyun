// ===== DirectProvider：BYOK 直连 OpenAI 兼容端点 =====
//
// Kimi (Moonshot) / DeepSeek / Qwen 都用 OpenAI 兼容格式。
// 必须传 AbortSignal；被 abort 时直接抛出 AbortError，service 层会丢弃结果。

import type { LlmConfig } from '../types';
import type { LlmGenerateOptions, LlmPrompt, LlmProvider } from './LlmProvider';

export class DirectProvider implements LlmProvider {
  readonly id = 'direct' as const;
  constructor(private readonly config: LlmConfig) {}

  async generate(prompt: LlmPrompt, opts: LlmGenerateOptions): Promise<string> {
    const baseUrl = this.config.baseUrl ?? 'https://api.moonshot.cn/v1';
    const model =
      opts.kind === 'month' && this.config.monthModel
        ? this.config.monthModel
        : this.config.model;

    const body = {
      model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      max_tokens: opts.maxTokens ?? 1000,
      temperature: opts.temperature ?? 0.7,
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey ?? ''}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) {
      throw new Error('LLM 返回空内容');
    }
    return content.trim();
  }
}
