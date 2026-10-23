import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), parse: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock("./round-import-parser", () => ({ parseRoundImportWorkbook: mocks.parse }))
import { loadRoundImportContext, loadRoundImportReviewContext } from "./round-import-context"

describe("round import deletion guard", () => {
  beforeEach(() => { vi.resetAllMocks() })

  it("rejects a retained deleted round before parsing Excel or accessing member data", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
    query.single.mockResolvedValue({ data: { id: "round", purpose: "matching", status: "closed", deleted_at: "2026-10-10T00:00:00Z" }, error: null })
    mocks.from.mockReturnValue(query)
    await expect(loadRoundImportContext("round", Buffer.from("test"))).rejects.toThrow("轮次不存在")
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.parse).not.toHaveBeenCalled()
  })

  it.each([
    [{ purpose: "registration", status: "open" }, "活动报名和通知不支持导入匹配问卷"],
    [{ purpose: "matching", status: "matched" }, "该轮次已完成匹配，禁止导入 Excel"],
    [{ purpose: "matching", status: "open", content_config: { questions: [{ id: "required", type: "text", required: true, label: { zh: "必填补充问题" }, options: [] }] } }, "本轮含必填补充问题"],
  ])("retains the read-only preview prohibition for %j", async (round, expected) => {
    mocks.rpc.mockResolvedValue({ data: { round, round_token: "current-round" }, error: null })
    await expect(loadRoundImportReviewContext("round", Buffer.from("test"), "actor")).rejects.toThrow(expected)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_preview_round_import_state", { p_round_id: "round", p_actor_admin_id: "actor" })
    expect(mocks.parse).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
