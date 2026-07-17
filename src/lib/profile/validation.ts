import type {
  UpdateAdminMemberProfileMetricsInput,
  UpdateMyProfileInput,
} from "./types"

export const PROFILE_NICKNAME_ERRORS = [
  "PROFILE_NICKNAME_INVALID",
  "PROFILE_NICKNAME_RESERVED",
  "PROFILE_NICKNAME_TAKEN",
  "PROFILE_NICKNAME_REQUIRED_FOR_COMMUNITY",
] as const

export type ProfileNicknameErrorCode = typeof PROFILE_NICKNAME_ERRORS[number]

const RESERVED_NICKNAMES = new Set([
  "admin",
  "administrator",
  "staff",
  "官方",
  "管理员",
  "竹溪社官方",
  "管理者",
  "運営",
  "公式",
])

export function normalizeOptionalProfileText(value: string | null | undefined) {
  const normalized = value?.normalize("NFKC").trim() ?? ""
  return normalized || null
}

export function validateProfileNickname(value: string | null | undefined): ProfileNicknameErrorCode | null {
  const nickname = normalizeOptionalProfileText(value)
  if (!nickname) return null
  const length = [...nickname].length
  if (length < 2 || length > 20) return "PROFILE_NICKNAME_INVALID"
  if (RESERVED_NICKNAMES.has(nickname.toLowerCase())) return "PROFILE_NICKNAME_RESERVED"
  return null
}

export type ProfileFieldError =
  | "PROFILE_FULL_NAME_INVALID"
  | "PROFILE_GENDER_INVALID"
  | "PROFILE_SCHOOL_NAME_INVALID"
  | "PROFILE_DEPARTMENT_INVALID"
  | ProfileNicknameErrorCode

export function validateUpdateMyProfile(input: UpdateMyProfileInput): ProfileFieldError | null {
  const fullName = input.fullName.normalize("NFKC").trim()
  if ([...fullName].length < 1 || [...fullName].length > 100) return "PROFILE_FULL_NAME_INVALID"
  if (!(["male", "female", "other"] as const).includes(input.gender)) return "PROFILE_GENDER_INVALID"
  const nicknameError = validateProfileNickname(input.nickname)
  if (nicknameError) return nicknameError
  const schoolName = normalizeOptionalProfileText(input.schoolName)
  if (schoolName && [...schoolName].length > 120) return "PROFILE_SCHOOL_NAME_INVALID"
  const department = normalizeOptionalProfileText(input.department)
  if (department && [...department].length > 120) return "PROFILE_DEPARTMENT_INVALID"
  return null
}

export function validateAdminProfileMetrics(input: UpdateAdminMemberProfileMetricsInput): string | null {
  if (![1, 2, 3].includes(input.level)) return "PROFILE_LEVEL_INVALID"
  if (!Number.isFinite(input.compatibilityScore)
      || input.compatibilityScore < 1
      || input.compatibilityScore > 5
      || Math.abs(input.compatibilityScore * 10 - Math.round(input.compatibilityScore * 10)) > 1e-9) {
    return "PROFILE_COMPATIBILITY_SCORE_INVALID"
  }
  if (input.compatibilityStatus !== "pending" && input.compatibilityStatus !== "published") {
    return "PROFILE_COMPATIBILITY_STATUS_INVALID"
  }
  if (input.scoreSource !== "initial" && input.scoreSource !== "manual") return "PROFILE_SCORE_SOURCE_INVALID"
  if (!input.internalNote.trim() || [...input.internalNote].length > 2000) return "PROFILE_INTERNAL_NOTE_INVALID"
  if (!input.auditReason.trim() || [...input.auditReason].length > 1000) return "PROFILE_AUDIT_REASON_INVALID"
  return null
}
