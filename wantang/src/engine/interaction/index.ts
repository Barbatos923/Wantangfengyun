// ===== 交互系统桶导出 =====

export type { Interaction, InteractionParamType } from './types';
export { registerInteraction, getAvailableInteractions } from './registry';

// 导入交互定义以触发注册
import './appointAction';
import './dismissAction';

// 导出执行函数
export { getAppointablePositions, executeAppoint } from './appointAction';
export { getDismissablePositions, executeDismiss } from './dismissAction';
