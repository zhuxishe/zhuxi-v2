import type { Availability } from "./types"
import type { ImportSource, SubmissionImportMetadata } from "./import-metadata"
import type { CurrentImportMember, ImportSummary, LegacyOption, ManualSelfGender } from "./round-import-types"

export const IMPORT_FIELDS = ["game_type_pref", "gender_pref", "availability", "script_activity_pref", "message"] as const
export type ImportField = typeof IMPORT_FIELDS[number]
export type ImportFieldChoice = "keep" | "excel" | "clear"
export interface ImportRowChoice {
  // member:<UUID>, legacy:<UUID>, new. Suggestions are never confirmations.
  target: string
  gender?: ManualSelfGender
  temporaryLabel?: string
  fields?: Partial<Record<ImportField, ImportFieldChoice>>
}
export type ImportChoices = Record<string, ImportRowChoice>
export interface ImportDiff {
  field: ImportField
  label: string
  current: unknown
  excel: unknown
  choice: ImportFieldChoice
  nullable: boolean
  blank: boolean
  different: boolean
}
export interface ImportReviewRow {
  rowNumber: number
  name: string
  suggestedMemberId: string | null
  suggestedLegacyIds: string[]
  target: string
  memberId: string | null
  source: ImportSource | null
  reusedTemporary: boolean
  cancelled: boolean
  diffs: ImportDiff[]
  errors: string[]
  warnings: string[]
}
export interface ImportMemberOption extends CurrentImportMember {
  temporary: boolean
}
export interface ImportReceipt {
  id: string
  round_id: string
  status: "succeeded" | "failed"
  created_at: string
  completed_at: string
  reason: string
  error_code: string | null
  error_message: string | null
  summary: ImportSummary & { insertedCount: number; updatedCount: number; unchangedCount: number; affectedBatchIds: string[] }
}
export interface ImportReview {
  rows: ImportReviewRow[]
  memberOptions: ImportMemberOption[]
  legacyOptions: LegacyOption[]
  planToken: string | null
  warnings: string[]
  affectedBatchIds: string[]
}
export interface ImportPlanRow {
  row_number: number
  source: ImportSource
  identity_key: string | null
  existing_member_id: string | null
  expected_member_token: string | null
  expected_submission: { id: string; updated_at: string } | null
  expected_legacy?: { id: string; token: string } | null
  answers: {
    game_type_pref: string
    gender_pref: string
    availability: Availability
    message: string | null
    import_metadata: SubmissionImportMetadata | Record<string, unknown> | null
  }
  // Only used to CREATE a new temporary member; never rewrites an existing profile.
  temp_profile: {
    full_name: string
    gender: ManualSelfGender
    school: string | null
    department: string | null
    interest_tags: string[]
    social_tags: string[]
    game_mode: string | null
    compatibility_score: number | null
    session_count: number | null
  } | null
}
export interface ImportPlan {
  version: 1
  roundId: string
  actorId: string
  fileHash: string
  expiresAt: number
  roundToken: string
  rows: ImportPlanRow[]
}
export interface ImportDatabaseState {
  legacy_tokens?: Record<string, string>
  affected_batch_ids?: string[]
  round: Record<string, any>
  round_token: string
  member_tokens: Record<string, string>
  identities: Array<{ identity_key: string; member_id: string | null }>
  temporary_members: ImportMemberOption[]
  submissions: Array<Record<string, any>>
}
