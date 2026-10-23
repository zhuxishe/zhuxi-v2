/**
 * 竹溪社首轮匹配 — 8因子评分器（入口）
 */

import type { MatchCandidate, MatchingConfig, PairScore, ScoreComponent } from "./types"
import type { PairRelation } from "./pair-history"
import { checkHardConstraints } from "./constraints"
import { hasCommonSlot } from "./time-filter"
import {
  scoreInterestOverlap,
  scoreSocialComplement,
  scoreSchoolDiversity,
  scoreCompatibility,
  scoreRepeatPenalty,
} from "./score-factors"
import {
  scoreGameModeMatch,
  scoreLevelProximity,
  scorePersonalityCompatibility,
} from "./score-personality"
import { scoreActivityFeedback, scoreExperienceBucket, scoreGameModeSet, scoreScoringInterestOverlap } from "./score-v3"

/**
 * 计算两个候选人的兼容度评分
 */
export function scorePair(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
  pairRelations?: Map<string, PairRelation>,
): PairScore {
  const base = {
    userA: a.submissionId,
    userB: b.submissionId,
  }

  // 检查硬约束（含黑名单/冷却期）
  const constraint = checkHardConstraints(a, b, config, pairRelations)
  if (!constraint.passed) {
    return {
      ...base,
      totalScore: 0,
      breakdown: [],
      hardVeto: true,
      vetoReasons: constraint.reasons,
      explanationZh: `硬约束不通过: ${constraint.reasons.join("; ")}`,
    }
  }

  // 检查时间兼容（也是硬约束）
  if (!hasCommonSlot(a.availability, b.availability)) {
    return {
      ...base,
      totalScore: 0,
      breakdown: [],
      hardVeto: true,
      vetoReasons: ["无共同可用时段"],
      explanationZh: "无共同可用时段",
    }
  }

  return scorePairFactors(a, b, config)
}

/** Original eight factors; the caller validates its duo or whole-pool context. */
export function scorePairFactors(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): PairScore {
  const base = { userA: a.submissionId, userB: b.submissionId }

  // The absent policy is the original version 2 path, including its output.
  const policy = config.scoringPolicy
  const breakdown: ScoreComponent[] = policy ? [
    scoreScoringInterestOverlap(a, b, config.weights.interest_overlap),
    { factor: "social_complement", label: "社交互补", weight: 0, rawScore: 0, weightedScore: 0, detail: "当前版本不单独计分" },
    scoreSchoolDiversity(a, b, config),
    { factor: "compatibility_score", label: "管理员综合分", weight: 0, rawScore: 0, weightedScore: 0, detail: "管理员A/B/C/D分不参与当前版本匹配" },
    scoreRepeatPenalty(a, b, config),
    scoreGameModeSet(a, b, config.weights.gameMode_match),
    scoreExperienceBucket(a, b, config.weights.level_proximity),
    scorePersonalityCompatibility(a, b, config.weights.personality_compatibility, policy.dimensionWeights),
    scoreActivityFeedback(a, b, config.weights.activity_feedback ?? 0, policy),
  ] : [
    scoreInterestOverlap(a, b, config.weights.interest_overlap),
    scoreSocialComplement(a, b, config),
    scoreSchoolDiversity(a, b, config),
    scoreCompatibility(a, b, config),
    scoreRepeatPenalty(a, b, config),
    scoreGameModeMatch(a, b, config.weights.gameMode_match),
    scoreLevelProximity(a, b, config.weights.level_proximity),
    scorePersonalityCompatibility(a, b, config.weights.personality_compatibility),
  ]

  const totalScore = breakdown.reduce((sum, c) => sum + c.weightedScore, 0)

  const topFactors = breakdown
    .filter((c) => c.rawScore > 0.5 && (!policy || c.weightedScore > 0))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 3)
    .map((c) => c.label)
    .join("、")

  return {
    ...base,
    totalScore,
    breakdown,
    hardVeto: false,
    vetoReasons: [],
    explanationZh: topFactors ? `亮点: ${topFactors}` : "基础兼容",
  }
}
