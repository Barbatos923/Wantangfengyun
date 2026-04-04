// ===== 决议系统汇总 =====

// 导入触发注册
import './createKingdomDecision';
import './createEmperorDecision';
import './destroyTitleDecision';

// 导出注册表查询
export { getAvailableDecisions, getAllDecisions, getDecision } from './registry';

// 导出类型
export type { Decision, DecisionTarget } from './types';

// 导出执行函数（供 NPC engine 直接调用）
export { executeCreateKingdom } from './createKingdomDecision';
export { executeCreateEmperor } from './createEmperorDecision';
export { executeDestroyTitle, getDestroyablePosts } from './destroyTitleDecision';
