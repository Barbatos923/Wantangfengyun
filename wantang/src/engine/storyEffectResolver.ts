// ===== StoryEvent 效果解析器 =====
//
// 读档后 onSelect 闭包丢失，EventModal 通过 effectKey + effectData 走本模块重建回调。
// 每个 effectKey 在执行前做状态校验（角色存活/岗位存在/战争有效），不合法时安全跳过。

import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { executeTaxChange, executeToggleAppointRight, executeToggleSuccession, executeToggleType, executeRedistributionChange } from '@engine/interaction/centralizationAction';
import { executeDismiss } from '@engine/interaction/dismissAction';
import { executeDeclareWar } from '@engine/interaction/declareWarAction';
import { settleWar } from '@engine/military/warSettlement';
import { executeReassign, executeReassignSuccess, executeReassignRebel } from '@engine/interaction/reassignAction';

// ── effectData 类型约定 ─────────────────────────────────────

interface DemandFealtyData { targetId: string; actorId: string }
interface DemandRightsGrantData { postId: string; right: 'appointRight' | 'succession'; capitalZhouId: string; actorId: string; targetId: string }
interface DemandRightsRefuseData { actorId: string; targetId: string }
interface RevokeAcceptData { postId: string; actorId: string }
interface RevokeRebelData { targetId: string; actorId: string }
interface NegotiateWarData { warId: string }
interface NegotiateTaxData { actorId: string; targetId: string; delta: number }
interface AdjustPostData { postId: string }
interface AdjustRebelData { vassalId: string; actorId: string }
interface AdjustTypeAcceptData { postId: string; territoryId: string }
interface AdjustSuccessionAcceptData { postId: string; capitalZhouId: string }
interface AdjustTaxAckData { vassalId: string; actorId: string; delta: number }
interface AdjustRedistributionAckData { actorId: string; delta: number }
interface ReassignServeData { territorialPostId: string; replacementId: string; emperorId: string }
interface ReassignRebelData { playerId: string; emperorId: string }
interface ReassignProposalData { territorialPostId: string; replacementId: string; emperorId: string }

// ── 校验辅助 ─────────────────────────────────────────────────

function isAlive(charId: string): boolean {
  const c = useCharacterStore.getState().characters.get(charId);
  return !!c && c.alive;
}

function postExists(postId: string): boolean {
  return !!useTerritoryStore.getState().findPost(postId);
}

function warActive(warId: string): boolean {
  const w = useWarStore.getState().wars.get(warId);
  return !!w && w.status === 'active';
}

// ── 主入口 ───────────────────────────────────────────────────

