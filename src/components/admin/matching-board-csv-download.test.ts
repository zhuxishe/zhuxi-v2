// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { downloadMatchingBoardCsv, MatchingBoardCsvDownloadError } from "./matching-board-csv-download"

const fetchMock = vi.fn(), createUrl = vi.fn(), revokeUrl = vi.fn()
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("URL", class extends URL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl })
  createUrl.mockReset().mockReturnValue("blob:local-csv"); revokeUrl.mockReset(); fetchMock.mockReset()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = "" })

describe("reviewed matching CSV template download", () => {
  it("downloads only CSV, carries the reviewed revision, and releases its temporary object URL", async () => {
    fetchMock.mockResolvedValue(new Response("\uFEFF姓名,目标池\r\n示例,未匹配\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename*=UTF-8''%E8%B0%83%E6%95%B4.csv" } }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("调整.csv"); expect(this.href).toBe("blob:local-csv") })
    await downloadMatchingBoardCsv("session", "saved-revision", "review-signature")
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/admin/matching/session/adjustment-template?revision=saved-revision&signature=review-signature", { cache: "no-store" })
    expect(click).toHaveBeenCalledOnce(); expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:local-csv")
    expect(document.querySelector("a")).toBeNull()
  })
  it("rejects a redirected login HTML page instead of saving it as CSV", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } }))
    await expect(downloadMatchingBoardCsv("session", "rev", "sig")).rejects.toThrow("登录状态")
    expect(createUrl).not.toHaveBeenCalled()
  })
  it("reports a stale saved plan without downloading a different version", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "方案已变化，请下载最新模板" }), { status: 409, headers: { "Content-Type": "application/json" } }))
    await expect(downloadMatchingBoardCsv("session", "rev", "sig")).rejects.toMatchObject({ message: "方案已变化，请下载最新模板", stale: true })
    expect(createUrl).not.toHaveBeenCalled()
  })
  it("keeps permission errors readable and does not treat them as successful downloads", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "仅超级管理员可下载" }), { status: 403, headers: { "Content-Type": "application/json" } }))
    await expect(downloadMatchingBoardCsv("session", "rev", "sig")).rejects.toBeInstanceOf(MatchingBoardCsvDownloadError)
    expect(createUrl).not.toHaveBeenCalled()
  })
})
