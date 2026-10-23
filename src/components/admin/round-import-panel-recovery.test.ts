// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ImportReceipt } from "@/lib/matching/round-import-contract"
import { roundImportRequestId } from "./round-import-request"

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/admin/matching/rounds/[id]/import-actions", () => ({
  previewRoundExcel: vi.fn(), importRoundExcel: vi.fn(), getRoundImportReceipt: mocks.get, listRoundImports: mocks.list, cancelRoundImportRequest: vi.fn(),
}))
import { RoundImportPanel } from "./RoundImportPanel"

const id = "00000000-0000-4000-8000-000000000001"
const receipt: ImportReceipt = {
  id, round_id: "round-a", status: "succeeded", created_at: "2026-10-23T01:00:00Z", completed_at: "2026-10-23T01:01:00Z",
  reason: "恢复中断的导入回执", error_code: null, error_message: null,
  summary: { totalRows: 1, currentCount: 1, legacyCount: 0, tempCount: 0, warningCount: 0, insertedCount: 0, updatedCount: 1, unchangedCount: 0, affectedBatchIds: [] },
}
let root: Root

describe("Excel import recovery after page reload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    sessionStorage.clear()
    roundImportRequestId("round-a", sessionStorage, () => id)
    document.body.innerHTML = '<div id="root"></div>'
    root = createRoot(document.getElementById("root")!)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    sessionStorage.clear()
  })

  it("adds the recovered receipt to history when the parallel history query predates completion", async () => {
    mocks.list.mockResolvedValue({ receipts: [] })
    mocks.get.mockResolvedValue({ receipt })
    await act(async () => root.render(createElement(RoundImportPanel, { roundId: "round-a", roundStatus: "open" })))
    expect(document.body.textContent).toContain("本轮导入记录（1）")
    expect(document.body.textContent).toContain(id)
    expect(document.body.textContent).toContain("导入完成")
    expect(document.body.textContent).not.toContain("导入状态待确认")
    expect(sessionStorage.length).toBe(0)
  })

  it("keeps an unconfirmed operation and blocks editing while the receipt is absent", async () => {
    mocks.list.mockResolvedValue({ receipts: [] })
    mocks.get.mockResolvedValue({ receipt: null })
    await act(async () => root.render(createElement(RoundImportPanel, { roundId: "round-a", roundStatus: "open" })))
    expect(document.body.textContent).toContain("导入状态待确认")
    expect(document.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true)
    expect(document.querySelector<HTMLTextAreaElement>('#round-import-reason-round-a')!.disabled).toBe(true)
    expect(sessionStorage.length).toBe(1)
    expect(document.body.textContent).toContain("终止此编号，重新预览")
    expect(document.body.textContent).not.toContain("沿用原编号重试")
  })

  it("does not duplicate a receipt already included in the parallel history query", async () => {
    mocks.list.mockResolvedValue({ receipts: [receipt] })
    mocks.get.mockResolvedValue({ receipt })
    await act(async () => root.render(createElement(RoundImportPanel, { roundId: "round-a", roundStatus: "open" })))
    expect(document.body.textContent).toContain("本轮导入记录（1）")
    expect(document.body.textContent).not.toContain("本轮导入记录（2）")
  })
})
