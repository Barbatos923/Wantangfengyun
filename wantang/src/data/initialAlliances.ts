// ===== 初始同盟数据（870年）=====
//
// 河北三镇（魏博 韩允中 / 成德 王景崇 / 卢龙 张允伸）自安史之乱以来互为奥援，
// 共抗朝廷削藩。这里用数据化的同盟关系让"削其一则其他反戈"的史实场景在
// 削藩战争中自然浮现。
//
// 数据存储在 alliances.json；loadSampleData 按 TurnManager.currentDate 注入 startDay。
// 可选字段：
//   - startDayOffset?: 偏移量（负数 = 游戏开始前已签订，用于跨过试用期）
//   - durationDays?: 契约总期限（覆盖默认的 ALLIANCE_DURATION_DAYS = 3 年）

import alliancesData from './alliances.json';

export interface InitialAlliancePair {
  partyA: string;
  partyB: string;
  /** 相对于游戏当前日的天数偏移（负数 = 已存续）。默认 0。 */
  startDayOffset?: number;
  /** 契约总期限（天）。默认 ALLIANCE_DURATION_DAYS。 */
  durationDays?: number;
}

export function createAllAlliancePairs(): InitialAlliancePair[] {
  return alliancesData as InitialAlliancePair[];
}
