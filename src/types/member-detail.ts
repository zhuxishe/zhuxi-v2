/** Types for the admin member detail view (fetchMemberDetail return shape) */

export interface MemberIdentityRow {
  id: string
  member_id: string
  full_name: string
  nickname: string | null
  gender: string
  age_range: string
  nationality: string
  current_city: string
  school_name: string | null
  department: string | null
  degree_level: string | null
  course_language: string | null
  enrollment_year: number | null
  hobby_tags: string[]
  activity_type_tags: string[]
  personality_self_tags: string[]
  taboo_tags: string[]
  height_weight: string | null
  phone: string | null
  sns_accounts: unknown
  created_at: string
  updated_at: string
}

export interface InterviewEvaluationRow {
  id: string
  member_id: string
  interviewer_id: string
  interviewer_name: string | null
  interviewer_notes: string | null
  communication: number
  articulation: number
  enthusiasm: number
  sincerity: number
  social_comfort: number
  humor: number
  emotional_stability: number
  boundary_respect: number
  team_orientation: number
  interest_alignment: number
  japanese_ability: number
  time_commitment: number
  leadership_potential: number
  openness: number
  responsibility: number
  first_impression: number
  overall_recommendation: number
  attractiveness_score: number | null
  risk_level: string
  risk_notes: string | null
  created_at: string
  updated_at: string
}

export interface MemberLanguageRow {
  id: string
  member_id: string
  communication_language_pref: string[]
  japanese_level: string | null
  created_at: string
  updated_at: string
}

export interface MemberInterestsRow {
  id: string
  member_id: string
  activity_area: string | null
  nearest_station: string | null
  graduation_year: number | null
  game_type_pref: string | null
  scenario_mode_pref: string[]
  scenario_theme_tags: string[]
  ideal_group_size: string | null
  script_preference: string[]
  non_script_preference: string[]
  activity_frequency: string | null
  preferred_time_slots: string[]
  budget_range: string | null
  travel_radius: string | null
  social_goal_primary: string | null
  social_goal_secondary: string | null
  accept_beginners: boolean | null
  accept_cross_school: boolean | null
  created_at: string
  updated_at: string
}

export interface MemberPersonalityRow {
  id: string
  member_id: string
  extroversion: number
  initiative: number
  expression_style_tags: string[]
  group_role_tags: string[]
  warmup_speed: string | null
  planning_style: string | null
  coop_compete_tendency: string | null
  emotional_stability: number
  boundary_strength: string | null
  reply_speed: string | null
  created_at: string
  updated_at: string
  [key: string]: string | number | string[] | null
}

export interface MemberBoundariesRow {
  id: string
  member_id: string
  preferred_age_range: string | null
  preferred_gender_mix: string | null
  taboo_tags: string[]
  deal_breakers: string[]
  boundary_notes: string | null
  created_at: string
  updated_at: string
}

export interface MemberVerificationRow {
  id: string
  member_id: string
  student_id_verified: boolean
  photo_verified: boolean
  verified_at: string | null
  verified_by: string | null
  created_at: string
  updated_at: string
}

export interface MemberDetail {
  id: string
  member_number: string | null
  status: string
  email: string | null
  interview_date: string | null
  interviewer: string | null
  attractiveness_score: number | null
  membership_type: string
  line_user_id: string | null
  user_id: string | null
  created_at: string
  updated_at: string
  member_identity: MemberIdentityRow | null
  interview_evaluations: InterviewEvaluationRow[] | InterviewEvaluationRow | null
  member_language: MemberLanguageRow | null
  member_interests: MemberInterestsRow | null
  member_personality: MemberPersonalityRow | null
  member_boundaries: MemberBoundariesRow | null
  member_verification: MemberVerificationRow | null
}
