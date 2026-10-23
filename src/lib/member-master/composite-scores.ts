import type { MemberCompositeScores, MemberCompositeScoreValues } from "@/types/member-composite-scores"

export const COMPOSITE_SCORE_FIELDS = [
  { key: "attractiveness_score", label: "A. 颜值分", description: "外貌整体印象" },
  { key: "sexual_value_score", label: "B. 性价值", description: "" },
  { key: "economic_value_score", label: "C. 经济价值", description: "" },
  { key: "emotional_value_score", label: "D. 情绪价值", description: "" },
] as const

export function compositeScoreFormValues(scores: MemberCompositeScores): MemberCompositeScoreValues {
  return {
    attractiveness_score: scores.attractiveness_score ?? 3,
    sexual_value_score: scores.sexual_value_score ?? 3,
    economic_value_score: scores.economic_value_score ?? 3,
    emotional_value_score: scores.emotional_value_score ?? 3,
  }
}

export function isValidCompositeScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
}

export function validateCompositeScoreValues(value: unknown): MemberCompositeScoreValues | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (COMPOSITE_SCORE_FIELDS.some(({ key }) => !isValidCompositeScore(input[key]))) return null
  return Object.fromEntries(COMPOSITE_SCORE_FIELDS.map(({ key }) => [key, input[key]])) as unknown as MemberCompositeScoreValues
}

export function normalizeMemberCompositeScores(value: unknown): MemberCompositeScores {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("综合评分数据格式无效")
  const input = value as Record<string, unknown>
  if (typeof input.member_id !== "string" || !input.member_id) throw new Error("综合评分缺少成员 ID")
  for (const { key } of COMPOSITE_SCORE_FIELDS) {
    if (input[key] !== null && !isValidCompositeScore(input[key])) throw new Error("综合评分数据格式无效")
  }
  if (input.updated_at !== null && (typeof input.updated_at !== "string" || !Number.isFinite(Date.parse(input.updated_at)))) {
    throw new Error("综合评分缺少有效版本")
  }
  return {
    member_id: input.member_id,
    attractiveness_score: input.attractiveness_score as number | null,
    sexual_value_score: input.sexual_value_score as number | null,
    economic_value_score: input.economic_value_score as number | null,
    emotional_value_score: input.emotional_value_score as number | null,
    updated_at: input.updated_at as string | null,
  }
}
