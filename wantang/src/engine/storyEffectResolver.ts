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
import { ALLIANCE_BETRAYAL_PENALTY, ALLIANCE_BETRAYAL_OPINION, MAX_ALLIANCES_PER_RULER } from '@engine/military/types';
import { canEnterAlliance } from '@engine/interaction/proposeAllianceAction';
import { applyAllianceDilemmaOutcome } from '@engine/military/allianceAutoJoin';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { toAbsoluteDay } from '@engine/dateUtils';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { EventPriority } from '@engine/types';
import { useNpcStore } from '@engine/npc/NpcStore';

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
interface ReassignProposalData { territorialPostId: string; replacementId: string; emperorId: string; expectedTerritorialId: string }
interface AllianceAutoJoinAcceptData { warId: string; side: 'attacker' | 'defender'; allyId: string; summonerId: string; severOverlordId: string | null }
interface AllianceAutoJoinRejectData { warId: string; allyId: string; summonerId: string }
interface ProposeAllianceData { proposerId: string; targetId: string }
interface AllianceDilemmaData { warId: string; allyId: string; attackerId: string; defenderId: string }

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
        executeToggleSuccession(d.postId);
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
      executeToggleType(d.postId);
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
      executeToggleSuccession(d.postId);
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
      executeReassign(d.territorialPostId, d.replacementId, d.emperorId, d.expectedTerritorialId);
      break;
    }
    case 'reassignProposal:reject':
      break; // 驳回无效果

    // ── 同盟自动参战：接受 ──
    case 'allianceAutoJoin:accept': {
      const d = effectData as unknown as AllianceAutoJoinAcceptData;
      if (!warActive(d.warId) || !isAlive(d.allyId) || !isAlive(d.summonerId)) return;
      const war = useWarStore.getState().wars.get(d.warId)!;
      // 已经在这场战争中（可能通过 callToArms 先加入过）→ 无需重复
      if (isWarParticipant(d.allyId, war)) return;
      // 同盟已不存在（过期/主动解约/死亡清理等）→ 契约消灭，不能靠过期召唤免费入战
      // 与 reject 分支对称校验
      const currentDayAccept = toAbsoluteDay(useTurnManager.getState().currentDate);
      if (!useWarStore.getState().hasAlliance(d.allyId, d.summonerId, currentDayAccept)) return;
      const cs = useCharacterStore.getState();
      const ally = cs.getCharacter(d.allyId);
      if (!ally) return;

      // 反戈：先切断臣属关系（仅在 severOverlordId 仍然是当前 overlord 且对方正是敌方领袖时）
      if (d.severOverlordId && ally.overlordId === d.severOverlordId) {
        // 重新校验：该"领主"是否仍是本战争的对方领袖
        const enemyLeaderId = d.side === 'attacker' ? war.defenderId : war.attackerId;
        if (d.severOverlordId === enemyLeaderId) {
          const overlordName = cs.getCharacter(d.severOverlordId)?.name ?? '?';
          cs.updateCharacter(d.allyId, { overlordId: undefined });
          emitChronicleEvent({
            type: '同盟反戈',
            actors: [d.allyId, d.severOverlordId, d.summonerId],
            territories: [],
            description: `${ally.name}为履行盟约，叛离${overlordName}，起兵助盟友`,
            priority: EventPriority.Major,
          });
        }
      }

      useWarStore.getState().addParticipant(d.warId, d.allyId, d.side);
      const allyName = cs.getCharacter(d.allyId)?.name ?? '?';
      const summonerName = cs.getCharacter(d.summonerId)?.name ?? '?';
      emitChronicleEvent({
        type: '同盟参战',
        actors: [d.allyId, d.summonerId],
        territories: [],
        description: `${allyName}依盟约加入${summonerName}的战争`,
        priority: EventPriority.Major,
      });
      break;
    }
    // ── 同盟自动参战：拒绝 = 背盟 ──
    case 'allianceAutoJoin:reject': {
      const d = effectData as unknown as AllianceAutoJoinRejectData;
      if (!isAlive(d.allyId) || !isAlive(d.summonerId)) return;
      const cs = useCharacterStore.getState();
      const warStore = useWarStore.getState();
      // 同盟已不存在（对方已解除 / 过期）→ 无罚退出
      const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
      if (!warStore.hasAlliance(d.allyId, d.summonerId, currentDay)) return;
      // 背盟：扣资源 + 终止同盟 + 双向好感 + emit
      cs.addResources(d.allyId, ALLIANCE_BETRAYAL_PENALTY);
      warStore.breakAllianceBetween(d.allyId, d.summonerId);
      cs.addOpinion(d.summonerId, d.allyId, { reason: '背盟拒援', value: ALLIANCE_BETRAYAL_OPINION, decayable: true });
      cs.addOpinion(d.allyId, d.summonerId, { reason: '背盟拒援', value: -50, decayable: true });
      const allyName = cs.getCharacter(d.allyId)?.name ?? '?';
      const summonerName = cs.getCharacter(d.summonerId)?.name ?? '?';
      emitChronicleEvent({
        type: '背盟拒援',
        actors: [d.allyId, d.summonerId],
        territories: [],
        description: `${allyName}拒不履约，背弃与${summonerName}的盟约`,
        priority: EventPriority.Major,
      });
      break;
    }

    // ── 两盟相绞：玩家三选一 ──
    case 'allianceDilemma:pickAttacker':
    case 'allianceDilemma:pickDefender':
    case 'allianceDilemma:neutral': {
      const d = effectData as unknown as AllianceDilemmaData;
      if (!warActive(d.warId) || !isAlive(d.allyId)) return;
      const war = useWarStore.getState().wars.get(d.warId)!;
      // 校验两份同盟都仍存在（若其中一方已经过期/解约，冲突已消失 → 自然不适用本分支）
      const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
      const ws = useWarStore.getState();
      const hasAttAl = ws.hasAlliance(d.allyId, d.attackerId, currentDay);
      const hasDefAl = ws.hasAlliance(d.allyId, d.defenderId, currentDay);
      if (!hasAttAl || !hasDefAl) return;
      // 已在战争中（反复推送保护） → 跳过
      if (isWarParticipant(d.allyId, war)) return;
      const outcome = effectKey === 'allianceDilemma:pickAttacker' ? 'attacker'
                    : effectKey === 'allianceDilemma:pickDefender' ? 'defender'
                    : 'neutral';
      applyAllianceDilemmaOutcome(war, d.allyId, outcome);
      break;
    }

    // ── NPC 提议结盟：玩家接受 ──
    case 'proposeAlliance:accept': {
      const d = effectData as unknown as ProposeAllianceData;
      if (!isAlive(d.proposerId) || !isAlive(d.targetId)) return;
      const cs = useCharacterStore.getState();
      const warStore = useWarStore.getState();
      const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
      // stale 校验：双方已有同盟 / 双方有活跃战争 / 任一方同盟数已满
      if (warStore.hasAlliance(d.proposerId, d.targetId, currentDay)) return;
      for (const w of warStore.getActiveWars()) {
        if (isWarParticipant(d.proposerId, w) && isWarParticipant(d.targetId, w)) return;
      }
      if (warStore.getAllies(d.proposerId, currentDay).length >= MAX_ALLIANCES_PER_RULER) return;
      if (warStore.getAllies(d.targetId, currentDay).length >= MAX_ALLIANCES_PER_RULER) return;
      // 双方仍具有缔盟资格（独立 ruler 或 有辟署权的 ruler）
      const proposer = cs.getCharacter(d.proposerId);
      const target = cs.getCharacter(d.targetId);
      if (!proposer || !target) return;
      const ts = useTerritoryStore.getState();
      if (!canEnterAlliance(proposer, ts.territories)) return;
      if (!canEnterAlliance(target, ts.territories)) return;
      // 同一效忠链禁止
      if (proposer.overlordId === d.targetId || target.overlordId === d.proposerId) return;
      // 创建同盟 + 双向好感 + 史书
      warStore.createAlliance(d.proposerId, d.targetId, currentDay);
      cs.addOpinion(d.proposerId, d.targetId, { reason: '缔结同盟', value: 30, decayable: true });
      cs.addOpinion(d.targetId, d.proposerId, { reason: '缔结同盟', value: 30, decayable: true });
      emitChronicleEvent({
        type: '缔结同盟',
        actors: [d.proposerId, d.targetId],
        territories: [],
        description: `${proposer.name}与${target.name}缔结盟约，约定共御外敌（三年）`,
        priority: EventPriority.Major,
      });
      break;
    }
    // ── NPC 提议结盟：玩家拒绝 ──
    case 'proposeAlliance:reject': {
      const d = effectData as unknown as ProposeAllianceData;
      if (!isAlive(d.proposerId) || !isAlive(d.targetId)) return;
      const cs = useCharacterStore.getState();
      // 轻微外交摩擦 + 写入提议方的拒绝冷却（从提议方看，被 target 拒绝）
      cs.addOpinion(d.proposerId, d.targetId, { reason: '拒绝结盟', value: -10, decayable: true });
      cs.addOpinion(d.targetId, d.proposerId, { reason: '拒绝结盟', value: -5, decayable: true });
      const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
      useNpcStore.getState().setAllianceRejectCooldown(d.proposerId, d.targetId, currentDay);
      break;
    }

    default:
      console.warn(`[storyEffectResolver] 未知 effectKey: ${effectKey}`);
  }
}
