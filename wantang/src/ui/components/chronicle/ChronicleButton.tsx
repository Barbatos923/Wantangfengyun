import React, { useState } from 'react';
import { useChronicleStore } from '@engine/chronicle/ChronicleStore';
import ChroniclePanel from './ChroniclePanel';

const ChronicleButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  // 订阅 yearChronicles，确保新增/已读变化时按钮重渲（getUnreadCount 不是 selector，要靠这层订阅触发）
  const yearChronicles = useChronicleStore((s) => s.yearChronicles);
  const unread = (() => {
    let n = 0;
    for (const yc of yearChronicles.values()) {
      if (yc.status === 'done' && !yc.read) n++;
    }
    return n;
  })();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-2 right-12 z-30 w-9 h-9 rounded bg-[var(--color-bg-panel)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-gold)] hover:text-[var(--color-text)] transition-colors flex items-center justify-center text-base font-bold"
        title="史书阁"
      >
        史
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{
              background: 'var(--color-accent-red)',
              color: '#fff',
              border: '1px solid var(--color-bg-panel)',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && <ChroniclePanel onClose={() => setOpen(false)} />}
    </>
  );
};

export default ChronicleButton;
