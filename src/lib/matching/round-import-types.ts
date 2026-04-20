import type { Availability } from "./types"
import type { ImportSource, LegacyImportProfile, SubmissionImportMetadata } from "./import-metadata"

export interface ParsedImportRow {
  rowNumber: number
  name: string
  normalizedName: string
  gameTypePref: "双人" | "多人" | "都可以"
  rawFirstChoice: string
  rawSecondChoice: string | null
  genderPref: "男" | "女" | "都可以"
  availability: Availability
  scriptActivityPref: string | null
  message: string | null
  importMetadata: SubmissionImportMetadata
}

export interface CurrentImportMember {
  id: string
  full_name: string | null
  nickname: string | null
}

export interface LegacyImportMember extends LegacyImportProfile {}

export interface ResolvedImportRow extends ParsedImportRow {
  memberId: string
  source: ImportSource
}

export interface PreparedImportRow extends ParsedImportRow {
  source: ImportSource
  existingMemberId: string | null
  legacyProfile: LegacyImportProfile | null
}

export interface ImportSummary {
  totalRows: number
  currentCount: number
  legacyCount: number
  tempCount: number
  warningCount: number
}
