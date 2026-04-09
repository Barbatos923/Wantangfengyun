/**
 * AI 史书：持久化不变量
 *
 * 1. 存档 round-trip：ChronicleStore 写入 → serializeGame → deserializeGame → 内容严格相等。
 * 2. 序列化产物里**不能**包含 apiKey 或 llmConfig（设备级凭证不进存档文件）。
 * 3. 新游戏重置后 chronicle 应被清空（resetTransientStores 调 clearAll）。
 *
 * 不测：LLM 文本生成本身、HTTP 调用、UI 渲染。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useChronicleStore } from '@engine/chronicle/ChronicleStore';
import { serializeGame } from '@engine/persistence/serialize';
import { deserializeGame } from '@engine/persistence/deserialize';
import type { MonthDraft, YearChronicle } from '@engine/chronicle/types';

const sampleMonth: MonthDraft = {
  year: 870,
  month: 3,
  summary: '测试摘要：三月，魏博节度使韩允中遣使入朝。',
  status: 'done',
  generatedAt: 1700000000000,
};

const sampleYear: YearChronicle = {
  year: 870,
  content: '咸通十一年春正月，○○薨。史臣注：xx 传，xxx……',
  status: 'done',
  generatedAt: 1700000001000,
  read: false,
};

describe('chronicle 持久化', () => {
  beforeEach(() => {
    useChronicleStore.getState().clearAll();
  });

  it('round-trip: serialize → deserialize 后 ChronicleStore 内容严格相等', () => {
    // 1. 写入 store
    useChronicleStore.getState().upsertMonthDraft(sampleMonth);
    useChronicleStore.getState().upsertMonthDraft({ ...sampleMonth, month: 4, summary: '四月之事' });
    useChronicleStore.getState().upsertMonthDraft({ ...sampleMonth, month: 5, summary: '五月之事' });
    useChronicleStore.getState().upsertYearChronicle(sampleYear);

    // 2. 序列化
    const save = serializeGame();

    // 3. 清空再反序列化
    useChronicleStore.getState().clearAll();
    expect(useChronicleStore.getState().monthDrafts.size).toBe(0);
    expect(useChronicleStore.getState().yearChronicles.size).toBe(0);

    deserializeGame(save);

    // 4. 严格相等断言
    const monthDrafts = useChronicleStore.getState().monthDrafts;
    const yearChronicles = useChronicleStore.getState().yearChronicles;
    expect(monthDrafts.size).toBe(3);
    expect(yearChronicles.size).toBe(1);

    expect(monthDrafts.get('870-3')).toEqual(sampleMonth);
    expect(monthDrafts.get('870-4')).toEqual({ ...sampleMonth, month: 4, summary: '四月之事' });
    expect(monthDrafts.get('870-5')).toEqual({ ...sampleMonth, month: 5, summary: '五月之事' });
    expect(yearChronicles.get(870)).toEqual(sampleYear);
  });

  it('SaveFile JSON 不应包含 apiKey 或 llmConfig 字段', () => {
    useChronicleStore.getState().upsertYearChronicle(sampleYear);
    const save = serializeGame();
    const json = JSON.stringify(save);

    expect(json.includes('"apiKey"')).toBe(false);
    expect(json.includes('"llmConfig"')).toBe(false);
    // chronicleState 必须存在，且包含我们写入的数据
    expect(save.chronicleState).toBeDefined();
    expect(save.chronicleState.yearChronicles.length).toBe(1);
  });

  it('clearAll 后 store 完全清空（新游戏 reset 路径）', () => {
    useChronicleStore.getState().upsertMonthDraft(sampleMonth);
    useChronicleStore.getState().upsertYearChronicle(sampleYear);
    expect(useChronicleStore.getState().monthDrafts.size).toBe(1);
    expect(useChronicleStore.getState().yearChronicles.size).toBe(1);

    useChronicleStore.getState().clearAll();

    expect(useChronicleStore.getState().monthDrafts.size).toBe(0);
    expect(useChronicleStore.getState().yearChronicles.size).toBe(0);
    expect(useChronicleStore.getState().getUnreadCount()).toBe(0);
  });

  it('未读计数：仅 done 且 read=false 的年史计入', () => {
    useChronicleStore.getState().upsertYearChronicle({ ...sampleYear, year: 870, read: false });
    useChronicleStore.getState().upsertYearChronicle({ ...sampleYear, year: 871, read: true });
    useChronicleStore.getState().upsertYearChronicle({
      ...sampleYear,
      year: 872,
      status: 'generating',
      read: false,
    });
    expect(useChronicleStore.getState().getUnreadCount()).toBe(1);

    useChronicleStore.getState().markYearRead(870);
    expect(useChronicleStore.getState().getUnreadCount()).toBe(0);
  });
});
