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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey ?? ''}`,
    };
    // OpenRouter 推荐加 Referer + Title 以获得更好的速率限制优先级
    if (baseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://wantangfengyun.game';
      headers['X-Title'] = 'Wantang Fengyun';
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    // 先取 text 再 JSON.parse，方便在解析失败时把原文打出来
    // （直接 res.json() 失败时只会抛 "Unexpected token X"，看不到服务端到底返回了什么）
    const rawText = await res.text();
    let json: {
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string;
          reasoning_content?: string; // 思考型模型(Kimi K2 等)把推理放这
        };
      }>;
      usage?: Record<string, unknown>;
    };
    try {
      json = JSON.parse(rawText);
    } catch (parseErr) {
      const reason = parseErr instanceof Error ? parseErr.message : String(parseErr);
      // eslint-disable-next-line no-console
      console.error('[LLM] JSON parse failed, raw response:', rawText.slice(0, 1000));
      throw new Error(`LLM JSON 解析失败 (${reason}): ${rawText.slice(0, 200)}`);
    }
    const message = json.choices?.[0]?.message;
    // 优先 content；空则 fallback reasoning_content（兼容思考型模型短回答场景）
    const content = (message?.content ?? '').trim() || (message?.reasoning_content ?? '').trim();
    if (!content) {
      throw new Error('LLM 返回空内容');
    }
    return content;
  }
}
