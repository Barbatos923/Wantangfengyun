// ===== 存档版本迁移 =====
//
// MVP 期只有 v1，无需任何迁移。占位文件，为未来 schema 演进留接口。
// 当 SAVE_VERSION 升级时，在此添加 vN → vN+1 的迁移函数，并在 migrate() 中串起来。

import type { SaveFile } from './saveSchema';
import { SAVE_VERSION } from './saveSchema';

/**
 * 把任意旧版本存档迁移到当前 SAVE_VERSION。
 * 目前只支持 v1，遇到未知版本直接抛错。
 */
export function migrate(save: SaveFile, fromVersion: number): SaveFile {
  if (fromVersion === SAVE_VERSION) return save;
  throw new Error(`不支持的存档版本: ${fromVersion}（当前 ${SAVE_VERSION}）`);
}
