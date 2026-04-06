// ── Member types ──────────────────────────────────

export type MemberStatus = "pending" | "approved" | "rejected" | "inactive"
export type Gender = "male" | "female" | "other"
export type DegreeLevel = "undergraduate" | "master" | "doctoral" | "exchange" | "language_school" | "other"

// ── Pre-interview form ───────────────────────────

export interface PreInterviewFormData {
  // Step 1: Basic info
  full_name: string
  nickname: string
  gender: Gender
  age_range: string
  nationality: string
  current_city: string
  // Step 2: Education
  school_name: string
  department: string
  degree_level: string
  course_language: string
  enrollment_year: number | null
  // Step 3: Interests
  hobby_tags: string[]
  activity_type_tags: string[]
  // Step 4: Self-assessment
  personality_self_tags: string[]
  taboo_tags: string[]
}

export const EMPTY_FORM: PreInterviewFormData = {
  full_name: "",
  nickname: "",
  gender: "male",
  age_range: "",
  nationality: "",
  current_city: "",
  school_name: "",
  department: "",
  degree_level: "",
  course_language: "",
  enrollment_year: null,
  hobby_tags: [],
  activity_type_tags: [],
  personality_self_tags: [],
  taboo_tags: [],
}

// ── Admin types ──────────────────────────────────

export type RiskLevel = "low" | "medium" | "high"
export type AdminRole = "admin" | "super_admin"

export interface AdminUser {
  id: string
  user_id: string | null
  email: string
  name: string
  role: AdminRole
  created_at: string
}

export interface MemberWithIdentity {
  id: string
  member_number: string | null
  status: MemberStatus
  interview_date: string | null
  interviewer: string | null
  attractiveness_score: number | null
  created_at: string
  member_identity: {
    full_name: string
    nickname: string | null
    gender: Gender
    age_range: string
    nationality: string
    current_city: string
    school_name: string | null
    department: string | null
  } | null
}

export interface InterviewEvalFormData {
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
  risk_level: RiskLevel
  risk_notes: string
  interviewer_notes: string
  attractiveness_score: number
}

// ── Supplementary form (3a) ──────────────────────

export interface SupplementaryFormData {
  // Step 1: Location
  activity_area: string
  nearest_station: string
  graduation_year: number | null
  // Step 2: Language
  communication_language_pref: string[]
  japanese_level: string
  // Step 3: Activity preferences
  scenario_mode_pref: string[]
  scenario_theme_tags: string[]
  ideal_group_size: string
  script_preference: string[]
  non_script_preference: string[]
  activity_frequency: string
  preferred_time_slots: string[]
  budget_range: string
  travel_radius: string
  // Step 4: Social goals
  social_goal_primary: string
  social_goal_secondary: string
  accept_beginners: boolean
  accept_cross_school: boolean
}

export const EMPTY_SUPPLEMENTARY: SupplementaryFormData = {
  activity_area: "",
  nearest_station: "",
  graduation_year: null,
  communication_language_pref: [],
  japanese_level: "",
  scenario_mode_pref: [],
  scenario_theme_tags: [],
  ideal_group_size: "",
  script_preference: [],
  non_script_preference: [],
  activity_frequency: "",
  preferred_time_slots: [],
  budget_range: "",
  travel_radius: "",
  social_goal_primary: "",
  social_goal_secondary: "",
  accept_beginners: true,
  accept_cross_school: true,
}

// ── Personality self-assessment (3b) ─────────────

export interface PersonalitySelfData {
  extroversion: number
  initiative: number
  expression_style_tags: string[]
  group_role_tags: string[]
  warmup_speed: string
  planning_style: string
  coop_compete_tendency: string
  emotional_stability: number
  boundary_strength: string
  reply_speed: string
}

export const EMPTY_PERSONALITY: PersonalitySelfData = {
  extroversion: 3,
  initiative: 3,
  expression_style_tags: [],
  group_role_tags: [],
  warmup_speed: "",
  planning_style: "",
  coop_compete_tendency: "",
  emotional_stability: 3,
  boundary_strength: "",
  reply_speed: "",
}

// ── Player profile ──────────────────────────────

export interface PlayerProfile {
  id: string
  member_number: string | null
  status: MemberStatus
  email: string | null
  member_identity: {
    full_name: string
    nickname: string | null
  } | null
  member_language: Record<string, unknown> | null
  member_interests: Record<string, unknown> | null
  member_personality: Record<string, unknown> | null
  member_boundaries: Record<string, unknown> | null
}

// ── Tag option types ─────────────────────────────

export interface TagOption {
  value: string
  label_zh: string
  label_ja: string
}

export interface TagCategory {
  key: string
  label_zh: string
  label_ja: string
  options: TagOption[]
  multiple: boolean
  max?: number
}
