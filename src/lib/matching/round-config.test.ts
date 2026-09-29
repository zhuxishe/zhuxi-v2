import { describe, expect, it } from "vitest"
import { getRoundPurpose, localizeRoundText, normalizeRoundConfig, roundAnswerStructure } from "./round-config"
import { validateRoundConfig, validateRoundDraft, validateRoundPublishing } from "./round-config-validation"

const config = () => normalizeRoundConfig({ questions: [{ id: "meal", type: "single", label: { zh: "餐食", ja: "" }, required: true, options: [{ id: "regular", label: { zh: "普通", ja: "" } }, { id: "veggie", label: { zh: "素食", ja: "" } }] }] })

describe("matching content configuration", () => {
  it("keeps all original matching modules and no extra questions for legacy rows", () => {
    expect(getRoundPurpose(undefined)).toBe("matching")
    expect(normalizeRoundConfig(null)).toMatchObject({ questions: [], modules: { interests: true, social: true, message: true } })
  })
  it("uses the other language before the default when a translation is missing", () => {
    expect(localizeRoundText({ zh: "活动", ja: "" }, "ja", "default")).toBe("活动")
    expect(localizeRoundText({ zh: "", ja: "" }, "ja", "default")).toBe("default")
  })
  it("allows wording changes while preserving answer interpretation", () => {
    const original = config(), revised = config()
    revised.questions[0].label.zh = "请选择餐食"
    revised.questions[0].options[0].label.zh = "普通餐食"
    expect(roundAnswerStructure("registration", original)).toBe(roundAnswerStructure("registration", revised))
    revised.questions[0].options[0].id = "changed"
    expect(roundAnswerStructure("registration", original)).not.toBe(roundAnswerStructure("registration", revised))
  })
  it("locks modules, question order, requiredness and fixed event time", () => {
    const original = config(), revised = config()
    revised.modules.interests = false
    expect(roundAnswerStructure("matching", original)).not.toBe(roundAnswerStructure("matching", revised))
    revised.modules.interests = true
    revised.questions[0].required = false
    expect(roundAnswerStructure("matching", original)).not.toBe(roundAnswerStructure("matching", revised))
  })
  it.each(["__proto__", "constructor", "prototype"])("rejects dangerous object key %s", (id) => {
    const value = config(); value.questions[0].id = id
    expect(validateRoundConfig(value).error).toBeTruthy()
  })
  it("rejects duplicate option identities and an empty question", () => {
    const value = config(); value.questions[0].options[1].id = "regular"
    expect(validateRoundConfig(value).error).toBeTruthy()
    value.questions[0].label.zh = ""
    expect(validateRoundConfig(value).error).toBeTruthy()
  })
  it("accepts a single-day activity and rejects an impossible date", () => {
    const draft = { roundName: "单日活动", purpose: "registration" as const, activityStart: "2026-10-10", activityEnd: "2026-10-10", surveyStart: "", surveyEnd: "", contentConfig: config() }
    expect(validateRoundDraft(draft).error).toBeUndefined()
    expect(validateRoundDraft({ ...draft, activityStart: "2026-02-30" }).error).toBeTruthy()
  })
  it("normalizes Tokyo event time and rejects end before start", () => {
    const value = { ...config(), eventStart: "2026-10-10T12:00", eventEnd: "2026-10-10T14:00" }
    expect(validateRoundConfig(value).config?.eventStart).toBe("2026-10-10T03:00:00.000Z")
    expect(validateRoundConfig({ ...value, eventEnd: "2026-10-10T11:00" }).error).toBeTruthy()
  })
  it("requires time and location before opening fixed registration only", () => {
    expect(validateRoundPublishing("registration", config(), new Date("2026-10-01"))).toBeTruthy()
    expect(validateRoundPublishing("matching", config())).toBeNull()
    expect(validateRoundPublishing("announcement", config())).toBeNull()
    const value = config(); value.eventStart = "2026-10-10T03:00:00Z"; value.eventEnd = "2026-10-10T06:00:00Z"; value.location.zh = "东京"
    expect(validateRoundPublishing("registration", value, new Date("2026-10-01"))).toBeNull()
  })
})
