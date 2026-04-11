// ===== "提议结盟"交互 — 玩家主动向另一位独立统治者提议缔结同盟 =====
//
// 规则：
// - 双方都是独立统治者（overlordId == null）
// - 双方之间无现存同盟、无活跃战争
// - 双方同盟数量均 < MAX_ALLIANCES_PER_RULER
// - 提议方上次被此 target 拒绝未过冷却则不可再提
//
// 成功率：基础 20 + 好感 + 共同敌人 + 地缘 + 实力差 + 人格 + 劣势战争（受邀方）
// 范围 [5, 95]

import type { Territory } from '@engine/territory/types';
import type { War } from '@engine/military/types';
import type { Personality } from '@data/traits';
import { registerInteraction } from './registry';
import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useTurnManager } from '@engine/TurnManager';
import { useNpcStore } from '@engine/npc/NpcStore';
import { toAbsoluteDay } from '@engine/dateUtils';
import { calcPersonality } from '@engine/character/personalityUtils';
import { calculateBaseOpinion } from '@engine/character/characterUtils';
import { getSovereigntyTier } from '@engine/official/postQueries';
import { random } from '@engine/random';
import { buildZhouAdjacency } from '@engine/military/deployCalc';
import { emitChronicleEvent } from '@engine/chronicle/emitChronicleEvent';
import { EventPriority } from '@engine/types';
import { debugLog } from '@engine/debugLog';
import { MAX_ALLIANCES_PER_RULER } from '@engine/military/types';
import { isWarParticipant } from '@engine/military/warParticipantUtils';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { hasAppointRightPost } from '@engine/military/warCalc';
import type { Character } from '@engine/character/types';

/**
 * 是否具备缔结同盟的资格：独立 ruler 或 持有辟署权的 ruler。
 * 设计动机：河北三镇名义上是臣属，但掌握辟署权 → 互相结盟后可在削藩战争中同进退。
 */
export function canEnterAlliance(
  char: Character,
  territories: Map<string, Territory>,
): boolean {
  if (!char.alive || !char.isRuler) return false;
  if (char.overlordId == null) return true;
  return hasAppointRightPost(char.id, territories);
}

/** 注册提议结盟 */
registerInteraction({
  id: 'proposeAlliance',
  name: '提议结盟',
  icon: '🤝',
  canShow: (player, target) => {
    if (player.id === target.id) return false;
    if (!target.alive || !player.alive) return false;
    // 禁止同一效忠链：不能和自己的直接领主或自己的直接臣属结盟
    if (player.overlordId === target.id || target.overlordId === player.id) return false;
    // 双方必须是有权结盟的角色：独立 ruler 或 持有辟署权的 ruler
    const territories = useTerritoryStore.getState().territories;
    return canEnterAlliance(player, territories) && canEnterAlliance(target, territories);
  },
  canExecuteCheck: (player, target) => {
    const warStore = useWarStore.getState();
    const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
    // 已结盟
    if (warStore.hasAlliance(player.id, target.id, currentDay)) return '已是盟友';
    // 活跃战争（双方同场对立）
    for (const w of warStore.getActiveWars()) {
      if (isWarParticipant(player.id, w) && isWarParticipant(target.id, w)) return '正在交战中';
    }
    // 同盟上限
    const playerCount = warStore.getAllies(player.id, currentDay).length;
    const targetCount = warStore.getAllies(target.id, currentDay).length;
    if (playerCount >= MAX_ALLIANCES_PER_RULER) return '你的同盟数已达上限';
    if (targetCount >= MAX_ALLIANCES_PER_RULER) return '对方同盟数已达上限';
    // 提议冷却
    if (useNpcStore.getState().isAllianceProposalCooldown(player.id, target.id, currentDay)) {
      return '提议冷却中';
    }
    return null;
  },
  paramType: 'none',
});

// ── 成功率计算（纯函数） ─────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface ProposeAllianceChanceBreakdown {
  base: number;
  opinion: number;
  commonEnemy: number;
  geo: number;
  powerGap: number;
  dire: number;
  personality: number;
}

export interface ProposeAllianceChanceResult {
  chance: number;
  breakdown: ProposeAllianceChanceBreakdown;
}

/**
 * 计算 target 接受 proposer 结盟提议的成功率。
 *
 * 签名故意纯数据化（不直接读 Store），方便测试 + NPC 快照路径复用。
 */
