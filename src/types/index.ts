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
  user_id: string
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
