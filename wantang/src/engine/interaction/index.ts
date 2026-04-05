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
import './revokeAction';
import './joinWarAction';
import './usurpPostAction';
import './reassignAction';

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
export { getRevokablePosts, calcRevokeChance, previewRevokeChance, executeRevoke } from './revokeAction';
export { executeJoinWar, getJoinableWars, getCallableWars, calcCallToArmsChance, executeCallToArms } from './joinWarAction';
export type { JoinableWar, CallableWar, CallToArmsChanceResult, CallToArmsResult } from './joinWarAction';
export { getUsurpablePosts, previewUsurp, executeUsurp } from './usurpPostAction';
export type { UsurpPreview } from './usurpPostAction';
export { previewReassignChance, executeReassign, submitReassignProposal } from './reassignAction';
export type { ReassignProposalResult } from './reassignAction';
export {
  isCentralOfficial,
  getTerritorialCandidates,
  getCentralCandidates,
} from '@engine/official/reassignCalc';
export type { ReassignCandidate } from '@engine/official/reassignCalc';
