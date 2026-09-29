import { beforeEach, describe, expect, it, vi } from "vitest"
import { supportsMiniRoundContent, selectCompatibleMiniRound, miniSubmissionRevision } from "../../packages/miniprogram/src/lib/round-compatibility"
import { getMiniSurveyRoundError, miniSurveySubmitError } from "../../packages/miniprogram/src/pages/survey/survey-submit"
import type { MiniOpenRound } from "../../packages/miniprogram/src/lib/round-state"
const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("../../packages/miniprogram/src/lib/supabase", () => ({ supabaseQuery: query }))
import { fetchMiniOpenRound } from "../../packages/miniprogram/src/lib/open-round"

const now = new Date("2026-09-29T00:00:00Z")
const legacy: MiniOpenRound = { id: "matching", round_name: "匹配", status: "open", survey_start: "2026-09-28T00:00:00Z", survey_end: "2026-09-30T00:00:00Z" }

describe("mini-program matching compatibility", () => {
  beforeEach(() => query.mockReset())

  it("continues to accept the original schema and default matching config", () => {
    expect(supportsMiniRoundContent(legacy)).toBe(true)
    expect(supportsMiniRoundContent({ purpose: "matching", content_config: {} })).toBe(true)
    expect(supportsMiniRoundContent({ purpose: "matching", content_config: { questions: [], modules: { interests: true, social: true, message: true } } })).toBe(true)
  })

  it.each(["registration", "announcement"])("excludes %s", (purpose) => {
    expect(supportsMiniRoundContent({ purpose })).toBe(false)
  })

  it.each(["interests", "social", "message"])("excludes disabled %s modules", (key) => {
    expect(supportsMiniRoundContent({ content_config: { modules: { [key]: false } } })).toBe(false)
  })

  it("excludes custom questions and malformed content", () => {
    expect(supportsMiniRoundContent({ content_config: { questions: [{ id: "q1", required: false }] } })).toBe(false)
    expect(supportsMiniRoundContent({ content_config: { questions: "invalid" } })).toBe(false)
    expect(supportsMiniRoundContent({ content_config: [] })).toBe(false)
  })

  it("finds a compatible matching round after expired, future and incompatible rounds", () => {
    const rounds = [{ ...legacy, id: "expired", survey_end: now.toISOString() }, { ...legacy, id: "future", survey_start: "2026-10-01T00:00:00Z" }, { ...legacy, id: "party", purpose: "registration" }, { ...legacy, id: "custom", content_config: { questions: [{}] } }, legacy]
    expect(selectCompatibleMiniRound(rounds, now)?.id).toBe("matching")
  })

  it("queries the time window before selecting and does not depend on new columns", async () => {
    query.mockResolvedValueOnce([{ ...legacy, purpose: "announcement" }, { ...legacy, config_revision: 7 }])
    expect((await fetchMiniOpenRound(now))?.config_revision).toBe(7)
    expect(query).toHaveBeenCalledWith("match_rounds", expect.objectContaining({ select: "*", status: "eq.open", survey_start: `lte.${now.toISOString()}`, survey_end: `gt.${now.toISOString()}` }))
  })

  it("does not let a full page of incompatible rounds hide a later compatible one", async () => {
    query.mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({ ...legacy, id: String(index), purpose: "announcement" }))).mockResolvedValueOnce([legacy])
    expect((await fetchMiniOpenRound(now))?.id).toBe("matching")
    expect(query).toHaveBeenNthCalledWith(2, "match_rounds", expect.objectContaining({ offset: "100" }))
  })

  it("includes the loaded revision only when the schema supports it", () => {
    expect(miniSubmissionRevision(undefined)).toEqual({})
    expect(miniSubmissionRevision(0)).toEqual({ config_revision: 0 })
    expect(miniSubmissionRevision(7)).toEqual({ config_revision: 7 })
  })

  it("rejects a changed revision instead of replacing the loaded revision", () => {
    expect(getMiniSurveyRoundError({ ...legacy, status: "open", config_revision: 7 }, now, 7)).toBeNull()
    expect(getMiniSurveyRoundError({ ...legacy, status: "open", config_revision: 8 }, now, 7)).toContain("当前输入仍保留")
    expect(getMiniSurveyRoundError({ ...legacy, status: "open", config_revision: 0 }, now)).toContain("内容已更新")
  })

  it("blocks a new custom question or deadline reached during filling", () => {
    expect(getMiniSurveyRoundError({ ...legacy, status: "open", content_config: { questions: [{ id: "q1" }] } }, now)).toContain("网页版")
    expect(getMiniSurveyRoundError({ ...legacy, status: "open", survey_end: now.toISOString() }, now)).toBe("当前轮次已截止")
    expect(getMiniSurveyRoundError({ ...legacy, status: "open", survey_start: "2026-10-01T00:00:00Z" }, now)).toBe("当前轮次尚未开放")
  })

  it("explains database races without resetting form state", () => {
    expect(miniSurveySubmitError("ROUND_CONFIG_CHANGED")).toContain("当前输入仍保留")
    expect(miniSurveySubmitError("MEMBER_MASTER_SUBMISSION_ROUND_CLOSED")).toContain("当前输入仍保留")
  })
})
