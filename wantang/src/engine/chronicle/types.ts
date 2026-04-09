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
  /**
   * 方向 3：跨年记忆
   * 史官按语提取（content 末段，约 200-250 字），下一年史 prompt 注入"前情提要"用。
   * 旧存档没有此字段时为 undefined，下一年史按"无前情"处理。
   */
  afterword?: string;
  /**
   * 方向 3：跨年记忆
   * 本年生成时的 dossier 快照（直接复用 CharacterDossier，JSON-serializable）。
   * 下一年史 prompt 注入"上年关键人物近况"用，让 LLM 跨年保持称呼一致。
   * 类型用 unknown[] 避免循环依赖，运行时按 CharacterDossier 处理。
   */
  keyCharactersSnapshot?: unknown[];
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
