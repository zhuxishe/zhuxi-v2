/**
 * 匹配评分因子 — 各维度评分实现
 */

import type { MatchCandidate, MatchingConfig, ScoreComponent } from "./types"
import { jaccard, complementScore } from "./similarity"

export function scoreInterestOverlap(
  a: MatchCandidate,
  b: MatchCandidate,
  weight: number,
): ScoreComponent {
  const rawScore = jaccard(a.interestTags, b.interestTags)
  const common = a.interestTags.filter((t) => b.interestTags.includes(t))
  return {
    factor: "interest_overlap",
    label: "兴趣重合",
    weight,
    rawScore,
    weightedScore: weight * rawScore,
    detail: common.length > 0
      ? `共同标签: ${common.join(", ")} (Jaccard=${rawScore.toFixed(2)})`
      : "无共同兴趣标签",
  }
}

export function scoreSocialComplement(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): ScoreComponent {
  const weight = config.weights.social_complement
  const tagsA = [...a.socialTags]
  if (a.formSocialStyle && !tagsA.includes(a.formSocialStyle)) tagsA.push(a.formSocialStyle)
  const tagsB = [...b.socialTags]
  if (b.formSocialStyle && !tagsB.includes(b.formSocialStyle)) tagsB.push(b.formSocialStyle)

  const rawScore = complementScore(tagsA, tagsB, config.complementPairs)
  return {
    factor: "social_complement",
    label: "社交互补",
    weight,
    rawScore,
    weightedScore: weight * rawScore,
    detail: rawScore > 0
      ? `互补匹配度: ${(rawScore * 100).toFixed(0)}%`
      : "无互补匹配",
  }
}

export function scoreSchoolDiversity(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): ScoreComponent {
  const weight = config.weights.school_diversity
  let rawScore: number
  if (!a.school || !b.school) {
    rawScore = 0.5
  } else if (a.school === b.school) {
    rawScore = config.preferCrossSchool ? 0.3 : 1.0
  } else {
    rawScore = config.preferCrossSchool ? 1.0 : 0.7
  }
  return {
    factor: "school_diversity",
    label: "学校多样性",
    weight,
    rawScore,
    weightedScore: weight * rawScore,
    detail: !a.school || !b.school
      ? "学校信息不完整"
      : a.school === b.school
        ? `同校: ${a.school}`
        : `跨校: ${a.school} ↔ ${b.school}`,
  }
}

export function scoreCompatibility(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): ScoreComponent {
  const weight = config.weights.compatibility_score
  const scoreA = a.compatibilityScore ?? config.defaultCompatibilityScore
  const scoreB = b.compatibilityScore ?? config.defaultCompatibilityScore
  const avg = (scoreA + scoreB) / 2
  const rawScore = Math.max(0, Math.min(1, (avg - 1) / 4))
  const hasData = a.compatibilityScore != null || b.compatibilityScore != null
  return {
    factor: "compatibility_score",
    label: "合拍分",
    weight,
    rawScore,
    weightedScore: weight * rawScore,
    detail: hasData
      ? `合拍分均值: ${avg.toFixed(1)}/5.0`
      : `无合拍分数据，使用默认值 ${config.defaultCompatibilityScore}`,
  }
}

export function scoreRepeatPenalty(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): ScoreComponent {
  const weight = config.weights.repeat_penalty
  const histA = a.matchHistory.find((h) => h.name === b.name || h.name === b.submissionId)
  const histB = b.matchHistory.find((h) => h.name === a.name || h.name === a.submissionId)
  const repeatCount = Math.max(histA?.count || 0, histB?.count || 0)
  const rawScore = Math.pow(1 - config.repeatDecayFactor, repeatCount)
  return {
    factor: "repeat_penalty",
    label: "重复配对",
    weight,
    rawScore,
    weightedScore: weight * rawScore,
    detail: repeatCount === 0
      ? "首次配对 (满分)"
      : `历史配对 ${repeatCount} 次 (衰减 ${((1 - rawScore) * 100).toFixed(0)}%)`,
  }
}

