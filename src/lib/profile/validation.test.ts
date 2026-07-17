import { describe, expect, it } from "vitest"
import {
  normalizeOptionalProfileText,
  validateAdminProfileMetrics,
  validateProfileNickname,
  validateUpdateMyProfile,
} from "./validation"

describe("profile validation", () => {
  it("allows an absent nickname but enforces 2-20 characters", () => {
    expect(validateProfileNickname(null)).toBeNull()
    expect(validateProfileNickname("  ")).toBeNull()
    expect(validateProfileNickname("竹")).toBe("PROFILE_NICKNAME_INVALID")
    expect(validateProfileNickname("竹溪会员")).toBeNull()
    expect(validateProfileNickname("a".repeat(21))).toBe("PROFILE_NICKNAME_INVALID")
  })

  it("normalizes compatibility characters and rejects reserved identities", () => {
    expect(normalizeOptionalProfileText("  ＡＢ  ")).toBe("AB")
    expect(validateProfileNickname("ADMIN")).toBe("PROFILE_NICKNAME_RESERVED")
    expect(validateProfileNickname("ａｄｍｉｎ")).toBe("PROFILE_NICKNAME_RESERVED")
    expect(validateProfileNickname(" 管理员 ")).toBe("PROFILE_NICKNAME_RESERVED")
  })

  it("validates editable identity fields without requiring optional fields", () => {
    expect(validateUpdateMyProfile({
      fullName: "竹溪 太郎",
      gender: "male",
      nickname: null,
      schoolName: null,
      department: null,
      personalAvatarPath: null,
    })).toBeNull()
    expect(validateUpdateMyProfile({
      fullName: "",
      gender: "male",
      nickname: null,
      schoolName: null,
      department: null,
      personalAvatarPath: null,
    })).toBe("PROFILE_FULL_NAME_INVALID")
  })

  it("requires a one-decimal 1.0-5.0 admin score and audit text", () => {
    const valid = {
      memberId: "00000000-0000-4000-8000-000000000000",
      level: 1 as const,
      compatibilityScore: 5,
      compatibilityStatus: "published" as const,
      internalNote: "初始分",
      scoreSource: "initial" as const,
      auditReason: "初始化",
    }
    expect(validateAdminProfileMetrics(valid)).toBeNull()
    expect(validateAdminProfileMetrics({ ...valid, compatibilityScore: 4.55 })).toBe("PROFILE_COMPATIBILITY_SCORE_INVALID")
    expect(validateAdminProfileMetrics({ ...valid, internalNote: "" })).toBe("PROFILE_INTERNAL_NOTE_INVALID")
  })
})
