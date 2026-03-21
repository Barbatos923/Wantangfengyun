import React, { useEffect } from 'react';
import { loadSampleData } from './data';
import { useTurnManager } from './engine';
import { runMonthlySettlement } from './engine/settlement';
import GameLayout from './ui/layouts/GameLayout';

const App: React.FC = () => {
  useEffect(() => {
    loadSampleData();
    // 注册月结算回调
    useTurnManager.getState().registerMonthlyCallback('settlement', runMonthlySettlement);
    return () => {
      useTurnManager.getState().unregisterMonthlyCallback('settlement');
    };
  }, []);

  return <GameLayout />;
};

export default App;
