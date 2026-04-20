import { getSingleRelation } from "@/lib/supabase/relations"
import { getImportMetadata } from "./import-metadata"
import { normalizeImportName } from "./round-import-utils"
import type { ImportDisplayInfo } from "@/components/admin/match-detail-types"
import type { LegacyImportProfile } from "./import-metadata"

type RowMember = {
  member_number?: string | null
  member_identity?: { full_name?: string | null; nickname?: string | null } | { full_name?: string | null; nickname?: string | null }[] | null
}

type SubmissionRow = {
  member_id: string
  import_metadata?: unknown
  member?: RowMember | RowMember[] | null
}

function buildLegacyMap(rows: LegacyImportProfile[]) {
  const map = new Map<string, LegacyImportProfile[]>()
  for (const row of rows) {
    const key = normalizeImportName(row.full_name)
    map.set(key, [...(map.get(key) ?? []), row])
  }
  return map
}

function buildFallbackInfo(
  row: SubmissionRow,
  legacyMap: Map<string, LegacyImportProfile[]>,
): ImportDisplayInfo {
  const member = getSingleRelation(row.member)
  const identity = getSingleRelation(member?.member_identity)
  const normalizedName = normalizeImportName(identity?.full_name ?? identity?.nickname ?? "")
  const matches = normalizedName ? (legacyMap.get(normalizedName) ?? []) : []
  const isTemp = String(member?.member_number ?? "").startsWith("IMP-")

  if (!isTemp) {
    return {
      source: "current",
      inferred: true,
      raw_first_choice: null,
      raw_second_choice: null,
      script_activity_pref: null,
      raw_notes: null,
      warnings: [],
      legacy_profile: null,
    }
  }

  return {
    source: matches.length === 1 ? "legacy-temp" : "temp",
    inferred: true,
    raw_first_choice: null,
    raw_second_choice: null,
    script_activity_pref: null,
    raw_notes: null,
    warnings: matches.length > 1 ? ["ambiguous_name_match"] : [],
    legacy_profile: matches.length === 1 ? matches[0] : null,
  }
}

export function buildImportInfoMap(
  rows: SubmissionRow[],
  legacyRows: LegacyImportProfile[],
): Record<string, ImportDisplayInfo> {
  const map: Record<string, ImportDisplayInfo> = {}
  const legacyMap = buildLegacyMap(legacyRows)
  for (const row of rows) {
    const metadata = getImportMetadata(row.import_metadata)
    map[row.member_id] = metadata
      ? {
          source: metadata.source,
          inferred: false,
          raw_first_choice: metadata.raw_first_choice ?? null,
          raw_second_choice: metadata.raw_second_choice ?? null,
          script_activity_pref: metadata.script_activity_pref ?? null,
          raw_notes: metadata.raw_notes ?? null,
          warnings: metadata.warnings ?? [],
          legacy_profile: metadata.legacy_profile ?? null,
        }
      : buildFallbackInfo(row, legacyMap)
  }
  return map
}
