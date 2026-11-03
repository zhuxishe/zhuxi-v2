import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ admin: vi.fn(), build: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ getAdmin: mocks.admin }))
vi.mock("./board-csv-service", () => ({ buildMatchingBoardCsvTemplate: mocks.build,
  MatchingBoardCsvError: class extends Error { constructor(message: string, readonly status = 400, readonly stale = false) { super(message) } } }))
import { MatchingBoardCsvError } from "./board-csv-service"
import { GET } from "@/app/admin/matching/[id]/adjustment-template/route"
const get = () => GET(new NextRequest("https://example.invalid/admin/matching/session/adjustment-template?revision=rev&signature=sig"), { params: Promise.resolve({ id: "session" }) })
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ role: "super_admin" }); mocks.build.mockResolvedValue({ csv: "\uFEFF姓名\r\n虚构玩家", fileName: "匹配人工调整.csv" }) })
describe("CSV template download route", () => {
  it("returns a private UTF-8 download bound to the reviewed version", async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(mocks.build).toHaveBeenCalledExactlyOnceWith("session", "rev", "sig")
    expect(response.headers.get("content-type")).toContain("text/csv")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("content-disposition")).toContain(encodeURIComponent("匹配人工调整.csv"))
    expect(await response.text()).toContain("虚构玩家")
  })
  it("returns JSON for missing or insufficient authentication without reading a board", async () => {
    mocks.admin.mockResolvedValue(null)
    const missing = await get(); expect(missing.status).toBe(401); expect(missing.headers.get("content-type")).toContain("json")
    mocks.admin.mockResolvedValue({ role: "admin" })
    expect((await get()).status).toBe(403)
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it("returns a stale conflict or safe generic failure instead of a CSV error download", async () => {
    mocks.build.mockRejectedValue(new MatchingBoardCsvError("请重新下载模板", 409, true))
    const stale = await get(); expect(stale.status).toBe(409); expect(stale.headers.has("content-disposition")).toBe(false)
    mocks.build.mockRejectedValue(new Error("PRIVATE-CREDENTIAL"))
    expect(JSON.stringify(await (await get()).json())).not.toContain("PRIVATE-")
  })
})
