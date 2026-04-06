/**
 * 竹溪社首轮匹配 — 7因子评分器
 */

import type { MatchCandidate, MatchingConfig, PairScore, ScoreComponent } from "./types"
import { checkHardConstraints } from "./constraints"
import { jaccard, complementScore } from "./similarity"
import { hasCommonSlot } from "./time-filter"

/**
 * 计算两个候选人的兼容度评分
 */
export function scorePair(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): PairScore {
  const base = {
    userA: a.submissionId,
    userB: b.submissionId,
  }

  // 检查硬约束
  const constraint = checkHardConstraints(a, b, config)
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

  // 8因子评分（personality_compatibility 替代 social_complement）
  const breakdown: ScoreComponent[] = [
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

  // 生成中文摘要
  const topFactors = breakdown
    .filter((c) => c.rawScore > 0.5)
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

// ── 各因子实现 ──

function scoreInterestOverlap(
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

function scoreSocialComplement(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): ScoreComponent {
  const weight = config.weights.social_complement
  // 合并：表单社交风格 + 档案社交标签
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

function scoreSchoolDiversity(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): ScoreComponent {
  const weight = config.weights.school_diversity
  let rawScore: number
  if (!a.school || !b.school) {
    rawScore = 0.5 // 未知学校给中间分
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

function scoreCompatibility(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): ScoreComponent {
  const weight = config.weights.compatibility_score
  const scoreA = a.compatibilityScore ?? config.defaultCompatibilityScore
  const scoreB = b.compatibilityScore ?? config.defaultCompatibilityScore
  // 两人合拍分的平均值，归一化到 0-1 (原始范围 1-5)
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

function scoreRepeatPenalty(
  a: MatchCandidate,
  b: MatchCandidate,
  config: MatchingConfig,
): ScoreComponent {
  const weight = config.weights.repeat_penalty
  // 查找历史配对次数
  const histA = a.matchHistory.find((h) => h.name === b.name)
  const histB = b.matchHistory.find((h) => h.name === a.name)
  const repeatCount = Math.max(histA?.count || 0, histB?.count || 0)

  // 首次配对满分，每次重复衰减
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

function scoreGameModeMatch(
  a: MatchCandidate,
  b: MatchCandidate,
  weight: number,
): ScoreComponent {
  // 比较数据库长期偏好与本次表单选择
  let rawScore = 0.5 // 默认中间分
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

function scoreLevelProximity(
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

function scorePersonalityCompatibility(
  a: MatchCandidate,
  b: MatchCandidate,
  weight: number,
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

  // E和A维度: 相似性越高越好（友谊形成最强预测因子）
  const eSim = 1 - Math.abs(qa.E - qb.E) / 100
  const aSim = 1 - Math.abs(qa.A - qb.A) / 100

  // O维度: 适度差异为互补（20-50分差最优）
  const oDiff = Math.abs(qa.O - qb.O)
  const oScore = oDiff >= 20 && oDiff <= 50 ? 1.0 : oDiff < 20 ? 0.7 : 0.5

  // C维度: 相似性较好
  const cSim = 1 - Math.abs(qa.C - qb.C) / 100

  // ES(情绪稳定性): 相似性较好
  const esA = 100 - qa.N
  const esB = 100 - qb.N
  const esSim = 1 - Math.abs(esA - esB) / 100

  // 加权平均 (E:30% A:30% O:15% C:10% ES:15%)
  const rawScore = eSim * 0.3 + aSim * 0.3 + oScore * 0.15 + cSim * 0.1 + esSim * 0.15

  return {
    factor: "personality_compatibility",
    label: "人格兼容",
    weight,
    rawScore,
    weightedScore: weight * rawScore,
    detail: `E相似:${(eSim * 100).toFixed(0)}% A相似:${(aSim * 100).toFixed(0)}% O互补:${(oScore * 100).toFixed(0)}%`,
  }
}
