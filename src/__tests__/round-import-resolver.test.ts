import { describe, expect, it } from "vitest"
import { resolveImportRows } from "@/lib/matching/round-import-resolver"
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
})
