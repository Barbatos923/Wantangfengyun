// ===== 决议：称帝 =====

import { registerDecision } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { Era, EventPriority } from '@engine/types';
import { collectRulerIds, findEmperorId } from '@engine/official/postQueries';
import { canCreateEmperor, calcPostManageCost } from '@engine/official/postManageCalc';
import type { Post } from '@engine/territory/types';

// ── 执行函数（引擎层，NPC 可直接调用） ───────────────────────

export function executeCreateEmperor(actorId: string): void {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;

  // 找到 tianxia 领地
  let tianxiaId: string | undefined;
  for (const t of terrStore.territories.values()) {
    if (t.tier === 'tianxia') { tianxiaId = t.id; break; }
  }
  if (!tianxiaId) return;

  // 扣除资源
  const cost = calcPostManageCost('createEmperor', 'tianxia');
  charStore.addResources(actorId, { money: -cost.money, prestige: -cost.prestige });

  // 创建皇帝岗位
  const newPost: Post = {
    id: crypto.randomUUID(),
    templateId: 'pos-emperor',
    territoryId: tianxiaId,
    holderId: actorId,
    appointedBy: actorId,
    appointedDate: { year: date.year, month: date.month, day: date.day },
    successionLaw: 'clan',
    hasAppointRight: true,
  };

  terrStore.addPost(tianxiaId, newPost);

  // 触发时代切换：乱世 → 治世
  useTurnManager.getState().setEraState({
    era: Era.ZhiShi,
    collapseProgress: 0,
    stabilityProgress: 0,
  });

  // 配套三连
  useMilitaryStore.getState().syncArmyOwnersByPost(newPost.id, actorId);
  charStore.refreshIsRuler(collectRulerIds(useTerritoryStore.getState().territories));
  useTerritoryStore.getState().refreshExpectedLegitimacy();

  // 记录事件
  useTurnManager.getState().addEvent({
    id: crypto.randomUUID(),
    date: { ...date },
    type: '称帝',
    actors: [actorId],
    territories: [tianxiaId],
    description: `${charStore.getCharacter(actorId)?.name ?? ''}称帝，天下归一，乱世终结`,
    priority: EventPriority.Major,
  });
}

// ── 决议注册 ──────────────────────────────────────────────────

registerDecision({
  id: 'createEmperor',
  name: '称帝',
  icon: '🐉',
  description: '一统天下，登基称帝，终结乱世',

  canShow: (_actorId) => {
    const era = useTurnManager.getState().era;
    if (era !== Era.LuanShi) return false;
    const terrStore = useTerritoryStore.getState();
    const emperorId = findEmperorId(terrStore.territories, terrStore.centralPosts);
    return !emperorId;
  },

  canExecute: (actorId) => {
    const terrStore = useTerritoryStore.getState();
    const characters = useCharacterStore.getState().characters;
    const era = useTurnManager.getState().era;
    const reasons: string[] = [];

    const result = canCreateEmperor(actorId, terrStore.territories, characters, era);
    if (!result.eligible && result.reason) reasons.push(result.reason);

    const actor = useCharacterStore.getState().getCharacter(actorId);
    const cost = calcPostManageCost('createEmperor', 'tianxia');
    if (actor && actor.resources.money < cost.money) reasons.push(`金钱不足（需 ${cost.money}）`);
    if (actor && actor.resources.prestige < cost.prestige) reasons.push(`名望不足（需 ${cost.prestige}）`);

    return { executable: reasons.length === 0, reasons };
  },

  execute: (actorId) => {
    executeCreateEmperor(actorId);
  },
});
