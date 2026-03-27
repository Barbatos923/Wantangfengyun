// ===== "调整集权"交互 =====

import { registerInteraction } from './registry';

/** 注册集权调整交互 */
registerInteraction({
  id: 'centralization',
  name: '调整权责',
  icon: '⚖️',
  canShow: (_player, target) => {
    // target 必须直接效忠于 player
    return target.overlordId === _player.id;
  },
  paramType: 'centralization',
});
