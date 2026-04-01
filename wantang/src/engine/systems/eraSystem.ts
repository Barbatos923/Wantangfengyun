// ===== 时代系统：进度条推进 + 时代切换 =====

import type { GameDate } from '@engine/types';
import { Era } from '@engine/types';
import { useTurnManager } from '@engine/TurnManager';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { findEmperorId } from '@engine/official/postQueries';
import { getHighestBaseLegitimacy } from '@engine/official/legitimacyCalc';
import { getHeldPosts } from '@engine/official/postQueries';

// ── 外部可调用：增加崩溃进度（如战争结算） ─────────────────────────────────────

export function addCollapseProgress(amount: number): void {
  const tm = useTurnManager.getState();
  tm.setEraState({ collapseProgress: tm.collapseProgress + amount });
}

// ── 月结入口 ────────────────────────────────────────────────────────────────────

export function runEraSystem(_date: GameDate): void {
  const tm = useTurnManager.getState();
  const { era } = tm;
  let { collapseProgress } = tm;

  // 读取皇帝正统性状态
  const terrStore = useTerritoryStore.getState();
  const emperorId = findEmperorId(terrStore.territories, terrStore.centralPosts);
  let emperorBelowExpectation = false;

  if (emperorId) {
    const emperor = useCharacterStore.getState().getCharacter(emperorId);
    if (emperor) {
      const heldPosts = getHeldPosts(emperorId, terrStore.territories, terrStore.centralPosts);
      const expected = getHighestBaseLegitimacy(heldPosts);
      if (expected !== null && emperor.resources.legitimacy < expected) {
        emperorBelowExpectation = true;
      }
    }
  }

  // ── 治世 → 危世（衰退进度条） ──
  if (era === Era.ZhiShi) {
    // 土地兼并：每月 +1/12 ≈ 每年 +1
    collapseProgress += 1 / 12;
    // 皇帝正统性低于预期：每月 +5/12 ≈ 每年 +5
    if (emperorBelowExpectation) {
      collapseProgress += 5 / 12;
    }
  }

  // ── 危世 → 乱世（崩溃进度条） ──
  if (era === Era.WeiShi) {
    // 皇帝正统性低于预期：每月 +5/12 ≈ 每年 +5
    if (emperorBelowExpectation) {
      collapseProgress += 5 / 12;
    }
    // 独立战争胜利在 warSettlement 中通过 addCollapseProgress(10) 触发
  }

  // ── 检查时代切换 ──
  if (collapseProgress >= 100) {
    const nextEra = era === Era.ZhiShi ? Era.WeiShi : Era.LuanShi;
    useTurnManager.getState().setEraState({
      era: nextEra,
      collapseProgress: 0,
      stabilityProgress: 0,
    });
  } else {
    useTurnManager.getState().setEraState({ collapseProgress });
  }
}
