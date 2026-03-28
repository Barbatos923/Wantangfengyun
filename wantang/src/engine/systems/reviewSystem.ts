// ===== 三年一考（考课制度） =====

import type { Character } from '@engine/character/types';
import type { Post, Territory } from '@engine/territory/types';
import type { PositionTemplate } from '@engine/official/types';
import type { GameDate } from '@engine/types';
import { clamp } from '@engine/utils';

/** 完整考课周期（月） */
const FULL_CYCLE_MONTHS = 36;

/** 两个日期之间的月数 */
export function monthsBetween(from: GameDate, to: GameDate): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/** 考课结果条目 */
export interface ReviewEntry {
  postId: string;
  holderId: string;
  score: number;
  grade: 'upper' | 'middle' | 'lower';
  legalAppointerId: string;
  proposedBy: string;
}

/** 考课方案 */
export interface ReviewPlan {
  entries: ReviewEntry[];
  date: GameDate;
}

/**
 * 考课评分纯函数（0–100）。
 *
 * 地方主官（grantsControl）：人口增长×0.4 + 贤能增长×0.3 + 能力匹配×0.3
 * 中央官 / 地方副职：       贤能增长×0.5 + 能力匹配×0.5（无人口维度）
 *
 * 若任期不满完整周期，增长指标按 (36 / 实际月数) 归一化，
 * 等效于将短期增长外推到完整三年，使短任期者不因积累时间少而吃亏。
 */
export function calculateReviewScore(
  character: Character,
  territory: Territory | undefined,
  baseline: NonNullable<Post['reviewBaseline']>,
  positionTemplate: PositionTemplate,
  reviewDate: GameDate,
): number {
  // 任期月数，最少 1 个月防除零，最多 36 个月
  const served = clamp(monthsBetween(baseline.date, reviewDate), 1, FULL_CYCLE_MONTHS);
  const scale = FULL_CYCLE_MONTHS / served;

  // 贤能增长
  const currentVirtue = character.official?.virtue ?? 0;
  const virtueGrowth = currentVirtue - baseline.virtue;
  const virtueScore = clamp(virtueGrowth * scale / 3 + 65, 0, 100);

  // 岗位匹配度（静态能力，不受任期影响）
  const isMilitary = positionTemplate.territoryType === 'military';
  const ability = isMilitary ? character.abilities.military : character.abilities.administration;
  const abilityScore = clamp(ability * 5, 0, 100);

  // 是否有人口维度：地方主官（grantsControl）且有领地数据
  const hasLandDimension = territory && baseline.population > 0 && positionTemplate.grantsControl;

  if (hasLandDimension) {
    const popGrowth = (territory.basePopulation - baseline.population) / baseline.population;
    const landScore = clamp(popGrowth * scale * 500 + 65, 0, 100);
    return Math.round(landScore * 0.4 + virtueScore * 0.3 + abilityScore * 0.3);
  }

  // 中央官 / 地方副职：贤能×0.5 + 能力×0.5
  return Math.round(virtueScore * 0.5 + abilityScore * 0.5);
}

export function getReviewGrade(score: number): 'upper' | 'middle' | 'lower' {
  if (score >= 80) return 'upper';
  if (score >= 60) return 'middle';
  return 'lower';
}

export function getReviewGradeLabel(grade: 'upper' | 'middle' | 'lower'): string {
  switch (grade) {
    case 'upper': return '上等';
    case 'middle': return '中等';
    case 'lower': return '下等';
  }
}
