import { describe, expect, it } from "vitest"
import {
  FALLBACK_HOMEPAGE_SCHOOL_STATS,
  getHomepageSchoolChartItems,
  getOtherCount,
  parseHomepageSchoolStats,
  validateHomepageSchoolStatsDraft,
} from "@/lib/homepage-school-stats"

const validRow = {
  total_members: 20,
  total_schools: 4,
  featured_schools: [
    { id: "waseda", zh: "早稻田", ja: "早稲田", count: 8 },
    { id: "todai", zh: "东大", ja: "東大", count: 5 },
  ],
  version: 3,
  published_at: "2026-08-06T04:00:00.000Z",
}

describe("homepage school statistics", () => {
  it("preserves the established 135 / 29 display as the fallback", () => {
    expect(validateHomepageSchoolStatsDraft(FALLBACK_HOMEPAGE_SCHOOL_STATS)).toEqual({ valid: true, errors: [] })
    expect(getOtherCount(FALLBACK_HOMEPAGE_SCHOOL_STATS)).toBe(23)
    expect(getHomepageSchoolChartItems(FALLBACK_HOMEPAGE_SCHOOL_STATS)).toHaveLength(8)
  })

  it("strictly parses a complete database row", () => {
    expect(parseHomepageSchoolStats(validRow)).toEqual({
      totalMembers: 20,
      totalSchools: 4,
      featuredSchools: validRow.featured_schools,
      version: 3,
      publishedAt: validRow.published_at,
    })
  })

  it("rejects malformed, overfull, duplicate, and oversized featured data", () => {
    expect(parseHomepageSchoolStats({ ...validRow, total_members: "20" })).toBeNull()
    expect(parseHomepageSchoolStats({ ...validRow, published_at: "not-a-date" })).toBeNull()
    expect(parseHomepageSchoolStats({
      ...validRow,
      featured_schools: [{ ...validRow.featured_schools[0], extra: true }],
    })).toBeNull()
    expect(validateHomepageSchoolStatsDraft({
      totalMembers: 10,
      totalSchools: 8,
      featuredSchools: Array.from({ length: 8 }, (_, index) => ({
        id: `school-${index}`, zh: `学校${index}`, ja: `大学${index}`, count: index === 0 ? 11 : 0,
      })),
    }).valid).toBe(false)
    expect(validateHomepageSchoolStatsDraft({
      totalMembers: 10,
      totalSchools: 2,
      featuredSchools: [
        { id: "same", zh: "同校", ja: "同じ", count: 2 },
        { id: "same", zh: "同校", ja: "同じ", count: 2 },
      ],
    }).errors).toEqual(expect.arrayContaining([
      "精选学校 ID 不能重复",
      "精选学校中文名不能重复",
      "精选学校日文名不能重复",
    ]))
    expect(validateHomepageSchoolStatsDraft({
      totalMembers: 2,
      totalSchools: 1,
      featuredSchools: [{ id: "other", zh: "测试", ja: "テスト", count: 1 }],
    }).valid).toBe(false)
  })

  it("supports a safe empty state and derives the other group automatically", () => {
    const empty = { totalMembers: 0, totalSchools: 0, featuredSchools: [] }
    expect(validateHomepageSchoolStatsDraft(empty)).toEqual({ valid: true, errors: [] })
    expect(getHomepageSchoolChartItems(empty)).toEqual([
      { id: "other", zh: "其他", ja: "その他", count: 0, color: "#b5b99f", isOther: true },
    ])
    expect(getOtherCount({ ...empty, totalMembers: 7 })).toBe(7)
  })

  it("assigns a deterministic, distinguishable color to each featured school", () => {
    const items = getHomepageSchoolChartItems(FALLBACK_HOMEPAGE_SCHOOL_STATS)
    expect(items.slice(0, 7).map((item) => item.color)).toHaveLength(7)
    for (let index = 1; index < 7; index += 1) {
      expect(items[index].color).not.toBe(items[index - 1].color)
    }
  })
})
