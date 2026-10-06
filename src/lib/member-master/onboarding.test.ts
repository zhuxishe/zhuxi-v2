import { describe, expect, it } from "vitest"
import {
  buildOnboardingStepPayload,
  getOnboardingResumeStep,
  hydrateOnboardingDraft,
  OnboardingInputError,
} from "./onboarding"

describe("buildOnboardingStepPayload", () => {
  it("trims and selects only step 1 fields", () => {
    expect(buildOnboardingStepPayload(1, {
      full_name: "  山田 花子  ",
      nickname: "  花ちゃん  ",
      gender: "female",
      birth_date: "2003-07-15",
      nationality: "jp",
      current_city: "tokyo",
      ignored: "never reaches the RPC",
    })).toEqual({
      full_name: "山田 花子",
      nickname: "花ちゃん",
      gender: "female",
      birth_date: "2003-07-15",
      nationality: "jp",
      current_city: "tokyo",
    })
  })

  it("requires school and degree while normalizing optional academic fields", () => {
    expect(buildOnboardingStepPayload(2, {
      school_name: "  早稻田大学  ",
      department: "理工学部",
      degree_level: "修士",
      course_language: null,
      enrollment_year: null,
    })).toEqual({
      school_name: "早稻田大学",
      department: "理工学部",
      degree_level: "修士",
      course_language: null,
      enrollment_year: null,
    })
  })

  it.each([undefined, "", "2000-02-30", "2999-01-01"])("requires a real nonfuture birthday %j", (birth_date) => {
    expect(() => buildOnboardingStepPayload(1, {
      full_name: "玩家", gender: "male", nationality: "中国", current_city: "东京", age_range: "21-23", birth_date,
    })).toThrow(OnboardingInputError)
  })

  it.each([
    { school_name: " ", degree_level: "修士" },
    { school_name: "早稻田大学", degree_level: "" },
    { school_name: "早稻田大学", degree_level: "invalid" },
  ])("rejects missing school and unsupported degrees", (input) => {
    expect(() => buildOnboardingStepPayload(2, input)).toThrow(OnboardingInputError)
  })

  it("deduplicates tags while preserving order", () => {
    expect(buildOnboardingStepPayload(3, {
      hobby_tags: ["music", " music ", "travel"],
      activity_type_tags: ["meal", "game"],
    })).toEqual({
      hobby_tags: ["music", "travel"],
      activity_type_tags: ["meal", "game"],
    })
  })

  it("rejects missing required values and client-limit bypasses", () => {
    expect(() => buildOnboardingStepPayload(1, {
      full_name: " ",
      nickname: "",
      gender: "female",
      birth_date: "2003-07-15",
      nationality: "jp",
      current_city: "tokyo",
    })).toThrow(OnboardingInputError)

    expect(() => buildOnboardingStepPayload(4, {
      personality_self_tags: ["1", "2", "3", "4", "5", "6"],
      taboo_tags: [],
    })).toThrow(OnboardingInputError)
  })
})
describe("onboarding resume hydration", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 3],
    [99, 3],
    [-1, 0],
    [1.5, 0],
  ])("maps saved step %s to UI index %s", (saved, expected) => {
    expect(getOnboardingResumeStep(saved)).toBe(expected)
  })

  it("hydrates saved identity and safely replaces malformed values", () => {
    const draft = hydrateOnboardingDraft({
      full_name: "山田 花子",
      gender: "female",
      enrollment_year: 2026,
      hobby_tags: ["music"],
      activity_type_tags: "invalid",
      personality_self_tags: ["calm"],
      taboo_tags: null,
    })

    expect(draft).toMatchObject({
      full_name: "山田 花子",
      gender: "female",
      enrollment_year: 2026,
      hobby_tags: ["music"],
      activity_type_tags: [],
      personality_self_tags: ["calm"],
      taboo_tags: [],
    })
  })

  it("resumes legacy incomplete drafts at the first newly missing required step", () => {
    expect(getOnboardingResumeStep(4, { age_range: "21-23" })).toBe(0)
    expect(getOnboardingResumeStep(4, { birth_date: "2000-02-29", school_name: "", degree_level: "" })).toBe(1)
    expect(getOnboardingResumeStep(4, { birth_date: "2000-02-29", school_name: "早稻田大学", degree_level: "修士" })).toBe(3)
    expect(hydrateOnboardingDraft({ age_range: "20-24" })).toMatchObject({ birth_date: "", age_range: "20-24" })
  })

  it("returns independent arrays for empty drafts", () => {
    const first = hydrateOnboardingDraft(null)
    const second = hydrateOnboardingDraft(null)
    first.hobby_tags.push("music")
    expect(second.hobby_tags).toEqual([])
  })
})
