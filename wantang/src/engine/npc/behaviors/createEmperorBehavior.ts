// ===== NPC 行为：称帝 =====

import type { Character } from '@engine/character/types';
import type { NpcBehavior, NpcContext, BehaviorTaskResult } from '../types';
import { registerBehavior } from './index';
import { canCreateEmperor } from '@engine/official/postManageCalc';
import { executeCreateEmperor } from '@engine/decision';

interface CreateEmperorData {
  ratio: number;
}

export const createEmperorBehavior: NpcBehavior<CreateEmperorData> = {
  id: 'createEmperor',
  playerMode: 'skip',

  generateTask(actor: Character, ctx: NpcContext): BehaviorTaskResult<CreateEmperorData> | null {
    if (!actor.isRuler) return null;

    const result = canCreateEmperor(actor.id, ctx.territories, ctx.characters, ctx.era);
    if (!result.eligible) return null;

    // 资源检查（金钱看 capital 国库，声望看私产）
    const capMoney = ctx.capitalTreasury.get(actor.id)?.money ?? actor.resources.money;
    if (capMoney < 1_000_000 || actor.resources.prestige < 500) return null;

    // 满足称帝条件 → 高权重，几乎必然执行
    return { data: { ratio: 0.8 }, weight: 100 };
  },

  executeAsNpc(actor: Character, _data: CreateEmperorData, _ctx: NpcContext) {
    executeCreateEmperor(actor.id);
  },
};

registerBehavior(createEmperorBehavior);
