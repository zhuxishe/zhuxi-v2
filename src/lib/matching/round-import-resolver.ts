import type {
  CurrentImportMember,
  ImportPreviewRow,
  LegacyImportMember,
  LegacyOption,
  LegacyOverrideMap,
  ParsedImportRow,
  PreparedImportRow,
} from "./round-import-types"
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

function toLegacyOption(member: LegacyImportMember): LegacyOption {
  return {
    id: member.legacy_id,
    name: member.full_name,
    gender: member.gender,
    school: member.school,
    department: member.department,
  }
}

export function buildImportPreview(
  rows: ParsedImportRow[],
  currentMembers: CurrentImportMember[],
  legacyMembers: LegacyImportMember[],
): ImportPreviewRow[] {
  return rows.map((row) => {
    const currentMatches = buildCurrentMatches(row, currentMembers)
    const legacyMatches = currentMatches.length > 0 ? [] : buildLegacyMatches(row, legacyMembers)
    return {
      rowNumber: row.rowNumber,
      name: row.name,
      gameTypePref: row.gameTypePref,
      genderPref: row.genderPref,
      availabilityDays: Object.keys(row.availability).length,
      message: row.message,
      currentMatch: currentMatches.length === 1
        ? { id: currentMatches[0].id, name: currentMatches[0].full_name ?? currentMatches[0].nickname ?? "未知" }
        : null,
      exactLegacyMatches: legacyMatches.map(toLegacyOption),
      warnings: currentMatches.length > 1 ? ["ambiguous_name_match"] : [],
    }
  })
}

export function resolveImportRows(
  rows: ParsedImportRow[],
  currentMembers: CurrentImportMember[],
  legacyMembers: LegacyImportMember[],
  legacyOverrides: LegacyOverrideMap = {},
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
    const overrideId = legacyOverrides[String(row.rowNumber)]
    if (overrideId) {
      const matchedLegacy = legacyMembers.find((member) => member.legacy_id === overrideId)
      if (!matchedLegacy) throw new Error(`第 ${row.rowNumber} 行：手动指定的老成员不存在`)
      return {
        ...row,
        source: "legacy-temp",
        existingMemberId: null,
        legacyProfile: matchedLegacy,
        importMetadata: {
          ...row.importMetadata,
          source: "legacy-temp",
          matched_legacy_id: matchedLegacy.legacy_id,
          legacy_profile: matchedLegacy,
          warnings,
        },
      }
    }

    const legacyMatches = currentMatches.length > 0 ? [] : buildLegacyMatches(row, legacyMembers)
    return {
      ...row,
      source: "temp",
      existingMemberId: null,
      legacyProfile: null,
      importMetadata: {
        ...row.importMetadata,
        source: "temp",
        warnings: legacyMatches.length > 1 ? [...warnings, "ambiguous_name_match"] : warnings,
      },
    }
  })
}
