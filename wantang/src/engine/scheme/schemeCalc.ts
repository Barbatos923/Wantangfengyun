// ===== 计谋系统通用纯函数 =====
//
// 所有函数均为纯函数，不读 store。供 SchemeTypeDef 内部、UI 预览、测试共用。

import type { Character } from '@engine/character/types';
import type { SchemeContext } from './types';

// ── 通用工具 ──────────────────────────────────────────

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── 并发上限 ──────────────────────────────────────────

/**
 * 计谋并发上限。
 * v1 直接用 initiator 的 strategy（v1.1 引入谋主时再换成 spymaster.strategy）。
 */
export function calcSchemeLimit(initiatorStrategy: number): number {
  return Math.max(1, Math.floor(initiatorStrategy / 8));
}

// ── 模糊成功率（UI 显示） ──────────────────────────────

export type FuzzySuccess =
  | { kind: 'exact'; value: number }
  | { kind: 'tier'; tier: '高' | '中' | '低' }
  | { kind: 'rough'; tier: '偏高' | '偏低' }
  | { kind: 'unknown' };

/**
 * 按观察者与目标的策力差，返回不同精度的成功率展示。
 * 谋略差越大，玩家看到越精确（"知己知彼"）。
 */
export function getFuzzySuccess(
  observerStrategy: number,
  targetStrategy: number,
  trueRate: number,
): FuzzySuccess {
  const diff = observerStrategy - targetStrategy;
  if (diff >= 12) return { kind: 'exact', value: Math.round(trueRate) };
  if (diff >= 6) {
    if (trueRate >= 70) return { kind: 'tier', tier: '高' };
    if (trueRate >= 40) return { kind: 'tier', tier: '中' };
    return { kind: 'tier', tier: '低' };
  }
  if (diff >= 0) return { kind: 'rough', tier: trueRate >= 50 ? '偏高' : '偏低' };
  return { kind: 'unknown' };
}

// ── 关系判定（离间次要目标候选集用） ────────────────────

/**
 * 找到角色的"势力根"——一直沿 overlordId 向上走直到无 overlord。
 * 防御循环引用：最多走 32 步。
 */
export function findRealmRoot(
  charId: string,
  characters: Map<string, Character>,
): string {
  let current = charId;
  for (let i = 0; i < 32; i++) {
    const c = characters.get(current);
    if (!c || !c.overlordId) return current;
    if (c.overlordId === current) return current; // self-loop guard
    current = c.overlordId;
  }
  return current;
}

/** 两人是否同属一个势力（共同势力根） */
export function sameRealmRoot(
  a: Character,
  b: Character,
  characters: Map<string, Character>,
): boolean {
  return findRealmRoot(a.id, characters) === findRealmRoot(b.id, characters);
}

/**
 * 两人之间是否存在"可离间的关系"。
 * 用于离间次要目标候选集过滤——必须有某种关系才能挑拨。
 *
 * 包括：领主-臣属 / 直系亲属（父子/夫妻/子女）/ 同势力同僚 / 同盟。
 */
export function hasRelationship(
  a: Character,
  b: Character,
  ctx: SchemeContext,
): boolean {
  if (a.id === b.id) return false;
  // 领主-臣属
  if (a.overlordId === b.id || b.overlordId === a.id) return true;
  // 父子
  if (a.family.fatherId === b.id || b.family.fatherId === a.id) return true;
  if (a.family.motherId === b.id || b.family.motherId === a.id) return true;
  // 夫妻
  if (a.family.spouseId === b.id || b.family.spouseId === a.id) return true;
  // 子女
  if (a.family.childrenIds.includes(b.id) || b.family.childrenIds.includes(a.id)) return true;
  // 同势力同僚
  if (sameRealmRoot(a, b, ctx.characters)) return true;
  // 同盟
  if (ctx.hasAlliance(a.id, b.id)) return true;
  return false;
}
