// ===== AI 史书：人物档案（纯函数） =====
//
// 给年史 prompt 注入"本年关键人物"段，让 LLM 写"史臣注/纪传切片"时
// 基于游戏内真实数据，而不是从历史原型套用事迹。
//
// 不读任何 store。所有数据由调用方传入快照（characters / territories）。

import type { Character } from '@engine/character/types';
import type { Territory } from '@engine/territory/types';
import type { GameEvent } from '@engine/types';
import { EventPriority } from '@engine/types';
import { positionMap } from '@data/positions';
import { rankMap } from '@data/ranks';
import { traitMap } from '@data/traits';

export interface CharacterDossier {
  id: string;
  name: string;
  courtesy: string;
  clan: string;
  gender: '男' | '女';
  age: number;
  isAlive: boolean;
  isPlayer: boolean;
  /** 当前最高品级的 grantsControl 主岗（"州名+岗位名"），无则空 */
  mainPostName: string;
  /** 散官品阶名（如"正三品"），无则空 */
  rankName: string;
  /** 性格特质中文名（仅 innate + personality 类，过滤教育/事件） */
  traitNames: string[];
  /** 父名（若父在 characters 表里） */
  fatherName: string;
  /** 在世子女名列表 */
  childrenNames: string[];
}

/** 取角色当前最高品级的 grantsControl 主岗的展示名（"州名+岗位名"）。 */
function getHighestMainPostName(
  charId: string,
  territories: Map<string, Territory>,
): string {
  let bestRank = -1;
  let bestName = '';
  for (const terr of territories.values()) {
    for (const post of terr.posts) {
      if (post.holderId !== charId) continue;
      const tpl = positionMap.get(post.templateId);
      if (!tpl?.grantsControl) continue;
      if (tpl.minRank > bestRank) {
        bestRank = tpl.minRank;
        bestName = `${terr.name}${tpl.name}`;
      }
    }
  }
  return bestName;
}

export function buildCharacterDossier(
  charId: string,
  characters: Map<string, Character>,
  territories: Map<string, Territory>,
  currentYear: number,
): CharacterDossier | null {
  const c = characters.get(charId);
  if (!c) return null;

  // 年龄：在世按 currentYear，已薨按 deathYear
  const refYear = c.alive ? currentYear : (c.deathYear ?? currentYear);
  const age = Math.max(0, refYear - c.birthYear);

  const traitNames: string[] = [];
  for (const tid of c.traitIds) {
    const t = traitMap.get(tid);
    if (!t) continue;
    if (t.category !== 'innate' && t.category !== 'personality') continue;
    traitNames.push(t.name);
  }

  const father = c.family.fatherId ? characters.get(c.family.fatherId) : undefined;
  const childrenNames: string[] = [];
  for (const cid of c.family.childrenIds) {
    const child = characters.get(cid);
    if (child?.alive) childrenNames.push(child.name);
  }

  const rankLevel = c.official?.rankLevel;
  const rankName = rankLevel ? rankMap.get(rankLevel)?.name ?? '' : '';

  return {
    id: c.id,
    name: c.name,
    courtesy: c.courtesy ?? '',
    clan: c.clan ?? '',
    gender: c.gender,
    age,
    isAlive: c.alive,
    isPlayer: c.isPlayer,
    mainPostName: getHighestMainPostName(charId, territories),
    rankName,
    traitNames,
    fatherName: father?.name ?? '',
    childrenNames,
  };
}

/**
 * 选本年关键人物：按事件出场频次 + 优先级加权排序，取 top N。
 * Major 事件每次出场计 3 票，Normal/Minor 计 1 票。玩家若不在 top N，挤掉最末一名。
 */
export function selectKeyCharacters(
  events: GameEvent[],
  characters: Map<string, Character>,
  topN = 8,
): string[] {
  const score = new Map<string, number>();
  for (const e of events) {
    const weight = e.priority >= EventPriority.Major ? 3 : 1;
    for (const id of e.actors) {
      if (!characters.has(id)) continue;
      score.set(id, (score.get(id) ?? 0) + weight);
    }
  }

  const ranked = Array.from(score.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, topN);

  // 玩家始终入选：找当前 playerId（characters 里 isPlayer === true 的人）
  let playerId: string | null = null;
  for (const c of characters.values()) {
    if (c.isPlayer) { playerId = c.id; break; }
  }
  if (playerId && !ranked.includes(playerId)) {
    if (ranked.length >= topN) ranked.pop();
    ranked.push(playerId);
  }

  return ranked;
}
