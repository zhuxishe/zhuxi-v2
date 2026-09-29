import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), admin: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { updateRoundStatus } from "./status-actions"

const round = { status: "closed", survey_start: "2026-09-01T00:00:00Z", survey_end: "2026-09-10T09:00:00Z" }
const opening = { surveyStart: "2026-09-29T10:00", surveyEnd: "2026-09-30T18:00" }
function query(data: unknown, error: unknown = null) {
  const builder = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), update: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }
  for (const method of [builder.select, builder.eq, builder.limit, builder.update]) method.mockReturnValue(builder)
  builder.single.mockResolvedValue({ data, error })
  builder.maybeSingle.mockResolvedValue({ data, error })
  return builder
}

describe("administrator survey reopening", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime("2026-09-29T01:00:00Z")
    mocks.admin.mockResolvedValue({ id: "admin" })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it.each(["closed", "open", "draft"])("opens a %s round with confirmed future dates without touching submissions", async (status) => {
    const update = query({ id: "round" })
    mocks.from.mockReturnValueOnce(query({ ...round, status })).mockReturnValueOnce(query(null)).mockReturnValueOnce(update)
    expect(await updateRoundStatus("round", "open", opening)).toEqual({ success: true })
    expect(update.update).toHaveBeenCalledWith({ status: "open", survey_start: "2026-09-29T01:00:00.000Z", survey_end: "2026-09-30T09:00:00.000Z" })
    expect(update.eq).toHaveBeenCalledWith("status", status)
    expect(update.eq).toHaveBeenCalledWith("survey_start", round.survey_start)
    expect(update.eq).toHaveBeenCalledWith("survey_end", round.survey_end)
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["match_rounds", "match_sessions", "match_rounds"])
    expect(mocks.revalidate).toHaveBeenCalledWith("/app")
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/matching/survey")
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/matching/rounds/round")
  })

  it("rejects a reopening with an expired deadline", async () => {
    mocks.from.mockReturnValueOnce(query(round))
    const result = await updateRoundStatus("round", "open", { ...opening, surveyStart: "2026-09-28T10:00", surveyEnd: "2026-09-29T10:00" })
    expect(result.error).toContain("未来的截止时间")
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it("requires confirming dates even when the existing deadline is still in the future", async () => {
    mocks.from.mockReturnValueOnce(query({ ...round, survey_end: "2026-10-01T00:00:00Z" }))
    expect((await updateRoundStatus("round", "open")).error).toContain("确认")
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it("blocks already matched rounds", async () => {
    mocks.from.mockReturnValueOnce(query({ ...round, status: "matched" }))
    expect((await updateRoundStatus("round", "open", opening)).error).toContain("已匹配")
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it("blocks reopening once a matching session exists, including a run still being saved", async () => {
    mocks.from.mockReturnValueOnce(query(round)).mockReturnValueOnce(query({ id: "session" }))
    expect((await updateRoundStatus("round", "open", opening)).error).toContain("匹配记录或正在运行匹配")
    expect(mocks.from).toHaveBeenCalledTimes(2)
  })

  it("fails closed if matching state cannot be checked", async () => {
    mocks.from.mockReturnValueOnce(query(round)).mockReturnValueOnce(query(null, { message: "unavailable" }))
    expect((await updateRoundStatus("round", "open", opening)).error).toContain("无法确认")
    expect(mocks.from).toHaveBeenCalledTimes(2)
  })

  it("does not report success when another administrator has changed the round", async () => {
    mocks.from.mockReturnValueOnce(query(round)).mockReturnValueOnce(query(null)).mockReturnValueOnce(query(null))
    expect((await updateRoundStatus("round", "open", opening)).error).toContain("已变更")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("still permits manual closure without editing the collection dates", async () => {
    const update = query({ id: "round" })
    mocks.from.mockReturnValueOnce(query({ ...round, status: "open" })).mockReturnValueOnce(update)
    expect(await updateRoundStatus("round", "closed")).toEqual({ success: true })
    expect(update.update).toHaveBeenCalledWith({ status: "closed" })
  })

  it("requires administrator access before querying or changing a round", async () => {
    mocks.admin.mockRejectedValue(new Error("unauthorized"))
    await expect(updateRoundStatus("round", "open", opening)).rejects.toThrow("unauthorized")
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
