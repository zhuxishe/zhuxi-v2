import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), player: vi.fn(), revalidate: vi.fn(), rpc: vi.fn(), readiness: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.player }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/matching/readiness-server", () => ({ fetchMyMatchingReadiness: mocks.readiness }))
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
    mocks.rpc.mockResolvedValue({ error: null })
    mocks.readiness.mockResolvedValue({ supplementary: true, personality: true, quiz: true, missing: [] })
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
    expect(mocks.from).not.toHaveBeenCalledWith("match_round_submissions")
  })

  it("creates with an explicit absent answer token and refreshes the notification layout and form", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
    expect(await submitSurvey(input)).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("save_my_matching_submission", {
      p_round_id: "round", p_submission_id: null, p_expected_updated_at: null, p_config_revision: 0,
      p_answers: expect.objectContaining({ message: input.message, availability: input.availability }),
    })
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_member_id")
    expect(mocks.revalidate).toHaveBeenCalledWith("/app", "layout")
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/matching/survey")
  })

  it("explains a closure between validation and the database write", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
      .mockReturnValueOnce(readRound({ ...round, status: "closed" }))
    mocks.rpc.mockResolvedValue({ error: { code: "42501" } })
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
    expect(mocks.from).not.toHaveBeenCalledWith("match_round_submissions")
  })

  it("explains deletion during filling when the database rejects a concurrent write", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
      .mockReturnValueOnce(readRound({ ...round, deleted_at: "2026-09-29T01:00:00Z" }))
    mocks.rpc.mockResolvedValue({ error: { message: "ROUND_DELETED" } })
    expect(await submitSurvey(input)).toEqual({ error: "roundNotFound" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("explains deletion during filling when RLS hides the retained round", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
      .mockReturnValueOnce(readRound(null))
    mocks.rpc.mockResolvedValue({ error: { message: "ROUND_NOT_FOUND" } })
    expect(await submitSurvey(input)).toEqual({ error: "roundNotFound" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("accepts a fixed activity registration without any availability and stores its schema revision", async () => {
    mocks.readiness.mockRejectedValue(new Error("Profile checks must not affect fixed activities"))
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "registration", config_revision: 2 }))
    expect(await submitSurvey({ ...input, availability: {}, configRevision: 2 })).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("manage_my_registration", {
      p_round_id: "round", p_operation: "create", p_expected_updated_at: null, p_custom_answers: {}, p_config_revision: 2,
    })
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/activity-reviews")
    expect(mocks.from).not.toHaveBeenCalledWith("match_round_submissions")
    expect(mocks.readiness).not.toHaveBeenCalled()
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
    expect(mocks.from).not.toHaveBeenCalledWith("match_round_submissions")
    expect(mocks.readiness).not.toHaveBeenCalled()
  })

  it("requires the current configuration revision", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, config_revision: 2 }))
    expect(await submitSurvey({ ...input, configRevision: 1 })).toEqual({ error: "surveyUpdated" })
    expect(mocks.from).not.toHaveBeenCalledWith("match_round_submissions")
  })

  it("explains a configuration edit which raced with submission", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, config_revision: 0 }))
      .mockReturnValueOnce(readRound({ ...round, config_revision: 1 }))
    mocks.rpc.mockResolvedValue({ error: { code: "P0001" } })
    expect(await submitSurvey(input)).toEqual({ error: "surveyUpdated" })
  })

  it("enforces activity questions on the server even when a client bypasses the form", async () => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "registration", content_config: {
      questions: [{ id: "need", type: "text", label: { zh: "必填", ja: "" }, required: true, options: [] }],
    } }))
    expect(await submitSurvey(input)).toEqual({ error: "customQuestionRequired" })
    expect(mocks.from).not.toHaveBeenCalledWith("match_round_submissions")
  })

  it.each(["supplementary", "personality", "quiz"])("rejects a direct matching submission missing %s without writing", async (missing) => {
    mocks.from.mockReturnValueOnce(readRound({ ...round, purpose: "matching" }))
    mocks.readiness.mockResolvedValue({ supplementary: true, personality: true, quiz: true, [missing]: false, missing: [missing] })
    expect(await submitSurvey(input)).toEqual({ error: "matchingProfileIncomplete", missingProfiles: [missing] })
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.from).not.toHaveBeenCalledWith("match_round_submissions")
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it.each(["create", "update", "rejoin"] as const)("checks incomplete profiles for matching %s and retains the existing answer", async (registrationIntent) => {
    mocks.from.mockReturnValueOnce(readRound(round))
    mocks.readiness.mockResolvedValue({ supplementary: false, personality: false, quiz: false, missing: ["supplementary", "personality", "quiz"] })
    expect(await submitSurvey({ ...input, registrationIntent })).toEqual({
      error: "matchingProfileIncomplete", missingProfiles: ["supplementary", "personality", "quiz"],
    })
    expect(mocks.from).not.toHaveBeenCalledWith("match_round_submissions")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("fails closed with retry wording when profile completion cannot be read", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
    mocks.readiness.mockRejectedValue(new Error("Read failed"))
    expect(await submitSurvey(input)).toEqual({ error: "matchingProfileCheckFailed" })
    expect(mocks.from).not.toHaveBeenCalledWith("match_round_submissions")
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("explains a profile change rejected by the database after the initial completeness check", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
    mocks.readiness.mockResolvedValueOnce({ supplementary: true, personality: true, quiz: true, missing: [] })
      .mockResolvedValueOnce({ supplementary: true, personality: false, quiz: false, missing: ["personality", "quiz"] })
    mocks.rpc.mockResolvedValue({ error: { message: "MATCHING_PROFILE_INCOMPLETE" } })
    expect(await submitSurvey(input)).toEqual({ error: "matchingProfileIncomplete", missingProfiles: ["personality", "quiz"] })
    expect(mocks.readiness).toHaveBeenCalledTimes(2)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("reports a retry if profile status cannot be re-read after a database rejection", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
    mocks.readiness.mockResolvedValueOnce({ supplementary: true, personality: true, quiz: true, missing: [] })
      .mockRejectedValueOnce(new Error("Read failed"))
    mocks.rpc.mockResolvedValue({ error: { message: "MATCHING_PROFILE_INCOMPLETE" } })
    expect(await submitSurvey(input)).toEqual({ error: "matchingProfileCheckFailed" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("passes the exact saved answer identity and microsecond token to the atomic matching update", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
    const version = "2026-09-29T00:10:00.123456Z"
    expect(await submitSurvey({ ...input, submissionId: "answer", expectedUpdatedAt: version })).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("save_my_matching_submission", expect.objectContaining({
      p_submission_id: "answer", p_expected_updated_at: version,
    }))
  })

  it.each([{ message: "MATCHING_SUBMISSION_CHANGED", code: "40001" }, { code: "23505" }])("reports an answer conflict without discarding input or claiming success", async (error) => {
    mocks.from.mockReturnValueOnce(readRound(round))
    mocks.rpc.mockResolvedValue({ error })
    expect(await submitSurvey(input)).toEqual({ error: "surveyResponseChanged" })
    expect(input.message).toBe("existing answer")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("requires the loaded timestamp key for an existing matching answer", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
    expect(await submitSurvey({ ...input, submissionId: "answer" })).toEqual({ error: "invalidSurveyInput" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("retains a historical NULL timestamp while identifying the existing answer", async () => {
    mocks.from.mockReturnValueOnce(readRound(round))
    expect(await submitSurvey({ ...input, submissionId: "answer", expectedUpdatedAt: null })).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("save_my_matching_submission", expect.objectContaining({ p_submission_id: "answer", p_expected_updated_at: null }))
  })
})
