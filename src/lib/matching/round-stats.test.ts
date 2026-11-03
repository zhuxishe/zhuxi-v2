import { describe, expect, it } from "vitest"
import { summarizeRoundStats, type RoundStatsSubmission } from "./round-stats"

const person = (gender: unknown, gender_pref: unknown, game_type_pref: unknown = "都可以"): RoundStatsSubmission => ({
  member: { member_identity: { gender } }, gender_pref, game_type_pref,
  availability: { "2026-11-04": ["上午", "下午"] },
})

describe("round registration demographic summaries", () => {
  it("keeps personal gender independent from the requested partner gender", () => {
    const rows = [person("male", "女", "双人"), person("female", "男", "多人"), person("female", "都可以")]
    const before = structuredClone(rows)
    expect(summarizeRoundStats(rows)).toEqual({
      total: 3,
      gameTypeDist: { duo: 1, multi: 1, either: 1 },
      genderDist: { male: 1, female: 2, unspecified: 0 },
      genderPreferenceDist: { male: 1, female: 1, either: 1, unspecified: 0 },
      slotCounts: { "2026-11-04_上午": 3, "2026-11-04_下午": 3 },
    })
    expect(rows).toEqual(before)
  })

  it("does not count other, missing or invalid gender as male/female or infer it from preference", () => {
    const rows = [person("other", "男"), person(null, "女"), person(undefined, "都可以"), person("男", "女"),
      { gender_pref: "男", member: null }, { gender_pref: "女", member: { member_identity: null } }]
    const stats = summarizeRoundStats(rows)
    expect(stats.total).toBe(6)
    expect(stats.genderDist).toEqual({ male: 0, female: 0, unspecified: 6 })
    expect(stats.genderPreferenceDist).toEqual({ male: 2, female: 3, either: 1, unspecified: 0 })
  })

  it("counts missing or invalid partner preference separately without turning it into either", () => {
    const stats = summarizeRoundStats([person("male", null), person("female", undefined), person("male", ""), person("female", "other")])
    expect(stats.genderDist).toEqual({ male: 2, female: 2, unspecified: 0 })
    expect(stats.genderPreferenceDist).toEqual({ male: 0, female: 0, either: 0, unspecified: 4 })
  })

  it("accepts object and single-element relation arrays while treating absent/ambiguous relations as unspecified", () => {
    const stats = summarizeRoundStats([
      { member: [{ member_identity: [{ gender: "male" }] }] },
      { member: { member_identity: [{ gender: "female" }] } },
      { member: [{ member_identity: { gender: "female" } }] },
      { member: [] }, { member: { member_identity: [] } },
      { member: [{ member_identity: { gender: "male" } }, { member_identity: { gender: "female" } }] },
    ])
    expect(stats.genderDist).toEqual({ male: 1, female: 2, unspecified: 3 })
  })

  it("excludes cancelled registrations from every count and the heatmap", () => {
    const stats = summarizeRoundStats([person("male", "女", "双人"), {
      ...person("female", "男", "多人"), cancelled_at: "2026-11-03T01:00:00Z",
      availability: { "2026-11-05": ["晚上"] },
    }])
    expect(stats.total).toBe(1)
    expect(stats.gameTypeDist).toEqual({ duo: 1, multi: 0, either: 0 })
    expect(stats.genderDist).toEqual({ male: 1, female: 0, unspecified: 0 })
    expect(stats.genderPreferenceDist).toEqual({ male: 0, female: 1, either: 0, unspecified: 0 })
    expect(stats.slotCounts).not.toHaveProperty("2026-11-05_晚上")
  })

  it("returns complete zero summaries for an empty round", () => {
    expect(summarizeRoundStats([])).toEqual({ total: 0, gameTypeDist: { duo: 0, multi: 0, either: 0 }, slotCounts: {},
      genderDist: { male: 0, female: 0, unspecified: 0 },
      genderPreferenceDist: { male: 0, female: 0, either: 0, unspecified: 0 } })
  })

  it("keeps demographic counts and valid heatmap slots when availability is absent or malformed", () => {
    const stats = summarizeRoundStats([
      { ...person("male", "女"), availability: null },
      { ...person("male", "女"), availability: ["上午"] },
      { ...person("female", "都可以"), availability: { "2026-11-04": "上午", "2026-11-05": [null, "invalid", "晚上"] } },
    ])
    expect(stats.total).toBe(3)
    expect(stats.genderDist).toEqual({ male: 2, female: 1, unspecified: 0 })
    expect(stats.slotCounts).toEqual({ "2026-11-05_晚上": 1 })
  })
})
