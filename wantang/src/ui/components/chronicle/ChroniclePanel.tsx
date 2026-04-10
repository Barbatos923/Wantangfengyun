import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from '../base/Modal';
import { ModalHeader } from '../base/ModalHeader';
import { Button } from '../base/Button';
import { useChronicleStore } from '@engine/chronicle/ChronicleStore';
import { retryYear } from '@engine/chronicle/chronicleService';
import LlmConfigPanel from './LlmConfigPanel';

interface ChroniclePanelProps {
  onClose: () => void;
}

const ChroniclePanel: React.FC<ChroniclePanelProps> = ({ onClose }) => {
  const yearChronicles = useChronicleStore((s) => s.yearChronicles);
  const markYearRead = useChronicleStore((s) => s.markYearRead);
  const [tab, setTab] = useState<'history' | 'settings'>('history');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const sortedYears = useMemo(
    () => Array.from(yearChronicles.values()).sort((a, b) => b.year - a.year),
    [yearChronicles],
  );

  // 默认选中第一条
  useEffect(() => {
    if (selectedYear === null && sortedYears.length > 0) {
      setSelectedYear(sortedYears[0].year);
    }
  }, [sortedYears, selectedYear]);

  // 切到某年时标记已读 + 退出编辑态
  useEffect(() => {
    if (selectedYear !== null) markYearRead(selectedYear);
    setEditing(false);
  }, [selectedYear, markYearRead]);

  const upsertYearChronicle = useChronicleStore((s) => s.upsertYearChronicle);
  const selected = selectedYear !== null ? yearChronicles.get(selectedYear) : null;

  return (
    <Modal size="xl" zIndex={50} onOverlayClick={onClose}>
      <ModalHeader title="史书阁" onClose={onClose} />

      {/* Tab 切换 */}
      <div className="flex border-b border-[var(--color-border)] shrink-0">
        <button
          className={`px-4 py-2 text-sm transition-colors ${
            tab === 'history'
              ? 'text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
          onClick={() => setTab('history')}
        >
          史书
        </button>
        <button
          className={`px-4 py-2 text-sm transition-colors ${
            tab === 'settings'
              ? 'text-[var(--color-accent-gold)] border-b-2 border-[var(--color-accent-gold)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
          onClick={() => setTab('settings')}
        >
          设置
        </button>
      </div>

      {tab === 'history' && (
        <div className="flex h-[70vh] min-h-0">
          {/* 左侧年表 */}
          <div className="w-40 border-r border-[var(--color-border)] overflow-y-auto shrink-0">
            {sortedYears.length === 0 && (
              <div className="p-4 text-xs text-[var(--color-text-muted)]">
                尚未撰成任何史书。
                <br />
                请在游戏内推进时间。
              </div>
            )}
            {sortedYears.map((yc) => {
              const isSel = selectedYear === yc.year;
              const unread = yc.status === 'done' && !yc.read;
              return (
                <button
                  key={yc.year}
                  onClick={() => setSelectedYear(yc.year)}
                  className={`w-full text-left px-3 py-2 text-xs border-b border-[var(--color-border)]/50 transition-colors ${
                    isSel
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-accent-gold)]'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-bg-surface)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold">{yc.year}年</span>
                    {unread && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-red)]" />
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    {yc.status === 'done' && '已成'}
                    {yc.status === 'generating' && '撰写中…'}
                    {yc.status === 'pending' && '待撰'}
                    {yc.status === 'failed' && '修史失败'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 右侧正文 */}
          <div className="flex-1 flex flex-col min-h-0 p-5 overflow-hidden">
            {!selected && (
              <div className="text-[var(--color-text-muted)] text-sm">请在左侧选择年份。</div>
            )}
            {selected && selected.status === 'done' && (
              editing ? (
                <div className="flex flex-col flex-1 min-h-0">
                  <textarea
                    className="flex-1 min-h-0 w-full bg-[var(--color-bg)] text-[var(--color-text)] font-serif text-sm leading-loose p-2 border border-[var(--color-border)] rounded resize-none focus:outline-none focus:border-[var(--color-accent-gold)]"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  <div className="flex gap-2 pt-3 mt-3 border-t border-[var(--color-border)]/50 shrink-0">
                    <Button variant="primary" size="sm" onClick={() => {
                      upsertYearChronicle({ ...selected, content: editContent });
                      setEditing(false);
                    }}>
                      保存
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0">
                  <pre className="flex-1 min-h-0 overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-loose text-[var(--color-text)]">
                    {selected.content}
                  </pre>
                  <div className="flex gap-2 pt-3 mt-3 border-t border-[var(--color-border)]/50 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditContent(selected.content);
                      setEditing(true);
                    }}>
                      编辑
                    </Button>
                  </div>
                </div>
              )
            )}
            {selected && selected.status === 'generating' && (
              <div className="text-[var(--color-text-muted)] text-sm">史官正在撰写中，请稍候…</div>
            )}
            {selected && selected.status === 'pending' && (
              <div className="text-[var(--color-text-muted)] text-sm">已入待撰队列。</div>
            )}
            {selected && selected.status === 'failed' && (
              <div className="flex flex-col gap-3">
                <div className="text-[var(--color-accent-red)] text-sm">
                  修史失败：{selected.failureReason ?? '未知原因'}
                </div>
                <div>
                  <Button variant="primary" size="sm" onClick={() => retryYear(selected.year)}>
                    重试
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="flex-1 overflow-y-auto">
          <LlmConfigPanel />
        </div>
      )}
    </Modal>
  );
};

export default ChroniclePanel;
