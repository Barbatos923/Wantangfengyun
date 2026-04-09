import React, { useEffect, useState } from 'react';
import { loadSampleData } from './data';
import { useTurnManager } from './engine';
import { runDailySettlement, runMonthlySettlement } from './engine/settlement';
import { loadCurrent, saveCurrent } from './engine/persistence/saveManager';
import { chronicleService } from './engine/chronicle/chronicleService';
import { useSaveStatusStore } from './ui/stores/saveStatusStore';
import GameLayout from './ui/layouts/GameLayout';

const App: React.FC = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 优先尝试从 IndexedDB 恢复存档；无存档则走新游戏初始化
      try {
        const restored = await loadCurrent();
        if (!restored) loadSampleData();
      } catch (e) {
        // 读档失败：fallback 到新游戏，并提示玩家
        const msg = e instanceof Error ? e.message : String(e);
        useSaveStatusStore.getState().setError(`读档失败，已开始新游戏：${msg}`);
        loadSampleData();
      }
      if (cancelled) return;

      // 注册日结算回调（每日触发：战争系统）
      useTurnManager.getState().registerDailyCallback('daily-settlement', runDailySettlement);
      // 注册月结算回调（每月初触发：角色/NPC/经济/军事等）
      useTurnManager.getState().registerMonthlyCallback('monthly-settlement', runMonthlySettlement);
      // 月结算后自动存档（依赖 Map 插入顺序，注册在 monthly-settlement 之后即可保证顺序）
      useTurnManager.getState().registerMonthlyCallback('auto-save', () => {
        saveCurrent().catch(() => { /* saveCurrent 内部已经 setError 弹 toast */ });
      });

      // 启动 AI 史书 service（幂等，StrictMode 下双调用安全）
      chronicleService.start();

      setReady(true);
    })();

    // 关闭/刷新前兜底再写一次（fire-and-forget；浏览器可能不等 async 完成，但月结后已经存过最近一次）
    const onUnload = () => {
      saveCurrent().catch(() => {});
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', onUnload);
      useTurnManager.getState().unregisterDailyCallback('daily-settlement');
      useTurnManager.getState().unregisterMonthlyCallback('monthly-settlement');
      useTurnManager.getState().unregisterMonthlyCallback('auto-save');
      chronicleService.stop();
    };
  }, []);

  if (!ready) return null;
  return <GameLayout />;
};

export default App;
