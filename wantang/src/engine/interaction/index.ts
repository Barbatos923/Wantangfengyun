// ===== 交互系统桶导出 =====

export type { Interaction, InteractionParamType, InteractionEntry } from './types';
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
import './demandRightsAction';
import './negotiateTaxAction';
import './pledgeAllegianceAction';

// 导出执行函数
export { getAppointablePosts, getAppointableVacantPosts, executeAppoint, refreshPlayerLedger } from './appointAction';
export { getDismissablePosts, executeDismiss } from './dismissAction';
export { executeDemandFealty, previewDemandFealty, calcFealtyChance, canDemandFealtyPure, DEMAND_FEALTY_COOLDOWN_DAYS } from './demandFealtyAction';
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
export { previewReassignChance, executeReassign, executeReassignSuccess, executeReassignRebel, submitReassignProposal } from './reassignAction';
export type { ReassignProposalResult } from './reassignAction';
export {
  isCentralOfficial,
  getTerritorialCandidates,
  getCentralCandidates,
} from '@engine/official/reassignCalc';
export type { ReassignCandidate } from '@engine/official/reassignCalc';
export {
  getDemandablePosts,
  getDemandablePostsFromCtx,
  canDemandRightsPure,
  calcDemandRightsChance,
  previewDemandRights,
  executeDemandRights,
  DEMAND_RIGHTS_COOLDOWN_DAYS,
} from './demandRightsAction';
export type { DemandableRight, DemandablePost, DemandRightsChanceResult, DemandRightsResult } from './demandRightsAction';
export {
  canNegotiateTaxPure,
  calcNegotiateTaxChance,
  previewNegotiateTax,
  executeNegotiateTax,
  NEGOTIATE_TAX_COOLDOWN_DAYS,
  TAX_LABELS,
} from './negotiateTaxAction';
export type { NegotiateTaxChanceResult, NegotiateTaxResult } from './negotiateTaxAction';
export {
  canPledgeAllegiancePure,
  calcPledgeAllegianceChance,
  previewPledgeAllegiance,
  executePledgeAllegiance,
  PLEDGE_ALLEGIANCE_COOLDOWN_DAYS,
} from './pledgeAllegianceAction';
export type { PledgeAllegianceChanceResult, PledgeAllegianceResult } from './pledgeAllegianceAction';
export { canTransferTreasury, executeTransferTreasury } from './treasuryTransferAction';
export { submitTreasuryDraftAction } from './submitTreasuryDraftAction';
export { submitDeployDraftAction } from './submitDeployDraftAction';
