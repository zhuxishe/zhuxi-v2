import { describe, it, expect } from "vitest"
import { calcCompleteness } from "@/lib/queries/profile"

function makeProfile(overrides: Partial<Parameters<typeof calcCompleteness>[0]> = {}) {
  return {
    member_identity: null,
    member_language: null,
    member_interests: null,
    member_personality: null,
    member_boundaries: null,
    personality_quiz_results: null,
    ...overrides,
  }
}

describe("calcCompleteness", () => {
  it("all empty → 0%", () => {
    const result = calcCompleteness(makeProfile())
    expect(result.percentage).toBe(0)
    expect(result.identity).toBe(false)
    expect(result.supplementary).toBe(false)
    expect(result.personality).toBe(false)
    expect(result.quiz).toBe(false)
  })

  it("identity only → 25%", () => {
    const result = calcCompleteness(makeProfile({
      member_identity: { full_name: "Test" },
    }))
    expect(result.percentage).toBe(25)
    expect(result.identity).toBe(true)
  })

  it("identity as empty array → false (not 25%)", () => {
    const result = calcCompleteness(makeProfile({
      member_identity: [] as unknown,
    }))
    expect(result.identity).toBe(false)
  })

  it("identity + quiz → 50%", () => {
    const result = calcCompleteness(makeProfile({
      member_identity: { full_name: "Test" },
      personality_quiz_results: { score_e: 80 },
    }))
    expect(result.percentage).toBe(50)
    expect(result.quiz).toBe(true)
  })

  it("supplementary needs both language and interests", () => {
    // Only language → not complete
    const langOnly = calcCompleteness(makeProfile({
      member_language: { communication_language_pref: ["中文"] },
    }))
    expect(langOnly.supplementary).toBe(false)

    // Only interests → not complete
    const interestsOnly = calcCompleteness(makeProfile({
      member_interests: { activity_frequency: "週1" },
    }))
    expect(interestsOnly.supplementary).toBe(false)

    // Both → complete
    const both = calcCompleteness(makeProfile({
      member_language: { communication_language_pref: ["中文"] },
      member_interests: { activity_frequency: "週1" },
    }))
    expect(both.supplementary).toBe(true)
  })

  it("personality needs all key dimensions", () => {
    // Only expression_style_tags → not complete
    const partial = calcCompleteness(makeProfile({
      member_personality: {
        expression_style_tags: ["内向"],
        extroversion: null,
        initiative: null,
        emotional_stability: null,
        warmup_speed: null,
      },
    }))
    expect(partial.personality).toBe(false)

    // All key fields → complete
    const full = calcCompleteness(makeProfile({
      member_personality: {
        expression_style_tags: ["内向"],
        extroversion: 3,
        initiative: 3,
        emotional_stability: 3,
        warmup_speed: "慢热",
      },
    }))
    expect(full.personality).toBe(true)
  })

  it("handles array-wrapped join results (Supabase edge case)", () => {
    const result = calcCompleteness(makeProfile({
      member_identity: { full_name: "Test" },
      member_language: [{ communication_language_pref: ["日本語"] }],
      member_interests: [{ activity_frequency: "月2" }],
      personality_quiz_results: [{ score_e: 70 }],
    }))
    expect(result.identity).toBe(true)
    expect(result.supplementary).toBe(true)
    expect(result.quiz).toBe(true)
    expect(result.percentage).toBe(75)
  })

  it("100% when all sections complete", () => {
    const result = calcCompleteness(makeProfile({
      member_identity: { full_name: "Test" },
      member_language: { communication_language_pref: ["中文"] },
      member_interests: { activity_frequency: "週1" },
      member_personality: {
        expression_style_tags: ["活跃"],
        extroversion: 4,
        initiative: 4,
        emotional_stability: 4,
        warmup_speed: "正常",
      },
      personality_quiz_results: { score_e: 90 },
    }))
    expect(result.percentage).toBe(100)
  })
})
