// ===== 时代系统：进度条推进 + 时代切换 =====

import type { GameDate } from '@engine/types';
import { Era } from '@engine/types';
import { useTurnManager } from '@engine/TurnManager';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { findEmperorId, collectRulerIds } from '@engine/official/postQueries';
import { getHighestBaseLegitimacy } from '@engine/official/legitimacyCalc';
import { getHeldPosts } from '@engine/official/postQueries';
import { positionMap } from '@data/positions';
import { refreshPostCaches, ensureAppointRight } from '@engine/official/postTransfer';
import { executeToggleSuccession } from '@engine/interaction/centralizationAction';
import { hasAppointRightPost } from '@engine/military/warCalc';

// ── 外部可调用：增加崩溃进度（如战争结算） ─────────────────────────────────────

export function addCollapseProgress(amount: number): void {
  const tm = useTurnManager.getState();
  tm.setEraState({ collapseProgress: tm.collapseProgress + amount });
}

// ── 月结入口 ────────────────────────────────────────────────────────────────────

export function runEraSystem(_date: GameDate): void {
  const tm = useTurnManager.getState();
  const { era } = tm;
  let { collapseProgress, stabilityProgress } = tm;

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

  // ── 危世 → 治世（中兴进度条） ──
  // 皇帝对直属臣属实现中央集权两个维度：辟署权 / 宗法世袭。
  // 每年只考察两条结构性条件，不考虑皇帝个人正统性或战争等瞬时事件。
  if (era === Era.WeiShi && emperorId) {
    const restoration = calcRestorationGain(emperorId);
    if (restoration > 0) stabilityProgress += restoration;
  }

  // ── 检查时代切换 ──
  // 优先级：崩溃（收束到更坏的时代）高于中兴（回暖），若同一月两个条件同时满足，
  // 衰退路径先走——这通常意味着玩家处于强外力冲击下（如战败加 +10），应按崩溃处理。
  if (collapseProgress >= 100) {
    const nextEra = era === Era.ZhiShi ? Era.WeiShi : Era.LuanShi;
    useTurnManager.getState().setEraState({
      era: nextEra,
      collapseProgress: 0,
      stabilityProgress: 0,
    });

    // 危世→乱世：自动销毁皇帝岗位
    if (nextEra === Era.LuanShi) {
      destroyEmperorPost();
    }
  } else if (era === Era.WeiShi && stabilityProgress >= 100) {
    // 危世 → 治世：镜像崩溃转换，两个进度条都清零
    useTurnManager.getState().setEraState({
      era: Era.ZhiShi,
      collapseProgress: 0,
      stabilityProgress: 0,
    });
  } else {
    useTurnManager.getState().setEraState({ collapseProgress, stabilityProgress });
  }
}

// ── 中兴进度计算（纯函数，UI/Popup 可复用作预览） ─────────────────────────────

/**
 * 返回皇帝的两条中兴条件命中情况。
 * 仅对"有地直属臣属"（overlordId === emperor && isRuler）做统计；
 * 若集合为空（realm 已塌、只剩无地京官甚至无臣属），不触发任何中兴 —— 中兴是
 * 对"名义归附但割据自治"的藩镇实现中央集权，realm 已崩的情况不适用。
 */
export function calcRestorationState(emperorId: string): {
  hasVassals: boolean;
  allNoAppointRight: boolean;
  allNoHereditary: boolean;
} {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();

  // 收集有地直属臣属
  const vassalIds = charStore.vassalIndex.get(emperorId);
  const territorialVassals = [];
  if (vassalIds) {
    for (const vid of vassalIds) {
      const v = charStore.characters.get(vid);
      if (v?.alive && v.isRuler) territorialVassals.push(v);
    }
  }

  if (territorialVassals.length === 0) {
    return { hasVassals: false, allNoAppointRight: false, allNoHereditary: false };
  }

  // 条件 A：所有有地直属臣属都没有辟署权
  let allNoAppointRight = true;
  for (const v of territorialVassals) {
    if (hasAppointRightPost(v.id, terrStore.territories)) {
      allNoAppointRight = false;
      break;
    }
  }

  // 条件 B：所有有地直属臣属都没有宗法世袭的 grantsControl 主岗
  let allNoHereditary = true;
  outer: for (const v of territorialVassals) {
    const posts = terrStore.getPostsByHolder(v.id);
    for (const p of posts) {
      const tpl = positionMap.get(p.templateId);
      if (!tpl?.grantsControl) continue;
      if (p.successionLaw === 'clan') {
        allNoHereditary = false;
        break outer;
      }
    }
  }

  return { hasVassals: true, allNoAppointRight, allNoHereditary };
}

/** 返回本月应加的中兴进度（每年 +10 / +5，月度累积 = /12）。 */
function calcRestorationGain(emperorId: string): number {
  const st = calcRestorationState(emperorId);
  if (!st.hasVassals) return 0;
  let gain = 0;
  if (st.allNoAppointRight) gain += 10 / 12;
  if (st.allNoHereditary) gain += 5 / 12;
  return gain;
}

// ── 危世→乱世：自动销毁皇帝岗位 ──────────────────────────────────────────────

function destroyEmperorPost(): void {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();

  // 找到皇帝 ID（销毁前获取）
  const emperorId = findEmperorId(terrStore.territories, terrStore.centralPosts);

  // 销毁皇帝岗位
  for (const t of terrStore.territories.values()) {
    if (t.tier === 'tianxia') {
      const ep = t.posts.find(p => p.templateId === 'pos-emperor');
      if (ep) {
        terrStore.removePost(ep.id);
      }
      break;
    }
  }

  // 解除皇帝与有地臣属的效忠关系：节度使、诸侯王独立；无地京官仍效忠皇帝本人
  if (emperorId) {
    const rulerIds = collectRulerIds(useTerritoryStore.getState().territories);
    charStore.batchMutate(chars => {
      for (const [id, c] of chars) {
        if (!c.alive || c.overlordId !== emperorId) continue;
        if (rulerIds.has(id)) {
          chars.set(id, { ...c, overlordId: undefined });
        }
      }
    });
  }

  // 所有道级和国级的 grantsControl 主岗 → 宗法继承（割据独立体制）
  // 走 executeToggleSuccession 统一入口：内部按"道为权威源"自动联动治所州主岗，
  // 不再手写 updatePost 制造道-治所州政策脱绑（CLAUDE.md `### 治所州联动` 硬约束）。
  // 注意先收集 postId 再调用，避免在迭代过程中通过 toggle 改变 territories Map。
  {
    const freshTerrStore = useTerritoryStore.getState();
    const postIdsToFlip: string[] = [];
    for (const t of freshTerrStore.territories.values()) {
      if (t.tier !== 'dao' && t.tier !== 'guo') continue;
      for (const post of t.posts) {
        const tpl = positionMap.get(post.templateId);
        if (!tpl?.grantsControl) continue;
        // 只 toggle 当前还是 bureaucratic 的（toggle 会取反）
        if (post.successionLaw === 'bureaucratic') {
          postIdsToFlip.push(post.id);
        }
      }
    }
    for (const pid of postIdsToFlip) {
      executeToggleSuccession(pid);
    }
  }

  // 新独立统治者自动获得辟署权
  const charStore2 = useCharacterStore.getState();
  for (const [id, c] of charStore2.characters) {
    if (c.alive && c.overlordId === undefined && c.isRuler) {
      ensureAppointRight(id);
    }
  }

  refreshPostCaches(undefined, true);
}
