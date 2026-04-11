// ===== 存档版本迁移 =====
//
// MVP 期只有 v1，无需任何迁移。占位文件，为未来 schema 演进留接口。
// 当 SAVE_VERSION 升级时，在此添加 vN → vN+1 的迁移函数，并在 migrate() 中串起来。

import type { SaveFile } from './saveSchema';
import { SAVE_VERSION } from './saveSchema';
import type { SchemeInstance } from '@engine/scheme/types';

function newPlaythroughId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `pt-${Date.now()}-${Math.random()}`;
}

/**
 * 把任意旧版本存档迁移到当前 SAVE_VERSION。
 *
 * v1 → v2：turnState 新增 playthroughId（events/chronicles 命名空间）。
 *           旧存档没有这个字段，注入新 ID 即可——历史上写入 IndexedDB 的旧 events/chronicles
 *           会被 DB v3 升级直接删表清掉，不会跟新 ID 串档。
 */
export function migrate(save: SaveFile, fromVersion: number): SaveFile {
  if (fromVersion === SAVE_VERSION) return save;
  if (fromVersion === 1) {
    const migrated: SaveFile = {
      ...save,
      version: 2,
      turnState: {
        ...save.turnState,
        playthroughId: save.turnState.playthroughId ?? newPlaythroughId(),
      },
    };
    return migrate(migrated, 2);
  }
  if (fromVersion === 3) {
    // v3 → v4：TurnManager 新增 dynastyExtinct 字段，旧存档默认 false
    const oldTurn = save.turnState as unknown as Record<string, unknown>;
    const migrated: SaveFile = {
      ...save,
      version: 4,
      turnState: {
        ...save.turnState,
        dynastyExtinct: (oldTurn.dynastyExtinct as boolean | undefined) ?? false,
      },
    };
    return migrate(migrated, 4);
  }
  if (fromVersion === 4) {
    // v4 → v5：新增 AI 史书 chronicleState（空字段）。LLM 配置走独立 IndexedDB store，不在此。
    const migrated: SaveFile = {
      ...save,
      version: 5,
      chronicleState: (save as unknown as { chronicleState?: SaveFile['chronicleState'] })
        .chronicleState ?? { monthDrafts: [], yearChronicles: [] },
    };
    return migrate(migrated, 5);
  }
  if (fromVersion === 5) {
    // v5 → v6：新增计谋系统 schemes 字段。旧档无活跃计谋，注入空数组即可。
    const migrated: SaveFile = {
      ...save,
      version: 6,
      schemes: (save as unknown as { schemes?: SchemeInstance[] }).schemes ?? [],
    };
    return migrate(migrated, 6);
  }
  if (fromVersion === 6) {
    // v6 → v7：计谋加入 per-target 365 天 CD。已结算 scheme 原先没 resolveDate 字段，
    // 需要回填，否则 hasRecentScheme() 会直接跳过历史记录，365 天 CD 对老档失效。
    //
    // 回填策略：用 startDate 作为 resolveDate 的近似值。
    // 真实 resolveDate 会比 startDate 晚 scheme 全长（basic 90 天 / alienation 3×30）。
    // 用 startDate 意味着旧档的 CD 会比精确值早到期最多 90 天，这是可接受的误差
    // —— 老档通常只有少量历史 scheme，且 90 天偏差远小于 365 天 CD 窗口。
    // terminated 的 scheme 不回填（死亡终止本身不进 CD 语义）。
    const migratedSchemes = save.schemes.map((s) => {
      if (s.resolveDate) return s;
      if (s.status !== 'success' && s.status !== 'failure' && s.status !== 'exposed') return s;
      return { ...s, resolveDate: { ...s.startDate } };
    });
    const migrated: SaveFile = {
      ...save,
      version: 7,
      schemes: migratedSchemes,
    };
    return migrate(migrated, 7);
  }
  if (fromVersion === 2) {
    // v2 → v3：行营废弃 'mustering' 状态 + musteringTurnsLeft 字段。
    // 旧存档若有 mustering 行营，把 status 转回 idle，musteringTurnsLeft 丢弃。
    // 旧 mustering 行营把所有军队都塞进 armyIds 了——没有 incomingArmies 信息可以恢复，
    // 等同于"集结已完成"，把它们当 idle 处理是最不破坏战局的兼容选择。
    //
    // 注意：这里必须用 unknown 宽化把 campaigns 视为旧 schema，否则 tsc 会拿
    // 新 Campaign 的 status 联合（无 'mustering'）去比较而报"types have no overlap"。
    const oldCampaigns = save.campaigns as unknown as Array<Record<string, unknown>>;
    const migratedCampaigns = oldCampaigns.map((raw) => {
      const { musteringTurnsLeft: _drop, status, ...rest } = raw;
      return {
        ...rest,
        status: status === 'mustering' ? 'idle' : status,
      };
    }) as unknown as SaveFile['campaigns'];
    const migrated: SaveFile = {
      ...save,
      version: 3,
      campaigns: migratedCampaigns,
    };
    return migrate(migrated, 3);
  }
  throw new Error(`不支持的存档版本: ${fromVersion}（当前 ${SAVE_VERSION}）`);
}
