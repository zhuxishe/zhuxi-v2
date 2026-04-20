export type ImportSource = "current" | "legacy-temp" | "temp"

export interface LegacyImportProfile {
  legacy_id: string
  full_name: string
  gender: string | null
  school: string | null
  department: string | null
  interest_tags: string[]
  social_tags: string[]
  game_mode: string | null
  compatibility_score: number | null
  session_count: number | null
  match_history: { name: string; count: number }[]
}

export interface SubmissionImportMetadata {
  source: ImportSource
  normalized_name: string
  raw_first_choice: string
  raw_second_choice: string | null
  script_activity_pref: string | null
  raw_notes: string | null
  matched_member_id?: string | null
  matched_legacy_id?: string | null
  legacy_profile?: LegacyImportProfile | null
  warnings: string[]
}

export function getImportMetadata(value: unknown): SubmissionImportMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const candidate = value as Partial<SubmissionImportMetadata>
  if (!candidate.source || !candidate.normalized_name) return null
  return {
    source: candidate.source,
    normalized_name: candidate.normalized_name,
    raw_first_choice: candidate.raw_first_choice ?? "",
    raw_second_choice: candidate.raw_second_choice ?? null,
    script_activity_pref: candidate.script_activity_pref ?? null,
    raw_notes: candidate.raw_notes ?? null,
    matched_member_id: candidate.matched_member_id ?? null,
    matched_legacy_id: candidate.matched_legacy_id ?? null,
    legacy_profile: candidate.legacy_profile ?? null,
    warnings: candidate.warnings ?? [],
  }
}

export function getImportedHistory(value: unknown): { name: string; count: number }[] {
  const metadata = getImportMetadata(value)
  return metadata?.legacy_profile?.match_history ?? []
}

export function getImportedSource(value: unknown): ImportSource | null {
  return getImportMetadata(value)?.source ?? null
}

export function getImportedLegacyProfile(value: unknown): LegacyImportProfile | null {
  return getImportMetadata(value)?.legacy_profile ?? null
}
