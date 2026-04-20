import { describe, expect, it } from "vitest"
import { buildImportPreview, resolveImportRows } from "@/lib/matching/round-import-resolver"
import type { ParsedImportRow } from "@/lib/matching/round-import-types"

function buildRow(name: string): ParsedImportRow {
  return {
    rowNumber: 2,
    name,
    normalizedName: name,
    gameTypePref: "都可以",
    rawFirstChoice: "双人本",
    rawSecondChoice: "多人本",
    genderPref: "都可以",
    availability: { "2026-04-21": ["上午"] },
    scriptActivityPref: "都可以",
    message: null,
    importMetadata: {
      source: "temp",
      normalized_name: name,
      raw_first_choice: "双人本",
      raw_second_choice: "多人本",
      script_activity_pref: "都可以",
      raw_notes: null,
      warnings: [],
    },
  }
}

describe("resolveImportRows", () => {
  it("prefers current members over legacy data", () => {
    const [row] = resolveImportRows(
      [buildRow("张三")],
      [{ id: "m1", full_name: "张三", nickname: null }],
      [{ legacy_id: "l1", full_name: "张三", gender: "男", school: null, department: null, interest_tags: [], social_tags: [], game_mode: null, compatibility_score: null, session_count: 2, match_history: [] }],
    )

    expect(row.source).toBe("current")
    expect(row.existingMemberId).toBe("m1")
  })

  it("does not auto-apply legacy data without a manual override", () => {
    const [row] = resolveImportRows(
      [buildRow("张三")],
      [],
      [{ legacy_id: "l1", full_name: "张三", gender: "男", school: null, department: null, interest_tags: [], social_tags: [], game_mode: null, compatibility_score: null, session_count: 2, match_history: [] }],
    )

    expect(row.source).toBe("temp")
    expect(row.legacyProfile).toBeNull()
  })

  it("applies legacy data when admin selects an override", () => {
    const [row] = resolveImportRows(
      [buildRow("张三")],
      [],
      [{ legacy_id: "l1", full_name: "张三", gender: "男", school: "早大", department: null, interest_tags: [], social_tags: [], game_mode: null, compatibility_score: null, session_count: 2, match_history: [] }],
      { "2": "l1" },
    )

    expect(row.source).toBe("legacy-temp")
    expect(row.legacyProfile?.school).toBe("早大")
  })

  it("falls back to temp with warning when current match is ambiguous", () => {
    const [row] = resolveImportRows(
      [buildRow("张三")],
      [
        { id: "m1", full_name: "张三", nickname: null },
        { id: "m2", full_name: "张三", nickname: null },
      ],
      [],
    )

    expect(row.source).toBe("temp")
    expect(row.importMetadata.warnings).toContain("ambiguous_name_match")
  })

  it("builds preview rows with exact legacy hints but no auto-binding", () => {
    const [preview] = buildImportPreview(
      [buildRow("张三")],
      [],
      [{ legacy_id: "l1", full_name: "张三", gender: "男", school: "早大", department: "理工", interest_tags: [], social_tags: [], game_mode: null, compatibility_score: null, session_count: 2, match_history: [] }],
    )

    expect(preview.currentMatch).toBeNull()
    expect(preview.exactLegacyMatches).toHaveLength(1)
    expect(preview.exactLegacyMatches[0]?.name).toBe("张三")
  })
})