export function calcProposeAllianceChance(params: {
  opinion: number;                              // target 对 proposer 的好感
  targetPersonality: Personality;
  proposerStrength: number;
  targetStrength: number;
  proposerTier: number;                         // getSovereigntyTier
  targetTier: number;
  adjacent: boolean;                            // 领地是否相邻（两跳内）
  commonEnemyCount: number;                     // 双方共同敌人数量
  targetInDireWar: boolean;                     // target 正处于 warScore <= -30 的劣势战争
}): ProposeAllianceChanceResult {
  const base = 20;

  // 好感 [-100,100] → [-50, 50] 再钳到 [-50,+50]
  const opinion = clamp(Math.round(params.opinion * 0.5), -50, 50);

  // 共同敌人：每个 +25，上限 +50
  const commonEnemy = clamp(params.commonEnemyCount * 25, 0, 50);

  // 地缘：领地相邻 → +15
  const geo = params.adjacent ? 15 : 0;

  // 实力差：弱方对强方 +15，反之 0；同 tier 也按兵力比判
  let powerGap = 0;
  const myStr = Math.max(1, params.targetStrength);
  const theirStr = Math.max(1, params.proposerStrength);
  const strRatio = theirStr / myStr;
  if (strRatio >= 1.5 || params.proposerTier > params.targetTier) {
    // 提议方更强 → 弱方更想抱大腿
    powerGap = 15;
  } else if (strRatio <= 0.67 && params.proposerTier <= params.targetTier) {
    // 提议方明显更弱 → 强方懒得结盟
    powerGap = -10;
  }

  // 危局：target 正处于劣势战争 → +30
  const dire = params.targetInDireWar ? 30 : 0;

  // 人格：honor * 10 - deceit * 5
  // 注：Personality 没有 deceit 字段，用 vengefulness 近似"多疑"
  const personalityRaw = params.targetPersonality.honor * 10 - params.targetPersonality.vengefulness * 5;
  const personality = Math.round(clamp(personalityRaw, -15, 15));

  const chance = clamp(
    Math.round(base + opinion + commonEnemy + geo + powerGap + dire + personality),
    5, 95,
  );

  return {
    chance,
    breakdown: { base, opinion, commonEnemy, geo, powerGap, dire, personality },
  };
}

// ── 辅助：地缘邻接 / 共同敌人 / 危局 ──────────────────

function isAdjacentRealms(
  aId: string,
  bId: string,
  territories: Map<string, Territory>,
  controllerIndex: Map<string, Set<string>>,
): boolean {
  const aTerr = controllerIndex.get(aId);
  const bTerr = controllerIndex.get(bId);
  if (!aTerr?.size || !bTerr?.size) return false;
  const adj = buildZhouAdjacency();
  const aZhou = new Set<string>();
  for (const tId of aTerr) {
    if (territories.get(tId)?.tier === 'zhou') aZhou.add(tId);
  }
  const bZhou = new Set<string>();
  for (const tId of bTerr) {
    if (territories.get(tId)?.tier === 'zhou') bZhou.add(tId);
  }
  for (const z of aZhou) {
    const neighbors = adj.get(z);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (bZhou.has(n)) return true;
    }
  }
  return false;
}

function countCommonEnemies(aId: string, bId: string, activeWars: War[]): number {
  // 双方都有活跃敌对战争的对手集合的交集大小
  const aEnemies = new Set<string>();
  const bEnemies = new Set<string>();
  for (const w of activeWars) {
    if (w.status !== 'active') continue;
    if (isWarParticipant(aId, w)) {
      // 对方领袖是敌人
      const enemyLeader = w.attackerId === aId || w.attackerParticipants.includes(aId)
        ? w.defenderId
        : w.attackerId;
      aEnemies.add(enemyLeader);
    }
    if (isWarParticipant(bId, w)) {
      const enemyLeader = w.attackerId === bId || w.attackerParticipants.includes(bId)
        ? w.defenderId
        : w.attackerId;
      bEnemies.add(enemyLeader);
    }
  }
  let count = 0;
  for (const e of aEnemies) {
    if (bEnemies.has(e)) count++;
  }
  return count;
}

function isInDireWar(charId: string, activeWars: War[]): boolean {
  for (const w of activeWars) {
    if (w.status !== 'active') continue;
    if (!isWarParticipant(charId, w)) continue;
    // warScore 正 = 攻方优势。char 在守方且 score >= 30 → dire；char 在攻方且 score <= -30 → dire
    const isAttacker = w.attackerId === charId || w.attackerParticipants.includes(charId);
    if (isAttacker && w.warScore <= -30) return true;
    if (!isAttacker && w.warScore >= 30) return true;
  }
  return false;
}

// ── 执行 ─────────────────────────────────────────────

export type ProposeAllianceResult =
  | { kind: 'accepted'; chance: number; breakdown: ProposeAllianceChanceBreakdown }
  | { kind: 'rejected'; chance: number; breakdown: ProposeAllianceChanceBreakdown }
  | { kind: 'stale' };

