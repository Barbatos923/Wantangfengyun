/**
 * 同盟系统 — 存档/契约/清理不变量测试
 *
 * 覆盖：
 * 1. WarStore.createAlliance / hasAlliance / getAllies / breakAlliance / cleanExpiredAlliances 的基本正确性
 * 2. 存档 round-trip：alliances Map 序列化→反序列化后严格相等
 * 3. 过期清理：expiryDay <= currentDay 的同盟被 cleanExpiredAlliances 删除
 * 4. 获取盟友：期满同盟不出现在 getAllies 结果中
 * 5. NpcStore.allianceRejectCooldowns 的冷却计算
 *
 * 不覆盖（需要全套 sample data 初始化，留给手动测试）：
 * - autoJoinAlliesOnWarStart 对战争的实际影响
 * - executeDeclareWar 背盟惩罚的 prestige 扣减（需真实 character）
 * - executeProposeAlliance 的 stale 契约（依赖 calculateBaseOpinion 等读 TerritoryStore）
 * - NPC 行为生成/权重（需要完整 NpcContext）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useWarStore } from '@engine/military/WarStore';
import { useNpcStore } from '@engine/npc/NpcStore';
import type { Alliance } from '@engine/military/types';
import {
  ALLIANCE_DURATION_DAYS,
  ALLIANCE_PROPOSAL_REJECT_CD_DAYS,
} from '@engine/military/types';

beforeEach(() => {
  // 清空 WarStore 的 alliances（和其他测试不互相污染）
  useWarStore.setState({
    wars: new Map(),
    campaigns: new Map(),
    sieges: new Map(),
    truces: new Map(),
    alliances: new Map(),
  });
  useNpcStore.setState({
    allianceRejectCooldowns: new Map(),
  });
});

describe('WarStore 同盟 CRUD', () => {
  it('createAlliance 设置正确的 partyA/partyB/startDay/expiryDay', () => {
    const day = 10000;
    const al = useWarStore.getState().createAlliance('charA', 'charB', day);
    expect(al.partyA).toBe('charA');
    expect(al.partyB).toBe('charB');
    expect(al.startDay).toBe(day);
    expect(al.expiryDay).toBe(day + ALLIANCE_DURATION_DAYS);
    expect(useWarStore.getState().alliances.size).toBe(1);
  });

  it('hasAlliance 双向查询', () => {
    const day = 10000;
    useWarStore.getState().createAlliance('charA', 'charB', day);
    expect(useWarStore.getState().hasAlliance('charA', 'charB', day)).toBe(true);
    expect(useWarStore.getState().hasAlliance('charB', 'charA', day)).toBe(true);
    expect(useWarStore.getState().hasAlliance('charA', 'charC', day)).toBe(false);
  });

  it('hasAlliance 在 expiryDay 那一天返回 false（边界）', () => {
    const day = 10000;
    const al = useWarStore.getState().createAlliance('charA', 'charB', day);
    // 还在期内
    expect(useWarStore.getState().hasAlliance('charA', 'charB', al.expiryDay - 1)).toBe(true);
    // 到期当天算过期
    expect(useWarStore.getState().hasAlliance('charA', 'charB', al.expiryDay)).toBe(false);
    expect(useWarStore.getState().hasAlliance('charA', 'charB', al.expiryDay + 1)).toBe(false);
  });

  it('getAllies 返回未过期盟友列表，过期的不返回', () => {
    const day = 10000;
    useWarStore.getState().createAlliance('charA', 'charB', day);
    useWarStore.getState().createAlliance('charA', 'charC', day);
    // 人造一个已过期的同盟
    useWarStore.setState((s) => {
      const alliances = new Map(s.alliances);
      alliances.set('expired-id', {
        id: 'expired-id',
        partyA: 'charA',
        partyB: 'charD',
        startDay: day - ALLIANCE_DURATION_DAYS - 10,
        expiryDay: day - 5,
      });
      return { alliances };
    });

    const allies = useWarStore.getState().getAllies('charA', day);
    expect(allies.length).toBe(2);
    expect(allies).toContain('charB');
    expect(allies).toContain('charC');
    expect(allies).not.toContain('charD');
  });

  it('getAllies 对无盟友角色返回空数组', () => {
    expect(useWarStore.getState().getAllies('loner', 10000)).toEqual([]);
  });

  it('breakAllianceBetween 删除双向同盟', () => {
    const day = 10000;
    useWarStore.getState().createAlliance('charA', 'charB', day);
    expect(useWarStore.getState().alliances.size).toBe(1);
    useWarStore.getState().breakAllianceBetween('charB', 'charA'); // 方向反也可
    expect(useWarStore.getState().alliances.size).toBe(0);
    expect(useWarStore.getState().hasAlliance('charA', 'charB', day)).toBe(false);
  });

  it('cleanExpiredAlliances 返回过期列表并从 Map 中删除', () => {
    const day = 10000;
    useWarStore.getState().createAlliance('charA', 'charB', day);
    // 人造一个已过期项
    useWarStore.setState((s) => {
      const alliances = new Map(s.alliances);
      alliances.set('old', {
        id: 'old',
        partyA: 'charX',
        partyB: 'charY',
        startDay: day - ALLIANCE_DURATION_DAYS - 10,
        expiryDay: day - 1,
      });
      return { alliances };
    });
    expect(useWarStore.getState().alliances.size).toBe(2);

    const expired = useWarStore.getState().cleanExpiredAlliances(day);
    expect(expired.length).toBe(1);
    expect(expired[0].partyA).toBe('charX');
    expect(useWarStore.getState().alliances.size).toBe(1);
  });

  it('cleanExpiredAlliances 无过期时不修改 store 且返回空数组', () => {
    const day = 10000;
    useWarStore.getState().createAlliance('charA', 'charB', day);
    const expired = useWarStore.getState().cleanExpiredAlliances(day);
    expect(expired).toEqual([]);
    expect(useWarStore.getState().alliances.size).toBe(1);
  });

  it('getAlliancesOf 返回含此 charId 的所有同盟', () => {
    const day = 10000;
    useWarStore.getState().createAlliance('charA', 'charB', day);
    useWarStore.getState().createAlliance('charA', 'charC', day);
    useWarStore.getState().createAlliance('charB', 'charD', day);
    expect(useWarStore.getState().getAlliancesOf('charA').length).toBe(2);
    expect(useWarStore.getState().getAlliancesOf('charB').length).toBe(2);
    expect(useWarStore.getState().getAlliancesOf('charD').length).toBe(1);
    expect(useWarStore.getState().getAlliancesOf('charE').length).toBe(0);
  });
});

describe('NpcStore 同盟提议冷却', () => {
  it('setAllianceRejectCooldown / isAllianceProposalCooldown', () => {
    const now = 10000;
    useNpcStore.getState().setAllianceRejectCooldown('charA', 'charB', now);
    // 冷却期内
    expect(useNpcStore.getState().isAllianceProposalCooldown('charA', 'charB', now)).toBe(true);
    expect(useNpcStore.getState().isAllianceProposalCooldown('charA', 'charB', now + ALLIANCE_PROPOSAL_REJECT_CD_DAYS - 1)).toBe(true);
    // 冷却刚好到期（until > currentDay 的实现：等于 until 时返回 false）
    expect(useNpcStore.getState().isAllianceProposalCooldown('charA', 'charB', now + ALLIANCE_PROPOSAL_REJECT_CD_DAYS)).toBe(false);
    expect(useNpcStore.getState().isAllianceProposalCooldown('charA', 'charB', now + ALLIANCE_PROPOSAL_REJECT_CD_DAYS + 1)).toBe(false);
  });

  it('冷却是单向的：A→B 拒绝不影响 B→A', () => {
    const now = 10000;
    useNpcStore.getState().setAllianceRejectCooldown('charA', 'charB', now);
    expect(useNpcStore.getState().isAllianceProposalCooldown('charA', 'charB', now)).toBe(true);
    expect(useNpcStore.getState().isAllianceProposalCooldown('charB', 'charA', now)).toBe(false);
  });
});

describe('同盟存档 round-trip', () => {
  it('alliances Map serialize → new Map(entries) → 相等', () => {
    const day = 10000;
    const al1 = useWarStore.getState().createAlliance('charA', 'charB', day);
    const al2 = useWarStore.getState().createAlliance('charA', 'charC', day + 100);

    // 模拟 serialize
    const serialized = Array.from(useWarStore.getState().alliances.values());
    expect(serialized.length).toBe(2);

    // 清空
    useWarStore.setState({ alliances: new Map() });
    expect(useWarStore.getState().alliances.size).toBe(0);

    // 模拟 deserialize（与 deserialize.ts:52 的模式一致）
    useWarStore.setState({
      alliances: new Map(serialized.map((a) => [a.id, a])),
    });

    const restored = useWarStore.getState().alliances;
    expect(restored.size).toBe(2);
    expect(restored.get(al1.id)).toEqual(al1);
    expect(restored.get(al2.id)).toEqual(al2);
    // 查询行为一致
    expect(useWarStore.getState().hasAlliance('charA', 'charB', day + 50)).toBe(true);
    expect(useWarStore.getState().hasAlliance('charA', 'charC', day + 200)).toBe(true);
  });

  it('deserialize 对旧存档（alliances 字段缺失）兜底为空 Map', () => {
    // 模拟 deserialize.ts:52 的 `save.alliances ?? []` 分支
    const saveWithoutAlliances: { alliances?: Alliance[] } = {};
    useWarStore.setState({
      alliances: new Map((saveWithoutAlliances.alliances ?? []).map((a) => [a.id, a])),
    });
    expect(useWarStore.getState().alliances.size).toBe(0);
  });
});
