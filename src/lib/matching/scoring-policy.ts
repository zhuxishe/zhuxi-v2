import { DEFAULT_CONFIG } from "./config"
import type { MatchingConfig, ScoringPolicy } from "./types"

const DIMENSIONS = ["E", "A", "O", "C", "N"] as const

/** Reject incomplete captured configuration rather than silently changing a run. */
export function validateScoringPolicy(value: unknown): asserts value is ScoringPolicy {
  if (!value || typeof value !== "object") throw new Error("评分策略缺失")
  const policy = value as Partial<ScoringPolicy>
  if (Object.keys(policy).some((key) => !["version", "quizVersionId", "dimensionWeights", "activityFeedback"].includes(key))
      || policy.version !== "weighted_feedback:1" || typeof policy.quizVersionId !== "string" || !policy.quizVersionId) {
    throw new Error("评分策略版本或已发布人格问卷版本无效")
  }
  const weights = policy.dimensionWeights
  if (!weights || Object.keys(weights).some((key) => !DIMENSIONS.includes(key as typeof DIMENSIONS[number]))
      || DIMENSIONS.some((key) => !Number.isFinite(weights[key]) || weights[key] < 0 || weights[key] > 1)
      // Match the existing questionnaire publish validator, in TS and SQL.
      || Math.abs(DIMENSIONS.reduce((sum, key) => sum + weights[key], 0) - 1) > 0.000001) {
    throw new Error("已发布人格维度权重必须完整且合计为 1")
  }
  if (!Array.isArray(policy.activityFeedback) || policy.activityFeedback.some((review) => !review
      || Object.keys(review).some((key) => !["id", "round_id", "reviewer_id", "reviewee_id", "score", "version"].includes(key))
      || [review.id, review.round_id, review.reviewer_id, review.reviewee_id].some((id) => typeof id !== "string" || !id)
      || review.reviewer_id === review.reviewee_id || !Number.isFinite(review.score)
      || review.score < 1 || review.score > 5 || !Number.isInteger(review.score * 2)
      || !Number.isInteger(review.version) || review.version < 1)) {
    throw new Error("活动互评快照无效")
  }
}

/** The original DEFAULT_CONFIG is deliberately retained for version 2 recovery. */
export function createScoringV3Config(policy: ScoringPolicy): MatchingConfig {
  validateScoringPolicy(policy)
  return {
    ...structuredClone(DEFAULT_CONFIG),
    weights: {
      interest_overlap: 25, social_complement: 0, school_diversity: 5,
      compatibility_score: 0, repeat_penalty: 15, gameMode_match: 10,
      level_proximity: 10, personality_compatibility: 25, activity_feedback: 10,
    },
    scoringPolicy: structuredClone(policy),
  }
}
