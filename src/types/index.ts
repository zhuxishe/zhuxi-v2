// ── Member types ──────────────────────────────────

export type MemberStatus = "pending" | "approved" | "rejected" | "inactive"
export type Gender = "male" | "female" | "other"
export type DegreeLevel = "undergraduate" | "master" | "doctoral" | "exchange" | "language_school" | "other"
export type RiskLevel = "low" | "medium" | "high"

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
