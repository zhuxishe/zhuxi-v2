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

// ── Match result (player-facing) ─────────────────
// Supabase PostgREST may return nested objects or arrays depending on FK cardinality
export type PlayerMatchResult = Record<string, unknown> & {
  id: string
  total_score: number
  created_at: string
}
