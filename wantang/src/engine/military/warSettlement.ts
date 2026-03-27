// ===== 战争结算（结束战争时调用） =====

import { useWarStore } from './WarStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { positionMap } from '@data/positions';
import type { War } from './types';

/**
 * 结束战争并结算领地归属。
 *
 * - 攻方胜/强制投降：目标领地正式转移给胜者，非目标占领归还
 * - 和谈(whitePeace)：所有占领归还
 * - 防守方胜：所有占领归还
 */
export function settleWar(warId: string, result: War['result']): void {
  const warStore = useWarStore.getState();
  const terrStore = useTerritoryStore.getState();
  const war = warStore.wars.get(warId);
  if (!war) return;

  const winnerId = result === 'attackerWin' ? war.attackerId
    : result === 'defenderWin' ? war.defenderId
    : null;

  const territories = terrStore.territories;

  // 遍历所有被占领的州
  for (const terr of territories.values()) {
    if (!terr.occupiedBy) continue;
    // 只处理与这场战争相关的占领（占领者是战争参与方）
    if (terr.occupiedBy !== war.attackerId && terr.occupiedBy !== war.defenderId) continue;

    const isTarget = war.targetTerritoryIds.includes(terr.id);
    const shouldTransfer = winnerId && isTarget && terr.occupiedBy === winnerId;

    if (shouldTransfer) {
      // 目标领地正式转移：更新岗位 holderId
      const mainPost = terr.posts.find((p) => {
        const tpl = positionMap.get(p.templateId);
        return tpl?.grantsControl === true;
      });
      if (mainPost) {
        terrStore.updatePost(mainPost.id, {
          holderId: winnerId,
          appointedBy: winnerId,
        });
      }
    }

    // 清除占领状态
    terrStore.updateTerritory(terr.id, { occupiedBy: undefined });
  }

  // 结束战争
  warStore.endWar(warId, result);

  // 解散该战争下的所有行营
  for (const campaign of warStore.campaigns.values()) {
    if (campaign.warId === warId) {
      warStore.disbandCampaign(campaign.id);
    }
  }
}
