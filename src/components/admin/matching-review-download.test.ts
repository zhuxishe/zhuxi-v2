// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { downloadMatchingReview, MatchingReviewDownloadError } from "./matching-review-download"

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe("reviewed-result download", () => {
  it("binds both versions, downloads literal filename and releases the blob URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Blob(["xlsx"]), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="%E5%8C%B9%E9%85%8D.xlsx"',
    } }))
    vi.stubGlobal("fetch", fetcher)
    const create = vi.fn(() => "blob:review"), revoke = vi.fn()
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("匹配.xlsx"); expect(this.href).toBe("blob:review")
    })
    await downloadMatchingReview("session", "saved-version", "review-signature")
    expect(fetcher).toHaveBeenCalledWith("/admin/matching/session/export?revision=saved-version&signature=review-signature", { cache: "no-store" })
    expect(click).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith("blob:review")
    expect(document.querySelector("a")).toBeNull()
  })
  it("reports a stale review without downloading another version", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "方案已变化，请重新核对" }), { status: 409 })))
    const error = await downloadMatchingReview("session", "old", "signature").catch((error) => error)
    expect(error).toBeInstanceOf(MatchingReviewDownloadError)
    expect(error.stale).toBe(true)
    expect(error.message).toContain("重新核对")
  })
  it("rejects a login redirect HTML response instead of saving it as an Excel file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } })))
    await expect(downloadMatchingReview("session", "revision", "signature")).rejects.toThrow("登录")
  })
})
