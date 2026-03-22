// ===== 交互系统桶导出 =====

export type { Interaction, InteractionParamType } from './types';
export { registerInteraction, getAvailableInteractions } from './registry';

// 导入交互定义以触发注册
import './appointAction';
import './dismissAction';
import './centralizationAction';

// 导出执行函数
export { getAppointableVacantPosts, executeAppoint, refreshPlayerLedger } from './appointAction';
export { getDismissablePosts, executeDismiss } from './dismissAction';
