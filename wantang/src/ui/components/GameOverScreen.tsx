// ===== 王朝覆灭终局屏 =====
// 玩家角色绝嗣死亡时全屏覆盖渲染。点击"开始新游戏"清存档+重置 store。

import React, { useState } from 'react';
import { useTurnManager } from '@engine/TurnManager';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { newGame } from '@engine/persistence/saveManager';
import { Button } from './base';

const GameOverScreen: React.FC = () => {
  const dynastyExtinct = useTurnManager((s) => s.dynastyExtinct);
  const currentDate = useTurnManager((s) => s.currentDate);
  // 死后 playerId 已被清，从 events 取最近一条"王朝覆灭"也行；这里用最简显示日期即可
  const [busy, setBusy] = useState(false);

  if (!dynastyExtinct) return null;

  async function handleNewGame() {
    setBusy(true);
    try {
      await newGame();
    } finally {
      setBusy(false);
    }
  }

  // 死亡时已 setPlayerId(null)，但 events 里"王朝覆灭"事件保留了死者名字
  const lastDynastyEvent = useTurnManager.getState().events
    .slice()
    .reverse()
    .find((e) => e.type === '王朝覆灭');
  const description = lastDynastyEvent?.description ?? '后继无人，一脉断绝';

  // 显示死者名（防御：若 playerId 仍指向某角色就用之，否则取事件 actor）
  const playerId = useCharacterStore.getState().playerId;
  const fallbackChar = lastDynastyEvent?.actors[0]
    ? useCharacterStore.getState().characters.get(lastDynastyEvent.actors[0])
    : undefined;
  const deadName = (playerId && useCharacterStore.getState().characters.get(playerId)?.name)
    ?? fallbackChar?.name
    ?? '?';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85">
      <div className="max-w-md w-[90%] bg-[var(--color-bg-panel)] border border-[var(--color-accent-gold)] rounded-lg shadow-2xl p-8 flex flex-col items-center gap-5">
        <div className="text-5xl">⚱</div>
        <h1 className="text-2xl font-bold text-[var(--color-accent-gold)]">王朝覆灭</h1>
        <p className="text-sm text-[var(--color-text-muted)] text-center leading-relaxed">
          {description}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {currentDate.year}年{currentDate.month}月{currentDate.day}日 · {deadName} 一脉断绝
        </p>
        <Button
          variant="primary"
          className="w-full py-2.5 font-bold mt-2"
          disabled={busy}
          onClick={handleNewGame}
        >
          开始新游戏
        </Button>
      </div>
    </div>
  );
};

export default GameOverScreen;
