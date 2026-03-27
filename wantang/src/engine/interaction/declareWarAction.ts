// ===== "宣战"交互 =====

import { registerInteraction } from './registry';

registerInteraction({
  id: 'declareWar',
  name: '宣战',
  icon: '⚔',
  canShow: (_player, target) => {
    // 对所有统治者都显示宣战按钮（禁用原因在面板中说明）
    return target.isRuler;
  },
  paramType: 'declareWar',
});
