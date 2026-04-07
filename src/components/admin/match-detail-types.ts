/** Types shared across match detail admin components */

export interface MemberIdentityInfo {
  full_name: string
  nickname: string | null
  school_name: string | null
  gender: string
  hobby_tags: string[]
  nationality: string
  degree_level: string | null
  department: string | null
}

export interface MemberInterestsInfo {
  game_type_pref: string | null
  scenario_theme_tags: string[]
  preferred_time_slots: string[]
  social_goal_primary: string | null
}

export interface MemberPersonalityInfo {
  expression_style_tags: string[]
  group_role_tags: string[]
  extroversion: number
  warmup_speed: string | null
}

export interface MemberBoundariesInfo {
  preferred_gender_mix: string | null
}

export interface EnrichedMember {
  id: string
  member_number: string | null
  member_identity: MemberIdentityInfo | null
  member_interests: MemberInterestsInfo | null
  member_personality: MemberPersonalityInfo | null
  member_boundaries: MemberBoundariesInfo | null
}

export interface EnrichedMatchResult {
  id: string
  total_score: number
  best_slot: string | null
  rank: number | null
  status: string
  score_breakdown: unknown
  member_a: EnrichedMember | null
  member_b: EnrichedMember | null
}

export interface PairRelationship {
  member_a_id: string
  member_b_id: string
  pair_count: number
  status: string
  avg_score: number | null
}
