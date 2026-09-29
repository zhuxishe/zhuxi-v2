import { beforeEach, describe, expect, it, vi } from "vitest"
import { normalizeRoundConfig } from "@/lib/matching/round-config"
import type { RoundContentDraft } from "@/types/matching-round"

const mocks = vi.hoisted(() => ({ from: vi.fn(), countFrom: vi.fn(), revalidate: vi.fn(), auth: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.countFrom }) }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.auth }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { copyRound, saveRoundContent } from "./content-actions"

const draft = (): RoundContentDraft => ({ roundName: "活动", purpose: "matching", surveyStart: "2027-10-01T12:00", surveyEnd: "2027-10-09T12:00", activityStart: "2027-10-10", activityEnd: "2027-10-11", contentConfig: normalizeRoundConfig({}) })
const round = () => ({ id: "round", round_name: "活动", status: "draft", purpose: "matching", survey_start: "2027-10-01T03:00:00Z", survey_end: "2027-10-09T03:00:00Z", activity_start: "2027-10-10", activity_end: "2027-10-11", content_config: {}, config_revision: 0 })
function query(data: unknown, error: unknown = null) {
  const q = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), insert: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }
  for (const fn of [q.select, q.eq, q.update, q.insert]) fn.mockReturnValue(q)
  q.single.mockResolvedValue({ data, error }); q.maybeSingle.mockResolvedValue({ data, error })
  return q
}
function count(value: number, error: unknown = null) {
  mocks.countFrom.mockReturnValue({ select: () => ({ eq: async () => ({ count: value, error }) }) })
}

describe("round content editing", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: "admin" }); count(0) })
  it("reports setup pending without attempting writes on the legacy database", async () => {
    const legacy = { ...round(), config_revision: undefined }; delete legacy.config_revision
    mocks.from.mockReturnValue(query(legacy))
    expect((await saveRoundContent("round", 0, draft())).error).toContain("数据库升级")
    expect(mocks.countFrom).not.toHaveBeenCalled()
  })
  it("rejects stale edits", async () => {
    mocks.from.mockReturnValue(query({ ...round(), config_revision: 2 }))
    expect((await saveRoundContent("round", 0, draft())).error).toContain("其他管理员")
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
  it("locks purpose after answers, even for a direct server action request", async () => {
    mocks.from.mockReturnValue(query(round())); count(1)
    expect((await saveRoundContent("round", 0, { ...draft(), purpose: "announcement" })).error).toContain("不能修改")
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
  it("allows copy edits after answers and guards concurrent administrator writes", async () => {
    const update = query({ config_revision: 1 }); count(1)
    mocks.from.mockReturnValueOnce(query(round())).mockReturnValueOnce(update)
    const input = draft(); input.contentConfig.cardTitle.zh = "欢迎参加"
    expect(await saveRoundContent("round", 0, input)).toEqual({ revision: 1 })
    expect(update.eq).toHaveBeenCalledWith("config_revision", 0)
    expect(mocks.auth).toHaveBeenCalledOnce()
  })
  it("does not overwrite when a parallel save wins", async () => {
    mocks.from.mockReturnValueOnce(query(round())).mockReturnValueOnce(query(null))
    expect((await saveRoundContent("round", 0, draft())).error).toContain("其他管理员")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("handles database answer-versus-structure race rejection", async () => {
    mocks.from.mockReturnValueOnce(query(round())).mockReturnValueOnce(query(null, { message: "ROUND_STRUCTURE_LOCKED" }))
    expect((await saveRoundContent("round", 0, draft())).error).toContain("已有新回答")
  })
  it("refuses to save registration deadline after activity start", async () => {
    mocks.from.mockReturnValue(query(round()))
    const input = draft(); input.purpose = "registration"; input.contentConfig.eventStart = "2027-10-08T03:00:00Z"; input.contentConfig.eventEnd = "2027-10-08T05:00:00Z"
    expect((await saveRoundContent("round", 0, input)).error).toContain("不能晚于")
  })
  it("copies historic registration as a draft without invalidating its original deadline", async () => {
    const source = { ...round(), purpose: "registration", survey_start: "2025-10-01T00:00:00Z", survey_end: "2025-10-09T00:00:00Z", content_config: { eventStart: "2025-10-10T00:00:00Z", eventEnd: "2025-10-10T03:00:00Z", location: { zh: "东京", ja: "" } } }
    const insert = query({ id: "copy" }); mocks.from.mockReturnValueOnce(query(source)).mockReturnValueOnce(insert)
    expect(await copyRound("round")).toEqual({ roundId: "copy" })
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", survey_start: source.survey_start, survey_end: source.survey_end, content_config: source.content_config }))
  })
})
