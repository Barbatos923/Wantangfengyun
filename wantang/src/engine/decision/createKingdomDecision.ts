// ===== 决议：称王 / 建镇 =====

import { registerDecision } from './registry';
import type { DecisionTarget } from './types';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useTurnManager } from '@engine/TurnManager';
import { positionMap } from '@data/positions';
import { EventPriority } from '@engine/types';
import {
  canCreatePost,
  calcRealmControlRatio,
  calcPostManageCost,
} from '@engine/official/postManageCalc';
import type { Post, TerritoryTier } from '@engine/territory/types';
import { syncArmyForPost, capitalZhouSeat, refreshPostCaches, refreshLegitimacyForChar, promoteOverlordIfNeeded } from '@engine/official/postTransfer';
import { debitCapitalTreasury, getCapitalBalance } from '@engine/territory/treasuryUtils';

// ── 确定领地对应的 grantsControl 模板 ID ─────────────────────

function resolveTemplateId(tier: TerritoryTier, territoryType: string): string | null {
  if (tier === 'guo') return territoryType === 'military' ? 'pos-wang' : 'pos-xingtai-shangshu';
  if (tier === 'dao') return territoryType === 'military' ? 'pos-jiedushi' : 'pos-guancha-shi';
  return null;
}

// ── 创建配置 ─────────────────────────────────────────────────

export interface CreatePostConfig {
  /** 覆盖领地类型（military/civil），决定岗位模板 */
  territoryType?: 'military' | 'civil';
  /** 继承法，默认 clan */
  successionLaw?: 'clan' | 'bureaucratic';
  /** 辟署权，默认 true */
  hasAppointRight?: boolean;
}

// ── 执行函数（引擎层，NPC 可直接调用，guo + dao 通用） ───────

export function executeCreateKingdom(
  actorId: string,
  territoryId: string,
  config?: CreatePostConfig,
): void {
  const terrStore = useTerritoryStore.getState();
  const charStore = useCharacterStore.getState();
  const date = useTurnManager.getState().currentDate;

  const territory = terrStore.territories.get(territoryId);
  if (!territory) return;

  const effectiveType = config?.territoryType ?? territory.territoryType;
  const templateId = resolveTemplateId(territory.tier, effectiveType);
  if (!templateId) return;
  const tpl = positionMap.get(templateId);
  if (!tpl) return;

  // 扣除资源：金钱从 capital 国库扣，声望从私产扣
  const cost = calcPostManageCost('create', territory.tier);
  debitCapitalTreasury(actorId, { money: cost.money });
  charStore.addResources(actorId, { prestige: -cost.prestige });

  // 创建岗位
  const newPost: Post = {
    id: crypto.randomUUID(),
    templateId,
    territoryId,
    holderId: actorId,
    appointedBy: actorId,
    appointedDate: { year: date.year, month: date.month, day: date.day },
    successionLaw: config?.successionLaw ?? 'clan',
    hasAppointRight: config?.hasAppointRight ?? true,
  };

  terrStore.addPost(territoryId, newPost);

  // guo 级：一并创建副岗（国司马 + 国长史），holderId 空缺待铨选
  if (territory.tier === 'guo') {
    for (const subTemplateId of ['pos-guo-sima', 'pos-guo-changshi']) {
      const subPost: Post = {
        id: crypto.randomUUID(),
        templateId: subTemplateId,
        territoryId,
        holderId: null,
        successionLaw: 'bureaucratic',
        hasAppointRight: false,
      };
      useTerritoryStore.getState().addPost(territoryId, subPost);
    }
  }

  // dao 级：自动授予治所州
  if (territory.tier === 'dao') {
    capitalZhouSeat(territoryId, actorId, actorId, date);
  }

  // 军队 + 效忠链提升 + 缓存 + 正统性刷新
  syncArmyForPost(newPost.id, actorId);
  const TIER_RANK: Record<string, number> = { zhou: 1, dao: 2, guo: 3, tianxia: 4 };
  promoteOverlordIfNeeded(actorId, TIER_RANK[territory.tier] ?? 0);
  refreshPostCaches(undefined, true);
  refreshLegitimacyForChar(actorId);

  // 记录事件
  const eventType = territory.tier === 'guo' ? '称王' : '建镇';
  useTurnManager.getState().addEvent({
    id: crypto.randomUUID(),
    date: { ...date },
    type: eventType,
    actors: [actorId],
    territories: [territoryId],
    description: `${charStore.getCharacter(actorId)?.name ?? ''}在${territory.name}设${tpl.name}`,
    priority: EventPriority.Major,
  });
}

// ── 决议注册 ──────────────────────────────────────────────────

// ── 称王决议（guo 级） ───────────────────────────────────────

