import { describe, expect, it } from "vitest"
import { buildImportInfoMap } from "@/lib/matching/import-display"

describe("buildImportInfoMap", () => {
  it("uses record_source for import fallback without selecting the member number", () => {
    const info = buildImportInfoMap([
      {
        member_id: "m0",
        member: {
          record_source: "import",
          member_identity: { full_name: "田中太郎", nickname: null },
        },
      },
    ], [])

    expect(info.m0).toMatchObject({
      source: "temp",
      inferred: true,
      legacy_profile: null,
    })
  })

  it("falls back to inferred legacy-temp for IMP members when import_metadata is unavailable", () => {
    const info = buildImportInfoMap([
      {
        member_id: "m1",
        member: {
          member_number: "IMP-test-001",
          member_identity: { full_name: "朱捍华", nickname: null },
        },
      },
    ], [
      {
        legacy_id: "l1",
        full_name: "朱捍华",
        gender: "男",
        school: "東京大学",
        department: "学際情報学府",
        interest_tags: [],
        social_tags: [],
        game_mode: null,
        compatibility_score: null,
        session_count: 0,
        match_history: [],
      },
    ])

    expect(info.m1).toMatchObject({
      source: "legacy-temp",
      inferred: true,
      legacy_profile: { full_name: "朱捍华", school: "東京大学" },
    })
  })
})
