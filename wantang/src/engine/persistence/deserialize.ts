// ===== SaveFile → 状态恢复 =====
//
// 反序列化顺序：先 RNG，再各 store。CharacterStore / TerritoryStore / MilitaryStore
// 调 initXxx() 重建索引；其他 store 直接 setState。playerId 必须单独 setPlayerId。

import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useNpcStore } from '@engine/npc/NpcStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { useTurnManager } from '@engine/TurnManager';
import { useStoryEventBus, type StoryEvent } from '@engine/storyEventBus';
import { useChronicleStore } from '@engine/chronicle/ChronicleStore';
import { useSchemeStore } from '@engine/scheme/SchemeStore';
import { restoreRng } from '@engine/random';
import seedrandom from 'seedrandom';
import type { SaveFile, SerializedStoryEvent } from './saveSchema';
import { migrate } from './migrations';

function rehydrateStoryEvent(ev: SerializedStoryEvent): StoryEvent {
  return {
    ...ev,
    options: ev.options.map((opt) => ({ ...opt, onSelect: () => {} })),
  };
}

export function deserializeGame(raw: SaveFile): void {
  const save = migrate(raw, raw.version);

  // RNG（必须最先恢复，后续任何 store 操作都可能用到）
  restoreRng(save.rngSeed, save.rngState as seedrandom.State.Arc4);

  // CharacterStore
  useCharacterStore.getState().initCharacters(save.characters);
  // 无条件写回 playerId（含 null）：绝嗣 Game Over 存档的 playerId === null 必须显式覆盖，
  // 否则旧 store 残留的 playerId 会与新存档的 dynastyExtinct 语义冲突
  useCharacterStore.getState().setPlayerId(save.playerId);

  // TerritoryStore（territories + centralPosts，两次 init 都会重建索引）
  useTerritoryStore.getState().initTerritories(save.territories);
  useTerritoryStore.getState().initCentralPosts(save.centralPosts);

  // MilitaryStore
  useMilitaryStore.getState().initMilitary(save.armies, save.battalions);

  // WarStore（无 init 函数，直接 setState）
  useWarStore.setState({
    wars: new Map(save.wars.map((w) => [w.id, w])),
    campaigns: new Map(save.campaigns.map((c) => [c.id, c])),
    sieges: new Map(save.sieges.map((s) => [s.id, s])),
    truces: new Map(save.truces.map((t) => [t.id, t])),
    // 旧档兜底：alliances 字段在 v5 之后引入，旧存档没有该字段
    alliances: new Map((save.alliances ?? []).map((a) => [a.id, a])),
  });

  // NpcStore
  useNpcStore.setState({
    draftPlan: save.npc.draftPlan,
    deployDrafts: new Map(save.npc.deployDrafts),
    deployDrafterCooldowns: new Map(save.npc.deployDrafterCooldowns),
    treasuryDrafts: new Map(save.npc.treasuryDrafts),
    treasuryDrafterCooldowns: new Map(save.npc.treasuryDrafterCooldowns),
    playerTasks: save.npc.playerTasks,
    // 旧档兜底：allianceRejectCooldowns 是新字段
    allianceRejectCooldowns: new Map(save.npc.allianceRejectCooldowns ?? []),
  });

  // LedgerStore
  useLedgerStore.setState({
    playerLedger: save.playerLedger,
    allLedgers: new Map(save.allLedgers),
    treasuryHistory: new Map(save.treasuryHistory),
  });

  // TurnManager
  useTurnManager.setState(save.turnState);

  // StoryEventBus
  useStoryEventBus.setState({
    storyEventQueue: save.storyEventQueue.map(rehydrateStoryEvent),
    _speedBeforePause: save.storySpeedBeforePause,
  });

  // ChronicleStore（v5 起）
  useChronicleStore.getState().hydrate({
    monthDrafts: save.chronicleState?.monthDrafts ?? [],
    yearChronicles: save.chronicleState?.yearChronicles ?? [],
  });

  // SchemeStore（v6 起 schemes，v8 起 spymasters）
  useSchemeStore.getState().initSchemes(save.schemes, save.spymasters ?? []);

  // 全量刷新角色所在地（兼容旧存档 + 确保行营指挥官位置正确）
  {
    const charStore = useCharacterStore.getState();
    for (const charId of charStore.aliveSet) {
      charStore.refreshLocation(charId);
    }
  }
}