registerDecision({
  id: 'createKingdom',
  name: '称王',
  icon: '👑',
  description: '在控制足够法理领地的国级疆域中称王建制',

  canShow: (actorId) => {
    const terrStore = useTerritoryStore.getState();
    const characters = useCharacterStore.getState().characters;
    for (const t of terrStore.territories.values()) {
      if (t.tier === 'guo') {
        if (canCreatePost(actorId, t.id, terrStore.territories, characters).eligible) return true;
      }
    }
    return false;
  },

  canExecute: (actorId) => {
    const terrStore = useTerritoryStore.getState();
    const characters = useCharacterStore.getState().characters;
    const reasons: string[] = [];

    let anyEligible = false;
    for (const t of terrStore.territories.values()) {
      if (t.tier === 'guo' && canCreatePost(actorId, t.id, terrStore.territories, characters).eligible) {
        anyEligible = true; break;
      }
    }
    if (!anyEligible) reasons.push('无可创建岗位的国级领地');

    const actor = useCharacterStore.getState().getCharacter(actorId);
    const cost = calcPostManageCost('create', 'guo');
    const balance = getCapitalBalance(actorId);
    if (balance.money < cost.money) reasons.push(`金钱不足（需 ${cost.money}，治所国库 ${Math.floor(balance.money)}）`);
    if (actor && actor.resources.prestige < cost.prestige) reasons.push(`名望不足（需 ${cost.prestige}）`);

    return { executable: reasons.length === 0, reasons };
  },

  getTargets: (actorId) => {
    const terrStore = useTerritoryStore.getState();
    const characters = useCharacterStore.getState().characters;
    const cost = calcPostManageCost('create', 'guo');
    const targets: DecisionTarget[] = [];

    for (const t of terrStore.territories.values()) {
      if (t.tier !== 'guo') continue;
      const result = canCreatePost(actorId, t.id, terrStore.territories, characters);
      const ratio = calcRealmControlRatio(t.id, actorId, terrStore.territories, characters);
      targets.push({
        id: t.id, label: t.name,
        description: `控制 ${Math.round(ratio * 100)}% 法理领地`,
        eligible: result.eligible, reason: result.reason, cost,
      });
    }
    return targets;
  },

  execute: (actorId, targetId, config) => {
    if (!targetId) return;
    executeCreateKingdom(actorId, targetId, config as CreatePostConfig | undefined);
  },
});

// ── 建镇决议（dao 级，治所失陷后重建） ───────────────────────

registerDecision({
  id: 'createDao',
  name: '建镇',
  icon: '🏴',
  description: '在控制治所州及50%以上法理州的道中重建节度使/观察使',

  canShow: (actorId) => {
    const terrStore = useTerritoryStore.getState();
    const characters = useCharacterStore.getState().characters;
    for (const t of terrStore.territories.values()) {
      if (t.tier === 'dao') {
        if (canCreatePost(actorId, t.id, terrStore.territories, characters).eligible) return true;
      }
    }
    return false;
  },

  canExecute: (actorId) => {
    const terrStore = useTerritoryStore.getState();
    const characters = useCharacterStore.getState().characters;
    const reasons: string[] = [];

    let anyEligible = false;
    for (const t of terrStore.territories.values()) {
      if (t.tier === 'dao' && canCreatePost(actorId, t.id, terrStore.territories, characters).eligible) {
        anyEligible = true; break;
      }
    }
    if (!anyEligible) reasons.push('无可重建的道级领地');

    const actor = useCharacterStore.getState().getCharacter(actorId);
    const cost = calcPostManageCost('create', 'dao');
    const balance = getCapitalBalance(actorId);
    if (balance.money < cost.money) reasons.push(`金钱不足（需 ${cost.money}，治所国库 ${Math.floor(balance.money)}）`);
    if (actor && actor.resources.prestige < cost.prestige) reasons.push(`名望不足（需 ${cost.prestige}）`);

    return { executable: reasons.length === 0, reasons };
  },

  getTargets: (actorId) => {
    const terrStore = useTerritoryStore.getState();
    const characters = useCharacterStore.getState().characters;
    const cost = calcPostManageCost('create', 'dao');
    const targets: DecisionTarget[] = [];

    for (const t of terrStore.territories.values()) {
      if (t.tier !== 'dao') continue;
      const result = canCreatePost(actorId, t.id, terrStore.territories, characters);
      const ratio = calcRealmControlRatio(t.id, actorId, terrStore.territories, characters);
      targets.push({
        id: t.id, label: t.name,
        description: `控制 ${Math.round(ratio * 100)}% 法理领地`,
        eligible: result.eligible, reason: result.reason, cost,
      });
    }
    return targets;
  },

  execute: (actorId, targetId, config) => {
    if (!targetId) return;
    executeCreateKingdom(actorId, targetId, config as CreatePostConfig | undefined);
  },
});
