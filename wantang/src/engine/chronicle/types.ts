// ===== AI 史书：类型定义 =====

export type ChronicleStatus = 'pending' | 'generating' | 'done' | 'failed';

/** 月度白话摘要（cheap LLM 调用） */
export interface MonthDraft {
  year: number;
  month: number;
  /** 白话文摘要，~150-200 字。failed 时可能为空。 */
  summary: string;
  status: ChronicleStatus;
  generatedAt?: number;
  failureReason?: string;
}

/** 年度编年体史书（main LLM 调用） */
export interface YearChronicle {
  year: number;
  /** 文言正文（含 1-2 段史臣注/纪传切片）。 */
  content: string;
  status: ChronicleStatus;
  generatedAt?: number;
  failureReason?: string;
  /** 玩家是否已读过该年正文。用于右上角红点。 */
  read: boolean;
}

/** LLM 接入配置（设备级，不进存档）。 */
export interface LlmConfig {
  provider: 'direct' | 'proxy' | 'mock';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /** 月度摘要可单独指定模型，省成本；缺省与 model 相同。 */
  monthModel?: string;
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: 'direct',
  model: 'moonshot-v1-8k',
  apiKey: undefined,
  baseUrl: 'https://api.moonshot.cn/v1',
  monthModel: 'moonshot-v1-8k',
};
