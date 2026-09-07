import { describe, expect, it } from "vitest"
import zh from "@/messages/zh.json"
import ja from "@/messages/ja.json"
import { EMPTY_FORM } from "@/types/member-types"
import { EMPTY_PERSONALITY, EMPTY_SUPPLEMENTARY } from "@/types/form-types"
import {
  buildProfileDetailSections,
  formatProfileDetailValue,
  PERSONALITY_FIELDS,
  REGISTRATION_FIELDS,
  REGISTRATION_READONLY_FIELDS,
  SUPPLEMENTARY_FIELDS,
  type PlayerProfileDetails,
} from "./details"

const t = (key: string) => key
const empty: PlayerProfileDetails = { identity: null, language: null, interests: null, personality: null, quiz: null }

describe("saved player profile details", () => {
  it("covers every player registration, supplementary and self-assessment field", () => {
    expect([...REGISTRATION_FIELDS].sort()).toEqual(Object.keys(EMPTY_FORM).sort())
    expect([...SUPPLEMENTARY_FIELDS].sort()).toEqual(Object.keys(EMPTY_SUPPLEMENTARY).sort())
    expect([...PERSONALITY_FIELDS].sort()).toEqual(Object.keys(EMPTY_PERSONALITY).sort())
    expect(REGISTRATION_READONLY_FIELDS).toHaveLength(10)
    expect(REGISTRATION_READONLY_FIELDS).not.toContain("full_name")
    for (const section of buildProfileDetailSections(empty, "zh", t)) {
      for (const row of section.rows) {
        expect(zh.profile.details.fields).toHaveProperty(row.key)
        expect(ja.profile.details.fields).toHaveProperty(row.key)
      }
    }
  })

  it("does not substitute form defaults for missing saved data", () => {
    const sections = buildProfileDetailSections(empty, "zh", t)
    expect(sections.every((section) => section.rows.every((row) => row.missing))).toBe(true)
    expect(sections.flatMap((section) => section.rows).find((row) => row.key === "extroversion")?.value).toBe("notProvided")
    expect(sections.flatMap((section) => section.rows).find((row) => row.key === "accept_beginners")?.value).toBe("notProvided")
  })

  it("treats untouched onboarding assessment placeholders like the assessment form, while retaining answered neutral scores", () => {
    const personality = { extroversion: 3, initiative: 3, emotional_stability: 3, personality_tags: ["温和"] }
    const placeholder = buildProfileDetailSections({ ...empty, personality }, "zh", t).find((section) => section.key === "personality")!
    expect(placeholder.rows.every((row) => row.missing)).toBe(true)
    const answered = buildProfileDetailSections({
      ...empty,
      personality: { ...personality, expression_style_tags: ["温和"] },
    }, "zh", t).find((section) => section.key === "personality")!
    expect(answered.rows.find((row) => row.key === "extroversion")).toMatchObject({ value: "3 / 5", missing: false })
  })

  it("retains explicit no and zero scores while distinguishing blank values", () => {
    expect(formatProfileDetailValue(false, "accept_beginners", "zh", t)).toEqual({ value: "no", missing: false })
    expect(formatProfileDetailValue(0, "score_e", "zh", t)).toEqual({ value: "0 / 100", missing: false })
    expect(formatProfileDetailValue("  ", "school_name", "zh", t).missing).toBe(true)
    expect(formatProfileDetailValue([], "taboo_tags", "zh", t)).toEqual({ value: "noneSelected", missing: true })
  })

  it("does not display legacy default consent as an answer, but retains submitted yes and explicit no", () => {
    const interests = { accept_beginners: true, accept_cross_school: true }
    const answers = (details: PlayerProfileDetails) => buildProfileDetailSections(details, "zh", t)
      .find((section) => section.key === "supplementary")!.rows
      .filter((row) => row.key.startsWith("accept_"))
    expect(answers({ ...empty, interests }).every((row) => row.missing)).toBe(true)
    expect(answers({ ...empty, interests, language: { communication_language_pref: [] } })
      .map((row) => row.value)).toEqual(["yes", "yes"])
    expect(answers({ ...empty, interests: { ...interests, accept_beginners: false } })
      .map((row) => row.value)).toEqual(["no", "yes"])
  })

  it("localizes stored option keys without translating the player's free text", () => {
    expect(formatProfileDetailValue(["桌游", "摄影"], "hobby_tags", "ja", t).value).toBe("ボードゲーム、写真")
    expect(formatProfileDetailValue("每月1次", "activity_frequency", "ja", t).value).toBe("月1回")
    expect(formatProfileDetailValue("直率", "expression_style_tags", "ja", t).value).toBe("ストレート")
    expect(formatProfileDetailValue("master", "degree_level", "zh", t).value).toBe("修士")
    expect(formatProfileDetailValue("桌游", "nickname", "ja", t).value).toBe("桌游")
  })

  it("combines saved language and activity preferences without losing either record", () => {
    const section = buildProfileDetailSections({
      ...empty,
      language: { communication_language_pref: ["中文", "日语"], japanese_level: "N1" },
      interests: { nearest_station: "新宿", accept_cross_school: false, graduation_year: 2028 },
    }, "ja", t).find((item) => item.key === "supplementary")!
    expect(section.rows.find((row) => row.key === "communication_language_pref")?.value).toBe("中国語、日本語")
    expect(section.rows.find((row) => row.key === "nearest_station")?.value).toBe("新宿")
    expect(section.rows.find((row) => row.key === "accept_cross_school")?.value).toBe("no")
  })
})
