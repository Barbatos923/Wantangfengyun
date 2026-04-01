// ===== 交互系统桶导出 =====

export type { Interaction, InteractionParamType } from './types';
export { registerInteraction, getAvailableInteractions } from './registry';

// 导入交互定义以触发注册（宣战优先显示）
import './declareWarAction';
import './appointAction';
import './dismissAction';
import './centralizationAction';
import './demandFealtyAction';
import './transferVassalAction';

// 导出执行函数
export { getAppointablePosts, getAppointableVacantPosts, executeAppoint, refreshPlayerLedger } from './appointAction';
export { getDismissablePosts, executeDismiss } from './dismissAction';
export { executeDemandFealty, previewDemandFealty, calcFealtyChance, canDemandFealtyPure } from './demandFealtyAction';
export type { DemandFealtyResult, FealtyChanceResult } from './demandFealtyAction';
export { getTransferCandidates, executeTransferVassal } from './transferVassalAction';
export type { TransferCandidate } from './transferVassalAction';
export {
  executeTaxChange,
  executeToggleType,
  executeToggleSuccession,
  executeToggleAppointRight,
  executeRedistributionChange,
  executeDesignateHeir,
} from './centralizationAction';
export { executeDeclareWar } from './declareWarAction';
export { executeBuild } from './buildAction';
