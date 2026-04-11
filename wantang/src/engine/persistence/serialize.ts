// ===== 状态 → SaveFile 序列化 =====
//
// 把所有 store 当前状态打包成 JSON-safe 的 SaveFile。
// Map → Array.from(.entries())；Set → Array.from()；函数指针 strip。
// 索引一律不存（vassalIndex / postIndex / aliveSet 等），由 initXxx() 重建。

import { useCharacterStore } from '@engine/character/CharacterStore';
import { useTerritoryStore } from '@engine/territory/TerritoryStore';
import { useMilitaryStore } from '@engine/military/MilitaryStore';
import { useWarStore } from '@engine/military/WarStore';
import { useNpcStore } from '@engine/npc/NpcStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { useTurnManager } from '@engine/TurnManager';
import { useStoryEventBus } from '@engine/storyEventBus';
import { useChronicleStore } from '@engine/chronicle/ChronicleStore';
import { useSchemeStore } from '@engine/scheme/SchemeStore';
import { getCurrentSeed, getRngState } from '@engine/random';
import { SAVE_VERSION, type SaveFile, type SerializedStoryEvent } from './saveSchema';
import type { StoryEvent } from '@engine/storyEventBus';

function stripStoryEvent(ev: StoryEvent): SerializedStoryEvent {
  return {
    ...ev,
    options: ev.options.map(({ onSelect: _onSelect, ...rest }) => rest),
  };
}

export function serializeGame(): SaveFile {
  const charStore = useCharacterStore.getState();
  const terrStore = useTerritoryStore.getState();
  const milStore = useMilitaryStore.getState();
  const warStore = useWarStore.getState();
  const npcStore = useNpcStore.getState();
  const ledgerStore = useLedgerStore.getState();
  const turn = useTurnManager.getState();
  const storyBus = useStoryEventBus.getState();
  const chronicle = useChronicleStore.getState();
  const schemeStore = useSchemeStore.getState();

  const player = charStore.playerId ? charStore.characters.get(charStore.playerId) : undefined;

  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    gameDate: turn.currentDate,
    playerName: player?.name ?? '?',

    rngSeed: getCurrentSeed(),
    rngState: getRngState(),

    characters: Array.from(charStore.characters.values()),
    playerId: charStore.playerId,

    territories: Array.from(terrStore.territories.values()),
    centralPosts: terrStore.centralPosts,

    armies: Array.from(milStore.armies.values()),
    battalions: Array.from(milStore.battalions.values()),

    wars: Array.from(warStore.wars.values()),
    campaigns: Array.from(warStore.campaigns.values()),
    sieges: Array.from(warStore.sieges.values()),
    truces: Array.from(warStore.truces.values()),
    alliances: Array.from(warStore.alliances.values()),

    npc: {
      draftPlan: npcStore.draftPlan,
      deployDrafts: Array.from(npcStore.deployDrafts.entries()),
      deployDrafterCooldowns: Array.from(npcStore.deployDrafterCooldowns.entries()),
      treasuryDrafts: Array.from(npcStore.treasuryDrafts.entries()),
      treasuryDrafterCooldowns: Array.from(npcStore.treasuryDrafterCooldowns.entries()),
      playerTasks: npcStore.playerTasks,
      allianceRejectCooldowns: Array.from(npcStore.allianceRejectCooldowns.entries()),
    },

    playerLedger: ledgerStore.playerLedger,
    allLedgers: Array.from(ledgerStore.allLedgers.entries()),
    treasuryHistory: Array.from(ledgerStore.treasuryHistory.entries()),

    turnState: {
      currentDate: turn.currentDate,
      speed: turn.speed,
      era: turn.era,
      stabilityProgress: turn.stabilityProgress,
      collapseProgress: turn.collapseProgress,
      events: turn.events,
      isPaused: turn.isPaused,
      seed: turn.seed,
      playthroughId: turn.playthroughId,
      dynastyExtinct: turn.dynastyExtinct,
    },

    storyEventQueue: storyBus.storyEventQueue.map(stripStoryEvent),
    storySpeedBeforePause: storyBus._speedBeforePause,

    chronicleState: {
      monthDrafts: Array.from(chronicle.monthDrafts.entries()),
      yearChronicles: Array.from(chronicle.yearChronicles.entries()),
    },

    schemes: Array.from(schemeStore.schemes.values()),
  };
}