export function resolveStoryEffect(effectKey: string, effectData: Record<string, unknown>): void {
  // noop:notification — 纯通知事件，无需执行任何逻辑
  if (effectKey === 'noop:notification') return;

  switch (effectKey) {

    // ── 要求效忠 ──
    case 'demandFealty:accept': {
      const d = effectData as unknown as DemandFealtyData;
      if (!isAlive(d.targetId) || !isAlive(d.actorId)) return;
      const charStore = useCharacterStore.getState();
      charStore.updateCharacter(d.targetId, { overlordId: d.actorId });
      charStore.addOpinion(d.targetId, d.actorId, { reason: '要求效忠', value: -10, decayable: true });
      break;
    }
    case 'demandFealty:reject': {
      const d = effectData as unknown as DemandFealtyData;
      if (!isAlive(d.targetId) || !isAlive(d.actorId)) return;
      useCharacterStore.getState().addOpinion(d.targetId, d.actorId, { reason: '拒绝效忠', value: -15, decayable: true });
      break;
    }

    // ── 逼迫授权 ──
    case 'demandRights:grant': {
      const d = effectData as unknown as DemandRightsGrantData;
      if (!isAlive(d.actorId) || !postExists(d.postId)) return;
      if (d.right === 'appointRight') {
        executeToggleAppointRight(d.postId);
      } else {
        const territories = useTerritoryStore.getState().territories;
        executeToggleSuccession(d.postId, d.capitalZhouId, territories);
      }
      useCharacterStore.getState().addOpinion(d.actorId, d.targetId, { reason: '授权感激', value: 5, decayable: true });
      break;
    }
    case 'demandRights:refuse': {
      const d = effectData as unknown as DemandRightsRefuseData;
      if (!isAlive(d.actorId)) return;
      useCharacterStore.getState().addOpinion(d.actorId, d.targetId, { reason: '拒绝授权', value: -25, decayable: true });
      break;
    }

    // ── 领地被剥夺 ──
    case 'revoke:accept': {
      const d = effectData as unknown as RevokeAcceptData;
      if (!postExists(d.postId) || !isAlive(d.actorId)) return;
      executeDismiss(d.postId, d.actorId);
      break;
    }
    case 'revoke:rebel': {
      const d = effectData as unknown as RevokeRebelData;
      if (!isAlive(d.targetId) || !isAlive(d.actorId)) return;
      const date = useTurnManager.getState().currentDate;
      useCharacterStore.getState().addOpinion(d.targetId, d.actorId, { reason: '强行剥夺领地', value: -30, decayable: true });
      executeDeclareWar(d.targetId, d.actorId, 'independence', [], date, { prestige: 0, legitimacy: 0 });
      break;
    }

    // ── 和谈 ──
    case 'negotiateWar:accept': {
      const d = effectData as unknown as NegotiateWarData;
      if (!warActive(d.warId)) return;
      settleWar(d.warId, 'whitePeace');
      break;
    }
    case 'negotiateWar:reject':
      break; // 拒绝和谈无效果

    // ── 议定进奉 ──
    case 'negotiateTax:accept': {
      const d = effectData as unknown as NegotiateTaxData;
      if (!isAlive(d.actorId) || !isAlive(d.targetId)) return;
      executeTaxChange(d.actorId, d.targetId, d.delta);
      useCharacterStore.getState().addOpinion(d.actorId, d.targetId, { reason: '议定进奉', value: 5, decayable: true });
      break;
    }
    case 'negotiateTax:reject': {
      const d = effectData as unknown as NegotiateTaxData;
      if (!isAlive(d.actorId) || !isAlive(d.targetId)) return;
      useCharacterStore.getState().addOpinion(d.actorId, d.targetId, { reason: '拒绝调税', value: -15, decayable: true });
      break;
    }

    // ── 辟署权变更 ──
    case 'adjustAppointRight:accept': {
      const d = effectData as unknown as AdjustPostData;
      if (!postExists(d.postId)) return;
      executeToggleAppointRight(d.postId);
      break;
    }
    case 'adjustAppointRight:rebel': {
      const d = effectData as unknown as AdjustRebelData;
      if (!isAlive(d.vassalId) || !isAlive(d.actorId)) return;
      const date = useTurnManager.getState().currentDate;
      useCharacterStore.getState().addOpinion(d.vassalId, d.actorId, { reason: '强改辟署权', value: -30, decayable: true });
      executeDeclareWar(d.vassalId, d.actorId, 'independence', [], date, { prestige: 0, legitimacy: 0 });
      break;
    }

    // ── 职类调整 ──
    case 'adjustType:accept': {
      const d = effectData as unknown as AdjustTypeAcceptData;
      if (!postExists(d.postId)) return;
      executeToggleType(d.postId, d.territoryId);
      break;
    }
    case 'adjustType:rebel': {
      const d = effectData as unknown as AdjustRebelData;
      if (!isAlive(d.vassalId) || !isAlive(d.actorId)) return;
      const date = useTurnManager.getState().currentDate;
      useCharacterStore.getState().addOpinion(d.vassalId, d.actorId, { reason: '强改职类', value: -30, decayable: true });
      executeDeclareWar(d.vassalId, d.actorId, 'independence', [], date, { prestige: 0, legitimacy: 0 });
      break;
    }

    // ── 继承法变更 ──
    case 'adjustSuccession:accept': {
      const d = effectData as unknown as AdjustSuccessionAcceptData;
      if (!postExists(d.postId)) return;
      const territories = useTerritoryStore.getState().territories;
      executeToggleSuccession(d.postId, d.capitalZhouId, territories);
      break;
    }
    case 'adjustSuccession:rebel': {
      const d = effectData as unknown as AdjustRebelData;
      if (!isAlive(d.vassalId) || !isAlive(d.actorId)) return;
      const date = useTurnManager.getState().currentDate;
      useCharacterStore.getState().addOpinion(d.vassalId, d.actorId, { reason: '强改继承法', value: -30, decayable: true });
      executeDeclareWar(d.vassalId, d.actorId, 'independence', [], date, { prestige: 0, legitimacy: 0 });
      break;
    }

    // ── 赋税调整（通知+执行） ──
    case 'adjustTax:acknowledge': {
      const d = effectData as unknown as AdjustTaxAckData;
      if (!isAlive(d.vassalId) || !isAlive(d.actorId)) return;
      executeTaxChange(d.vassalId, d.actorId, d.delta);
      break;
    }

    // ── 回拨率调整（通知+执行） ──
    case 'adjustRedistribution:acknowledge': {
      const d = effectData as unknown as AdjustRedistributionAckData;
      if (!isAlive(d.actorId)) return;
      executeRedistributionChange(d.actorId, d.delta);
      break;
    }

    // ── 调任：服从 ──
    case 'reassign:serve': {
      const d = effectData as unknown as ReassignServeData;
      if (!isAlive(d.replacementId) || !isAlive(d.emperorId) || !postExists(d.territorialPostId)) return;
      executeReassignSuccess(d.territorialPostId, d.replacementId, d.emperorId);
      break;
    }
    // ── 调任：抗命 ──
    case 'reassign:rebel': {
      const d = effectData as unknown as ReassignRebelData;
      if (!isAlive(d.playerId) || !isAlive(d.emperorId)) return;
      executeReassignRebel(d.playerId, d.emperorId);
      break;
    }

    // ── 宰相提案：批准 ──
    case 'reassignProposal:approve': {
      const d = effectData as unknown as ReassignProposalData;
      if (!isAlive(d.replacementId) || !isAlive(d.emperorId) || !postExists(d.territorialPostId)) return;
      executeReassign(d.territorialPostId, d.replacementId, d.emperorId);
      break;
    }
    case 'reassignProposal:reject':
      break; // 驳回无效果

    default:
      console.warn(`[storyEffectResolver] 未知 effectKey: ${effectKey}`);
  }
}