export function previewProposeAlliance(
  proposerId: string,
  targetId: string,
): ProposeAllianceChanceResult | null {
  const cs = useCharacterStore.getState();
  const ts = useTerritoryStore.getState();
  const ws = useWarStore.getState();
  const proposer = cs.getCharacter(proposerId);
  const target = cs.getCharacter(targetId);
  if (!proposer || !target) return null;

  const targetExpectedLeg = ts.expectedLegitimacy.get(targetId) ?? null;
  const opinion = calculateBaseOpinion(
    target,
    proposer,
    targetExpectedLeg,
    ts.policyOpinionCache.get(targetId) ?? null,
    ts.policyOpinionCache.get(proposerId) ?? null,
  );
  const targetPersonality = calcPersonality(target);
  const activeWars = ws.getActiveWars();
  const proposerTier = getSovereigntyTier(proposerId, ts.territories, ts.centralPosts);
  const targetTier = getSovereigntyTier(targetId, ts.territories, ts.centralPosts);
  const adjacent = isAdjacentRealms(proposerId, targetId, ts.territories, ts.controllerIndex);
  const commonEnemyCount = countCommonEnemies(proposerId, targetId, activeWars);
  const targetInDireWar = isInDireWar(targetId, activeWars);
  const proposerStrength = getStrength(proposerId);
  const targetStrength = getStrength(targetId);

  return calcProposeAllianceChance({
    opinion,
    targetPersonality,
    proposerStrength,
    targetStrength,
    proposerTier,
    targetTier,
    adjacent,
    commonEnemyCount,
    targetInDireWar,
  });
}

/** 快捷查兵力（总兵 = 角色所有 battalion 的 currentStrength 之和） */
function getStrength(charId: string): number {
  const milState = useMilitaryStore.getState();
  const armyIds = milState.ownerArmyIndex.get(charId);
  if (!armyIds) return 0;
  let total = 0;
  for (const aid of armyIds) {
    const army = milState.armies.get(aid);
    if (!army) continue;
    for (const bid of army.battalionIds) {
      const b = milState.battalions.get(bid);
      if (b) total += b.currentStrength;
    }
  }
  return total;
}

export function executeProposeAlliance(
  proposerId: string,
  targetId: string,
): ProposeAllianceResult {
  const cs = useCharacterStore.getState();
  const ws = useWarStore.getState();
  const ts = useTerritoryStore.getState();
  const proposer = cs.getCharacter(proposerId);
  const target = cs.getCharacter(targetId);
  if (!proposer?.alive || !target?.alive) return { kind: 'stale' };
  if (proposerId === targetId) return { kind: 'stale' };
  if (proposer.overlordId === targetId || target.overlordId === proposerId) return { kind: 'stale' };
  if (!canEnterAlliance(proposer, ts.territories)) return { kind: 'stale' };
  if (!canEnterAlliance(target, ts.territories)) return { kind: 'stale' };

  const currentDay = toAbsoluteDay(useTurnManager.getState().currentDate);
  // 二次校验：stale
  if (ws.hasAlliance(proposerId, targetId, currentDay)) return { kind: 'stale' };
  for (const w of ws.getActiveWars()) {
    if (isWarParticipant(proposerId, w) && isWarParticipant(targetId, w)) return { kind: 'stale' };
  }
  if (ws.getAllies(proposerId, currentDay).length >= MAX_ALLIANCES_PER_RULER) return { kind: 'stale' };
  if (ws.getAllies(targetId, currentDay).length >= MAX_ALLIANCES_PER_RULER) return { kind: 'stale' };

  const preview = previewProposeAlliance(proposerId, targetId);
  if (!preview) return { kind: 'stale' };

  const roll = random() * 100;
  const accepted = roll < preview.chance;
  debugLog('interaction', `[结盟] ${proposer.name} → ${target.name} | chance=${preview.chance}% → ${accepted ? '接受' : '拒绝'}`);

  if (accepted) {
    ws.createAlliance(proposerId, targetId, currentDay);
    cs.addOpinion(proposerId, targetId, { reason: '缔结同盟', value: 30, decayable: true });
    cs.addOpinion(targetId, proposerId, { reason: '缔结同盟', value: 30, decayable: true });
    emitChronicleEvent({
      type: '缔结同盟',
      actors: [proposerId, targetId],
      territories: [],
      description: `${proposer.name}与${target.name}缔结盟约，约定共御外敌（三年）`,
      priority: EventPriority.Major,
    });
    return { kind: 'accepted', chance: preview.chance, breakdown: preview.breakdown };
  }

  // 拒绝：写入冷却 + 双方轻微好感惩罚
  useNpcStore.getState().setAllianceRejectCooldown(proposerId, targetId, currentDay);
  cs.addOpinion(proposerId, targetId, { reason: '结盟被拒', value: -5, decayable: true });
  return { kind: 'rejected', chance: preview.chance, breakdown: preview.breakdown };
}
