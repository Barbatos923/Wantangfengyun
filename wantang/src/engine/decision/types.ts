// ===== 决议系统类型定义 =====

/** 决议目标（需要额外选择的候选项） */
export interface DecisionTarget {
  id: string;
  label: string;
  description?: string;
  eligible: boolean;
  reason?: string;
  cost: { money: number; prestige: number };
}

/** 决议定义 */
export interface Decision {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** 决议是否对指定角色可见（廉价判断） */
  canShow: (actorId: string) => boolean;
  /** 决议是否可执行 + 不满足时的原因列表 */
  canExecute: (actorId: string) => { executable: boolean; reasons: string[] };
  /** 需要额外参数选择（如选择哪个 guo）时返回候选列表 */
  getTargets?: (actorId: string) => DecisionTarget[];
  /**
   * 执行决议（targetId 为 getTargets 返回的目标 ID，config 为额外配置）。
   *
   * 返回值：true 表示已落地，false 表示执行瞬间二次校验失败（资格/资源已变化），
   * 上层（UI/NPC）应据此提示或重试，**不得**假定调用必然成功。
   */
  execute: (actorId: string, targetId?: string, config?: Record<string, unknown>) => boolean;
}
