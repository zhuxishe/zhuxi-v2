import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => {
  class StaleError extends Error { constructor() { super("方案或报名资料已变化，请重新核对后导出") } }
  return { admin: vi.fn(), build: vi.fn(), StaleError }
})
vi.mock("@/lib/auth/admin", () => ({ getAdmin: mocks.admin }))
vi.mock("./session-export", () => ({ buildSessionExportWorkbook: mocks.build }))
vi.mock("./session-review-service", () => ({ MatchingReviewStaleError: mocks.StaleError }))
import { GET } from "@/app/admin/matching/[id]/export/route"

const get = (query = "") => GET(new NextRequest(`https://example.invalid/admin/matching/session/export${query}`), { params: Promise.resolve({ id: "session" }) })
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ role: "super_admin" }); mocks.build.mockResolvedValue({ buffer: Buffer.from("xlsx"), fileName: "匹配结果.xlsx" }) })

describe("review-bound export route", () => {
  it("passes the reviewed version to the builder and prevents caching", async () => {
    const response = await get("?revision=rev&signature=sig")
    expect(mocks.build).toHaveBeenCalledExactlyOnceWith("session", { expectedRevision: "rev", expectedPublicationSignature: "sig" })
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml.sheet")
    expect(response.headers.get("Content-Disposition")).toContain(encodeURIComponent("匹配结果.xlsx"))
  })
  it("reports stale review as a conflict instead of downloading a different scheme", async () => {
    mocks.build.mockRejectedValue(new mocks.StaleError())
    const response = await get("?revision=old")
    expect(response.status).toBe(409)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await response.json()).toEqual({ error: "方案或报名资料已变化，请重新核对后导出" })
    expect(response.headers.has("Content-Disposition")).toBe(false)
  })
  it("requires an authenticated super administrator before any data read", async () => {
    mocks.admin.mockResolvedValue({ role: "admin" })
    expect((await get()).status).toBe(403)
    mocks.admin.mockResolvedValue(null)
    expect((await get()).headers.get("Location")).toBe("https://example.invalid/admin/login")
    expect(mocks.build).not.toHaveBeenCalled()
  })
})
