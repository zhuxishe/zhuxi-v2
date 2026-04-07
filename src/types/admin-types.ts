// ── Admin types ──────────────────────────────────

import type { MemberStatus, Gender } from "./member-types"

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
