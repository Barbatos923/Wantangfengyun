// ===== createProvider：纯工厂 =====

import type { LlmConfig } from '../types';
import { DirectProvider } from './DirectProvider';
import { mockProvider } from './MockProvider';
import type { LlmProvider } from './LlmProvider';

export function createProvider(config: LlmConfig): LlmProvider {
  if (config.provider === 'mock') return mockProvider;
  if (config.provider === 'direct') {
    if (!config.apiKey || !config.apiKey.trim()) {
      // eslint-disable-next-line no-console
      console.warn('[chronicle] no apiKey, falling back to MockProvider');
      return mockProvider;
    }
    return new DirectProvider(config);
  }
  if (config.provider === 'proxy') {
    // eslint-disable-next-line no-console
    console.warn('[chronicle] ProxyProvider not implemented yet, falling back to MockProvider');
    return mockProvider;
  }
  return mockProvider;
}
