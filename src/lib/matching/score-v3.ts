import { scoreInterestOverlap } from "./score-factors"
import { jaccard } from "./similarity"
import type { ActivityFeedbackRecord, MatchCandidate, ScoreComponent, ScoringPolicy } from "./types"

export function scoreScoringInterestOverlap(a: MatchCandidate, b: MatchCandidate, weight: number): ScoreComponent {
  return scoreInterestOverlap(
    { ...a, interestTags: a.scoringInterestTags ?? a.interestTags },
    { ...b, interestTags: b.scoringInterestTags ?? b.interestTags }, weight,
  )
}

export function scoreGameModeSet(a: MatchCandidate, b: MatchCandidate, weight: number): ScoreComponent {
  const modesA = [...new Set(a.gameModes ?? (a.gameMode ? [a.gameMode] : []))]
  const modesB = [...new Set(b.gameModes ?? (b.gameMode ? [b.gameMode] : []))]
  const rawScore = !modesA.length || !modesB.length ? 0.5
    : modesA.includes("都行") || modesB.includes("都行") ? 0.7 : jaccard(modesA, modesB)
  return { factor: "gameMode_match", label: "游戏偏好", weight, rawScore, weightedScore: rawScore * weight,
    detail: modesA.length && modesB.length
      ? `按多选集合比较：${modesA.join("、")} ↔ ${modesB.join("、")}；顺序不影响得分`
      : "偏好数据不完整，使用中性分" }
}

const EXPERIENCE_LABELS = ["0次", "1–2次", "3–5次", "6–10次", "11次及以上"]
export function experienceBucket(count: number): number {
  return count <= 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4
}

export function scoreExperienceBucket(a: MatchCandidate, b: MatchCandidate, weight: number): ScoreComponent {
  const bucketA = experienceBucket(a.level), bucketB = experienceBucket(b.level)
  const rawScore = 1 - Math.abs(bucketA - bucketB) / 4
  return { factor: "level_proximity", label: "活动经验", weight, rawScore, weightedScore: rawScore * weight,
    detail: `${a.name}：${EXPERIENCE_LABELS[bucketA]}；${b.name}：${EXPERIENCE_LABELS[bucketB]}（仅软评分）` }
}

/** An edited direction in one activity remains one observation. */
function directionalFeedback(reviews: ActivityFeedbackRecord[], reviewer: string, reviewee: string) {
  const latest = new Map<string, ActivityFeedbackRecord>()
  for (const review of reviews) {
    if (review.reviewer_id !== reviewer || review.reviewee_id !== reviewee) continue
    const previous = latest.get(review.round_id)
    if (!previous || review.version > previous.version || (review.version === previous.version && review.id > previous.id)) {
      latest.set(review.round_id, review)
    }
  }
  const count = latest.size
  return { count, rating: (6 + [...latest.values()].reduce((sum, review) => sum + review.score, 0)) / (2 + count) }
}

export function pairActivityFeedback(a: string, b: string, policy: ScoringPolicy) {
  const forward = directionalFeedback(policy.activityFeedback, a, b)
  const reverse = directionalFeedback(policy.activityFeedback, b, a)
  return { forward, reverse, rating: Math.min(forward.rating, reverse.rating),
    hasFeedback: forward.count + reverse.count > 0 }
}

export function scoreActivityFeedback(a: MatchCandidate, b: MatchCandidate, weight: number, policy: ScoringPolicy): ScoreComponent {
  const { forward, reverse, rating } = pairActivityFeedback(a.submissionId, b.submissionId, policy)
  const rawScore = (rating - 1) / 4
  return { factor: "activity_feedback", label: "双方活动互评", weight, rawScore, weightedScore: rawScore * weight,
    detail: `双方各加入2个3分中性样本；有效活动数${forward.count}/${reverse.count}，校正后${forward.rating.toFixed(2)}/${reverse.rating.toFixed(2)}分，取较低值` }
}
