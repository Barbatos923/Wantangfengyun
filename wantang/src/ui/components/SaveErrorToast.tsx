// ===== 存档失败提示 toast =====
// 右下角显示，5 秒后自动消失，可手动点 × 关闭。

import React, { useEffect } from 'react';
import { useSaveStatusStore } from '@ui/stores/saveStatusStore';

const SaveErrorToast: React.FC = () => {
  const lastError = useSaveStatusStore((s) => s.lastError);
  const clear = useSaveStatusStore((s) => s.clear);

  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(clear, 5000);
    return () => clearTimeout(t);
  }, [lastError, clear]);

  if (!lastError) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 max-w-sm bg-red-900 border border-red-600 text-red-100 px-4 py-3 rounded shadow-lg flex items-start gap-3">
      <span className="text-lg">⚠️</span>
      <div className="flex-1 text-sm">{lastError}</div>
      <button
        onClick={clear}
        className="text-red-300 hover:text-red-100 text-lg leading-none"
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  );
};

export default SaveErrorToast;
