import { beforeEach, describe, expect, it, vi } from "vitest"
import { createClient } from "@supabase/supabase-js"

const mocks = vi.hoisted(() => ({ from: vi.fn(), parse: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock("./round-import-parser", () => ({ parseRoundImportWorkbook: mocks.parse }))
import { fetchCurrentImportMembers, loadRoundImportContext, loadRoundImportReviewContext } from "./round-import-context"

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

describe("round import identity domains", () => {
  const members = [
    { id: "test", member_number: "TST_001", is_test: true, member_identity: { full_name: "测试一", nickname: null } },
    { id: "controlled-real", member_number: "ZXS_000", is_test: false, member_identity: { full_name: "官方", nickname: null } },
    { id: "other-real", member_number: "ZXS_099", is_test: false, member_identity: { full_name: "其他会员", nickname: null } },
  ]

  it("excludes test identities from formal import choices but includes only allowlisted identities in a test round", async () => {
    const requests: URL[] = []
    const db = createClient("https://import-identity-scope.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async input => {
        const url = new URL(String(input)); requests.push(url)
        const p = url.searchParams
        return Response.json(members.filter(member => (p.get("is_test") !== "eq.false" || !member.is_test)
          && (!p.get("id") || p.get("id")!.slice(4, -1).split(",").includes(member.id))))
      } },
    })
    expect((await fetchCurrentImportMembers(db)).map(member => member.id)).toEqual(["controlled-real", "other-real"])
    expect((await fetchCurrentImportMembers(db, ["test", "controlled-real"])).map(member => member.id)).toEqual(["test", "controlled-real"])
    expect(requests[0].searchParams.get("is_test")).toBe("eq.false")
    expect(requests[1].searchParams.get("id")).toBe("in.(test,controlled-real)")
    expect(await fetchCurrentImportMembers(db, [])).toEqual([])
    expect(requests).toHaveLength(2)
  })

  it("refuses the old import path for test rounds before reading unscoped member lists", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
    query.single.mockResolvedValue({ data: { id: "round", purpose: "matching", status: "open", is_test: true }, error: null })
    mocks.from.mockReturnValue(query); mocks.parse.mockReset()
    await expect(loadRoundImportContext("round", Buffer.from("test"))).rejects.toThrow("当前的导入预览流程")
    expect(mocks.parse).not.toHaveBeenCalled()
  })
})
