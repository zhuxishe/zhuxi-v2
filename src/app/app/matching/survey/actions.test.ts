import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), player: vi.fn(), revalidate: vi.fn(), upsert: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.player }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { submitSurvey } from "./actions"

const round = { id: "round", status: "open", survey_start: "2026-09-29T00:00:00Z", survey_end: "2026-09-29T09:00:00Z", activity_start: "2026-10-01", activity_end: "2026-10-14" }
const input = {
  roundId: "round", gameTypePref: "都可以", genderPref: "都可以",
  availability: { "2026-10-01": ["下午"] }, interestTags: [], socialStyle: null, message: "existing answer",
}
function readRound(data: (typeof round & { purpose?: string; config_revision?: number; content_config?: unknown; deleted_at?: string | null }) | null) {
  const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.single.mockResolvedValue({ data, error: null })
  query.maybeSingle.mockResolvedValue({ data, error: null })
  return query
}

describe("survey submission availability", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime("2026-09-29T01:00:00Z")
    mocks.player.mockResolvedValue({ memberId: "canonical-member" })
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.rpc.mockResolvedValue({ error: null })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it.each([
    [{ ...round, status: "closed" }, "surveyClosed"],
    [{ ...round, status: "draft" }, "surveyClosed"],
    [{ ...round, status: "matched" }, "surveyClosed"],
    [{ ...round, survey_start: "2026-09-30T00:00:00Z" }, "surveyClosed"],
    [{ ...round, survey_start: "2026-09-29T02:00:00Z" }, "surveyNotStarted"],
    [{ ...round, survey_end: "2026-09-29T01:00:00Z" }, "surveyExpired"],
  ])("does not write when the collection window is unavailable", async (data, error) => {
    mocks.from.mockReturnValueOnce(readRound(data))
    expect(await submitSurvey(input)).toEqual({ error })
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("upserts the member's existing round answer and refreshes the notification layout and form", async () => {
    mocks.from.mockReturnValueOnce(readRound(round)).mockReturnValueOnce({ upsert: mocks.upsert })
    expect(await submitSurvey(input)).toEqual({ success: true })
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      round_id: "round", member_id: "canonical-member", message: input.message, availability: input.availability,
    }), { onConflict: "round_id,member_id" })
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout")
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/matching/survey")
  })

  it("explains a closure between validation and the database write", async () => {
    mocks.from.mockReturnValueOnce(readRound(round)).mockReturnValueOnce({ upsert: mocks.upsert })
      .mockReturnValueOnce(readRound({ ...round, status: "closed" }))
    mocks.upsert.mockResolvedValue({ error: { code: "42501" } })
    expect(await submitSurvey(input)).toEqual({ error: "surveyClosed" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("requires an authenticated player before accessing round data", async () => {
    mocks.player.mockRejectedValue(new Error("redirect"))
    await expect(submitSurvey(input)).rejects.toThrow("redirect")
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it("refuses a deleted activity without writing the registration or questionnaire", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "registration", deleted_at: "2026-09-29T00:30:00Z" }))
    expect(await submitSurvey(input)).toEqual({ error: "roundNotFound" })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("explains deletion during filling when the database rejects a concurrent write", async () => {
    mocks.from.mockReturnValueOnce(readRound(round)).mockReturnValueOnce({ upsert: mocks.upsert })
      .mockReturnValueOnce(readRound({ ...round, deleted_at: "2026-09-29T01:00:00Z" }))
    mocks.upsert.mockResolvedValue({ error: { message: "ROUND_DELETED" } })
    expect(await submitSurvey(input)).toEqual({ error: "roundNotFound" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("explains deletion during filling when RLS hides the retained round", async () => {
    mocks.from.mockReturnValueOnce(readRound(round)).mockReturnValueOnce({ upsert: mocks.upsert })
      .mockReturnValueOnce(readRound(null))
    mocks.upsert.mockResolvedValue({ error: { message: "ROUND_NOT_FOUND" } })
    expect(await submitSurvey(input)).toEqual({ error: "roundNotFound" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("accepts a fixed activity registration without any availability and stores its schema revision", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "registration", config_revision: 2 }))
    expect(await submitSurvey({ ...input, availability: {}, configRevision: 2 })).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("manage_my_registration", {
      p_round_id: "round", p_operation: "create", p_expected_updated_at: null, p_custom_answers: {}, p_config_revision: 2,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/activity-reviews")
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("passes explicit rejoin intent and the exact saved version without accepting another member", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "registration" }))
    const version = "2026-09-29T00:10:00.123456Z"
    expect(await submitSurvey({ ...input, availability: {}, registrationIntent: "rejoin", expectedUpdatedAt: version })).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("manage_my_registration", expect.objectContaining({ p_operation: "rejoin", p_expected_updated_at: version }))
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_member_id")
  })

  it("rejects an update lacking the original version before a write", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "registration" }))
    expect(await submitSurvey({ ...input, registrationIntent: "update" })).toEqual({ error: "invalidSurveyInput" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("explains stale registration state and does not report success", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "registration" }))
    mocks.rpc.mockResolvedValue({ error: { message: "REGISTRATION_STATE_CHANGED" } })
    expect(await submitSurvey(input)).toEqual({ error: "registrationChanged" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("a registration deadline race uses submission wording instead of cancellation wording", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "registration" }))
      .mockReturnValueOnce(readRound({ ...round, purpose: "registration", survey_end: "2026-09-29T01:00:00Z" }))
    mocks.rpc.mockResolvedValue({ error: { message: "REGISTRATION_CANCEL_UNAVAILABLE" } })
    expect(await submitSurvey(input)).toEqual({ error: "surveyExpired" })
  })

  it("rejects submissions to announcements", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "announcement" }))
    expect(await submitSurvey(input)).toEqual({ error: "surveyReadOnly" })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("requires the current configuration revision", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, config_revision: 2 }))
    expect(await submitSurvey({ ...input, configRevision: 1 })).toEqual({ error: "surveyUpdated" })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("explains a configuration edit which raced with submission", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, config_revision: 0 })).mockReturnValueOnce({ upsert: mocks.upsert })
      .mockReturnValueOnce(readRound({ ...round, config_revision: 1 }))
    mocks.upsert.mockResolvedValue({ error: { code: "P0001" } })
    expect(await submitSurvey(input)).toEqual({ error: "surveyUpdated" })
  })

  it("enforces activity questions on the server even when a client bypasses the form", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "registration", content_config: {
      questions: [{ id: "need", type: "text", label: { zh: "必填", ja: "" }, required: true, options: [] }],
    } }))
    expect(await submitSurvey(input)).toEqual({ error: "customQuestionRequired" })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
