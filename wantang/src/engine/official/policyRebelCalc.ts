// ===== 政策变更反抗概率计算（纯函数） =====
//
// 领主收回臣属辟署权 / 宗法改流官时，臣属的接受概率。
// 拒绝 = 发动独立战争。

import type { Personality } from '@data/traits';

export interface PolicyRebelBreakdown {
  base: number;
  opinion: number;
  honor: number;
  boldness: number;
  military: number;
  total: number;
}

/**
 * 计算臣属接受政策削权的概率（0~100）。
 * @param vassalOpinionToOverlord 臣属对领主的好感（注意方向）
 * @param vassalPersonality 臣属的人格
 * @param overlordStrength 领主军力
 * @param vassalStrength 臣属军力
 */
export function calcPolicyAcceptChance(
  vassalOpinionToOverlord: number,
  vassalPersonality: Personality,
  overlordStrength?: number,
  vassalStrength?: number,
): PolicyRebelBreakdown {
  const base = 20;
  const opinion = vassalOpinionToOverlord * 0.5;
  const honor = vassalPersonality.honor * 15;
  const boldness = vassalPersonality.boldness * -10;
  // 军力对比：领主强则臣属更不敢反抗，clamp -20 ~ +20
  let military = 0;
  if (overlordStrength !== undefined && vassalStrength !== undefined && vassalStrength > 0) {
    const ratio = overlordStrength / vassalStrength;
    // ratio=3 → +20, ratio=1.5 → 0, ratio=0.5 → -20
    military = Math.round(Math.max(-20, Math.min(20, (ratio - 1.5) / 1.5 * 20)));
  }
  const raw = base + opinion + honor + boldness + military;
  const total = Math.round(Math.max(5, Math.min(95, raw)));
  return { base, opinion: Math.round(opinion), honor: Math.round(honor), boldness: Math.round(boldness), military, total };
}
