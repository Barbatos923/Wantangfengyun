// ===== 计谋类型注册中心 =====
//
// 每种计谋（拉拢/离间/...）在自己的文件里调 registerSchemeType() 自注册。
// 引擎/Store/日结/UI 不感知具体类型，全部通过 registry 路由。

import type { SchemeTypeDef } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, SchemeTypeDef<any>>();

export function registerSchemeType(def: SchemeTypeDef<any>): void {  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (registry.has(def.id)) {
    console.warn(`[scheme] duplicate registration: ${def.id}`);
    return;
  }
  registry.set(def.id, def);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSchemeType(id: string): SchemeTypeDef<any> | undefined {
  return registry.get(id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllSchemeTypes(): SchemeTypeDef<any>[] {
  return Array.from(registry.values());
}
