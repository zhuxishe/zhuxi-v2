/**
 * 人格兼容性 + 游戏偏好 + 经验等级评分因子
 */

import type { MatchCandidate, ScoreComponent } from "./types"

export function scoreGameModeMatch(
  a: MatchCandidate,
  b: MatchCandidate,
  weight: number,
): ScoreComponent {
  let rawScore = 0.5
  if (a.gameMode && b.gameMode) {
    if (a.gameMode === b.gameMode) rawScore = 1.0
    else if (a.gameMode === "都行" || b.gameMode === "都行") rawScore = 0.7
    else rawScore = 0.3
  }
  return {
    factor: "gameMode_match",
    label: "游戏偏好",
    weight,
    rawScore,
    weightedScore: weight * rawScore,
    detail: a.gameMode && b.gameMode
      ? `${a.name}:${a.gameMode} ↔ ${b.name}:${b.gameMode}`
      : "偏好数据不完整",
  }
}

export function scoreLevelProximity(
  a: MatchCandidate,
  b: MatchCandidate,
  weight: number,
): ScoreComponent {
  const diff = Math.abs(a.level - b.level)
  const rawScore = diff === 0 ? 1.0 : diff === 1 ? 0.7 : diff === 2 ? 0.4 : 0.1
  return {
    factor: "level_proximity",
    label: "经验等级",
    weight,
    rawScore,
    weightedScore: weight * rawScore,
    detail: `${a.name}:Lv${a.level} ↔ ${b.name}:Lv${b.level} (差${diff}级)`,
  }
}

interface DimWeights { E: number; A: number; O: number; C: number; N: number }

export function scorePersonalityCompatibility(
  a: MatchCandidate,
  b: MatchCandidate,
  weight: number,
  dimWeights?: DimWeights,
): ScoreComponent {
  if (!a.quizScores || !b.quizScores) {
    return {
      factor: "personality_compatibility",
      label: "人格兼容",
      weight,
      rawScore: 0.5,
      weightedScore: weight * 0.5,
      detail: "一方或双方未完成性格测试，使用默认分",
    }
  }

  const qa = a.quizScores
  const qb = b.quizScores

  // E and A: similarity is better (strongest predictor for friendship)
  const eSim = 1 - Math.abs(qa.E - qb.E) / 100
  const aSim = 1 - Math.abs(qa.A - qb.A) / 100

  // O: moderate difference is complementary (20-50 gap optimal)
  const oDiff = Math.abs(qa.O - qb.O)
  const oScore = oDiff >= 20 && oDiff <= 50 ? 1.0 : oDiff < 20 ? 0.7 : 0.5

  // C: similarity is better
  const cSim = 1 - Math.abs(qa.C - qb.C) / 100

  // ES (emotional stability): similarity is better
  const esA = 100 - qa.N
  const esB = 100 - qb.N
  const esSim = 1 - Math.abs(esA - esB) / 100

  // Weighted average — use DB config weights if provided, else default
  const w = dimWeights ?? { E: 0.3, A: 0.3, O: 0.15, C: 0.1, N: 0.15 }
  const rawScore = eSim * w.E + aSim * w.A + oScore * w.O + cSim * w.C + esSim * w.N

  return {
    factor: "personality_compatibility",
    label: "人格兼容",
    weight,
    rawScore,
    weightedScore: weight * rawScore,
    detail: `E相似:${(eSim * 100).toFixed(0)}% A相似:${(aSim * 100).toFixed(0)}% O互补:${(oScore * 100).toFixed(0)}%`,
  }
}
