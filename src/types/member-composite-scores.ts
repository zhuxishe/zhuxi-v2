export interface MemberCompositeScoreValues {
  attractiveness_score: number
  sexual_value_score: number
  economic_value_score: number
  emotional_value_score: number
}

export interface MemberCompositeScores {
  member_id: string
  attractiveness_score: number | null
  sexual_value_score: number | null
  economic_value_score: number | null
  emotional_value_score: number | null
  updated_at: string | null
}
