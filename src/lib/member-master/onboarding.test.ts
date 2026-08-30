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
      age_range: "20-24",
      nationality: "jp",
      current_city: "tokyo",
      ignored: "never reaches the RPC",
    })).toEqual({
      full_name: "山田 花子",
      nickname: "花ちゃん",
      gender: "female",
      age_range: "20-24",
      nationality: "jp",
      current_city: "tokyo",
    })
  })

  it("normalizes optional academic fields to null", () => {
    expect(buildOnboardingStepPayload(2, {
      school_name: " ",
      department: "理工学部",
      degree_level: "",
      course_language: null,
      enrollment_year: null,
    })).toEqual({
      school_name: null,
      department: "理工学部",
      degree_level: null,
      course_language: null,
      enrollment_year: null,
    })
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
      age_range: "20-24",
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

  it("returns independent arrays for empty drafts", () => {
    const first = hydrateOnboardingDraft(null)
    const second = hydrateOnboardingDraft(null)
    first.hobby_tags.push("music")
    expect(second.hobby_tags).toEqual([])
  })
})
