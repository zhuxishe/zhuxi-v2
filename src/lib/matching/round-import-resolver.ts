import type { CurrentImportMember, LegacyImportMember, ParsedImportRow, PreparedImportRow } from "./round-import-types"
import { normalizeImportName } from "./round-import-utils"

function dedupeCurrentMembers(members: CurrentImportMember[]): CurrentImportMember[] {
  const unique = new Map<string, CurrentImportMember>()
  for (const member of members) unique.set(member.id, member)
  return Array.from(unique.values())
}

function buildCurrentMatches(row: ParsedImportRow, members: CurrentImportMember[]): CurrentImportMember[] {
  const matches = members.filter((member) => {
    const fullName = member.full_name ? normalizeImportName(member.full_name) : ""
    const nickname = member.nickname ? normalizeImportName(member.nickname) : ""
    return row.normalizedName === fullName || row.normalizedName === nickname
  })
  return dedupeCurrentMembers(matches)
}

function buildLegacyMatches(row: ParsedImportRow, members: LegacyImportMember[]): LegacyImportMember[] {
  return members.filter((member) => row.normalizedName === normalizeImportName(member.full_name))
}

export function resolveImportRows(
  rows: ParsedImportRow[],
  currentMembers: CurrentImportMember[],
  legacyMembers: LegacyImportMember[],
): PreparedImportRow[] {
  return rows.map((row) => {
    const currentMatches = buildCurrentMatches(row, currentMembers)
    if (currentMatches.length === 1) {
      return {
        ...row,
        source: "current",
        existingMemberId: currentMatches[0].id,
        legacyProfile: null,
        importMetadata: {
          ...row.importMetadata,
          source: "current",
          matched_member_id: currentMatches[0].id,
        },
      }
    }

    const warnings = currentMatches.length > 1 ? ["ambiguous_name_match"] : []
    const legacyMatches = currentMatches.length > 0 ? [] : buildLegacyMatches(row, legacyMembers)
    if (legacyMatches.length === 1) {
      return {
        ...row,
        source: "legacy-temp",
        existingMemberId: null,
        legacyProfile: legacyMatches[0],
        importMetadata: {
          ...row.importMetadata,
          source: "legacy-temp",
          matched_legacy_id: legacyMatches[0].legacy_id,
          legacy_profile: legacyMatches[0],
          warnings,
        },
      }
    }

    return {
      ...row,
      source: "temp",
      existingMemberId: null,
      legacyProfile: null,
      importMetadata: {
        ...row.importMetadata,
        source: currentMatches.length > 0 ? "temp" : "temp",
        warnings: legacyMatches.length > 1 ? [...warnings, "ambiguous_name_match"] : warnings,
      },
    }
  })
}
