import React, { useEffect } from 'react';
import { loadSampleData } from './data';
import { useTurnManager } from './engine';
import { runDailySettlement, runMonthlySettlement } from './engine/settlement';
import GameLayout from './ui/layouts/GameLayout';

const App: React.FC = () => {
  useEffect(() => {
    loadSampleData();
    // 注册日结算回调（每日触发：战争系统）
    useTurnManager.getState().registerDailyCallback('daily-settlement', runDailySettlement);
    // 注册月结算回调（每月初触发：角色/NPC/经济/军事等）
    useTurnManager.getState().registerMonthlyCallback('monthly-settlement', runMonthlySettlement);
    return () => {
      useTurnManager.getState().unregisterDailyCallback('daily-settlement');
      useTurnManager.getState().unregisterMonthlyCallback('monthly-settlement');
    };
  }, []);

  return <GameLayout />;
};

export default App;
