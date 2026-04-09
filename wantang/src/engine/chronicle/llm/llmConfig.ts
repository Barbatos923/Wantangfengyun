// ===== LlmConfig 高层封装 =====
//
// 底层 IndexedDB I/O 在 storage.ts 的 saveLlmConfigRaw / loadLlmConfigRaw。
// 这层负责默认值填充、normalize、不向 serialize 路径暴露任何东西。

import { loadLlmConfigRaw, saveLlmConfigRaw } from '@engine/storage';
import { DEFAULT_LLM_CONFIG, type LlmConfig } from '../types';

function normalizeLlmConfig(raw: Partial<LlmConfig> | undefined): LlmConfig {
  if (!raw) return { ...DEFAULT_LLM_CONFIG };
  return {
    provider: raw.provider ?? DEFAULT_LLM_CONFIG.provider,
    model: raw.model ?? DEFAULT_LLM_CONFIG.model,
    apiKey: raw.apiKey,
    baseUrl: raw.baseUrl ?? DEFAULT_LLM_CONFIG.baseUrl,
    monthModel: raw.monthModel ?? raw.model ?? DEFAULT_LLM_CONFIG.monthModel,
  };
}

export async function loadLlmConfig(): Promise<LlmConfig> {
  const raw = await loadLlmConfigRaw();
  return normalizeLlmConfig(raw);
}

export async function saveLlmConfig(cfg: LlmConfig): Promise<void> {
  await saveLlmConfigRaw(normalizeLlmConfig(cfg));
}
