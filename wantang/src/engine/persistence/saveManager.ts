// ===== 存档高层 API =====
//
// saveCurrent / loadCurrent —— 自动存档（IndexedDB current 槽）
// exportToFile / importFromFile —— 玩家手动导出/导入 JSON 文件
// newGame —— 清空存档并重新加载初始数据

import { saveGame, loadGame, deleteSave, listSaves, purgePlaythroughArchives, type SaveListEntry } from '@engine/storage';
import { loadSampleData } from '@engine/init/loadSampleData';
import { useSaveStatusStore } from '@ui/stores/saveStatusStore';
import { useTurnManager } from '@engine/TurnManager';
import { useWarStore } from '@engine/military/WarStore';
import { useNpcStore } from '@engine/npc/NpcStore';
import { useLedgerStore } from '@engine/official/LedgerStore';
import { useStoryEventBus } from '@engine/storyEventBus';
import { useChronicleStore } from '@engine/chronicle/ChronicleStore';
import { useSchemeStore } from '@engine/scheme/SchemeStore';
import { initRng } from '@engine/random';
import { GameSpeed, Era } from '@engine/types';
import { CURRENT_SAVE_SLOT, type SaveFile } from './saveSchema';
import { serializeGame } from './serialize';
import { deserializeGame } from './deserialize';

/** 把 loadSampleData 不会重置的 store 全部清空，并把 TurnManager 重置为 870 年正月初二。 */
function resetTransientStores(): void {
  // TurnManager：重置时间/时代/事件/速度，新种子，新 playthroughId（隔离归档/史书）
  const newSeed = Date.now().toString();
  initRng(newSeed);
  const newPlaythroughId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `pt-${Date.now()}-${Math.random()}`;
  useTurnManager.setState({
    currentDate: { year: 870, month: 1, day: 2 },
    speed: GameSpeed.Normal,
    era: Era.WeiShi,
    stabilityProgress: 0,
    collapseProgress: 0,
    events: [],
    isPaused: false,
    seed: newSeed,
    playthroughId: newPlaythroughId,
    dynastyExtinct: false,
  });

  // WarStore
  useWarStore.setState({
    wars: new Map(),
    campaigns: new Map(),
    sieges: new Map(),
    truces: new Map(),
    alliances: new Map(),
  });

  // NpcStore
  useNpcStore.setState({
    draftPlan: null,
    deployDrafts: new Map(),
    deployDrafterCooldowns: new Map(),
    treasuryDrafts: new Map(),
    treasuryDrafterCooldowns: new Map(),
    playerTasks: [],
    allianceRejectCooldowns: new Map(),
  });

  // LedgerStore（playerLedger 由 loadSampleData 重新计算，但 allLedgers/treasuryHistory 需手动清）
  useLedgerStore.setState({
    playerLedger: null,
    allLedgers: new Map(),
    treasuryHistory: new Map(),
  });

  // StoryEventBus
  useStoryEventBus.setState({
    storyEventQueue: [],
    _speedBeforePause: null,
  });

  // ChronicleStore（AI 史书：清空所有月稿与年史；LLM 配置不动，那是设备级凭证）
  useChronicleStore.getState().clearAll();

  // SchemeStore：清空活跃计谋 + 反向索引
  useSchemeStore.setState({
    schemes: new Map(),
    initiatorIndex: new Map(),
    targetIndex: new Map(),
  });
}

/** 把当前游戏状态写入 IndexedDB current 槽。失败时弹 toast。 */
export async function saveCurrent(): Promise<void> {
  try {
    const data = serializeGame();
    await saveGame(CURRENT_SAVE_SLOT, data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    useSaveStatusStore.getState().setError(`存档失败：${msg}`);
    throw e;
  }
}

/** 尝试从 IndexedDB current 槽读档。返回 true 表示已恢复，false 表示无存档（调用方应走新游戏流程）。 */
export async function loadCurrent(): Promise<boolean> {
  const data = await loadGame(CURRENT_SAVE_SLOT);
  if (!data) return false;
  deserializeGame(data as SaveFile);
  return true;
}

/** 新游戏：清空 current 槽 + 重置所有非 loadSampleData 管辖的 store + 走 loadSampleData 重新初始化。 */
export async function newGame(): Promise<void> {
  // 顺手把当前 playthroughId 的归档清掉，避免反复"开新档"在 IndexedDB 里堆垃圾。
  // 注：新 playthroughId 在 resetTransientStores() 里生成，所以归档隔离靠 ID 不重复，
  // 这里 purge 只是为了不留孤儿数据。
  const oldPid = useTurnManager.getState().playthroughId;
  await deleteSave(CURRENT_SAVE_SLOT);
  if (oldPid) {
    try { await purgePlaythroughArchives(oldPid); } catch { /* 非致命 */ }
  }
  resetTransientStores();
  loadSampleData();
}

/** 导出当前游戏状态为 JSON 文件（浏览器下载）。 */
export function exportToFile(): void {
  const data = serializeGame();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wantang-${data.gameDate.year}-${data.gameDate.month}-${data.gameDate.day}-${data.playerName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 从用户选择的 JSON 文件导入存档，导入后立即写一次 current 槽。 */
export async function importFromFile(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text) as SaveFile;
  deserializeGame(data);
  await saveCurrent();
}

// ===== 命名存档（CK3 风格多槽位） =====

/** 创建一个命名存档（独立槽位）。同时刷新 current 自动续档槽。 */
export async function createNamedSave(displayName: string): Promise<void> {
  try {
    const data = serializeGame();
    const id = `save-${crypto.randomUUID()}`;
    await saveGame(id, data, {
      displayName: displayName.trim() || `存档 ${new Date().toLocaleString()}`,
      gameYear: data.gameDate.year,
      gameMonth: data.gameDate.month,
      gameDay: data.gameDate.day,
      playerName: data.playerName,
    });
    // 命名存档同时也刷新自动续档槽，保证下次启动恢复到刚保存的位置
    await saveGame(CURRENT_SAVE_SLOT, data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    useSaveStatusStore.getState().setError(`存档失败：${msg}`);
    throw e;
  }
}

/** 读取一个命名存档。读取后立即刷新 current 自动续档槽。 */
export async function loadNamedSave(id: string): Promise<void> {
  const data = await loadGame(id);
  if (!data) throw new Error(`存档不存在: ${id}`);
  deserializeGame(data as SaveFile);
  await saveCurrent();
}

/** 列出所有命名存档（自动续档槽 current 不在其中），按时间倒序。 */
export async function listNamedSaves(): Promise<SaveListEntry[]> {
  const all = await listSaves();
  return all
    .filter((s) => s.id !== CURRENT_SAVE_SLOT)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** 删除一个命名存档。 */
export async function deleteNamedSave(id: string): Promise<void> {
  if (id === CURRENT_SAVE_SLOT) throw new Error('不能删除自动续档槽');
  await deleteSave(id);
}
