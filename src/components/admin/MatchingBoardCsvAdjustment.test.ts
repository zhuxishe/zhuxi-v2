// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { TextDecoder, TextEncoder } from "node:util"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BoardCsvPreviewResult } from "@/lib/matching/board-csv-types"

const mocks = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn(), download: vi.fn() }))
vi.mock("@/app/admin/matching/[id]/board-actions", () => ({ previewBoardCsv: mocks.preview, applyBoardCsv: mocks.apply }))
vi.mock("./matching-board-csv-download", async (original) => ({ ...await original<typeof import("./matching-board-csv-download")>(), downloadMatchingBoardCsv: mocks.download }))
import { MatchingBoardCsvAdjustment } from "./MatchingBoardCsvAdjustment"
import { MatchingBoardCsvDownloadError } from "./matching-board-csv-download"

const onApplied = vi.fn(), onStale = vi.fn(), onNotice = vi.fn(), onError = vi.fn()
const base = { sessionId: "session", revisionToken: "saved-rev", publicationSignature: "saved-signature", boardFingerprint: "saved-board", disabled: false, onApplied, onStale, onNotice, onError }
type Props = Parameters<typeof MatchingBoardCsvAdjustment>[0]
let props: Props, root: Root
function result(overrides: Partial<NonNullable<BoardCsvPreviewResult["preview"]>> = {}): BoardCsvPreviewResult {
  return { success: true, warnings: ["M01为人工7人组，请核对人数。"], preview: {
    draft: { duos: [], multi: null, multiMode: "grouped", multiGroups: [{ key: "M01", groupKind: "small", manuallyAdjusted: true, memberIds: ["a", "b", "c"], bestSlot: "2026-11-14_下午" }], waitingDuoIds: [], brokenPairs: [], unmatchedIds: [], unmatchedMessage: "保留当前留言" },
    rows: [], revisionToken: "saved-rev", unchanged: false,
    summary: { before: { duoGroups: 1, multiGroups: 0, matched: 2, unmatched: 1, waitingDuo: 0, waitingMulti: 0 }, after: { duoGroups: 0, multiGroups: 1, matched: 3, unmatched: 0, waitingDuo: 0, waitingMulti: 0 }, changedMembers: 3, createdGroups: 1, removedGroups: 1, changedTimes: 0 },
    changes: ["a", "b", "c"].map((id) => ({ memberId: id, name: `示例${id}`, before: "原双人或未匹配", after: "多人M01 · 2026-11-14 下午" })),
    ...overrides,
  } }
}
function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label)
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
async function click(label: string) { await act(async () => button(label).click()) }
async function render(overrides: Partial<Props> = {}) {
  props = { ...props, ...overrides }
  await act(async () => root.render(createElement(MatchingBoardCsvAdjustment, props)))
}
function csvFile(name = "人工调整.csv", text = "完整CSV", bytes?: Uint8Array) {
  const data = bytes ?? new TextEncoder().encode(text)
  const file = new File([new Uint8Array(data)], name, { type: "text/csv" })
  Object.defineProperty(file, "arrayBuffer", { value: vi.fn(async () => new Uint8Array(data).buffer) })
  return file
}
async function upload(file = csvFile()) {
  const input = document.querySelector<HTMLInputElement>('[aria-label="选择人工调整CSV文件"]')!
  Object.defineProperty(input, "files", { configurable: true, value: [file] })
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })))
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal("matchMedia", vi.fn((media) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.stubGlobal("TextDecoder", TextDecoder)
  vi.resetAllMocks(); props = { ...base }
  mocks.preview.mockResolvedValue(result()); mocks.apply.mockResolvedValue(result()); mocks.download.mockResolvedValue(undefined)
  document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.getElementById("root")!)
})
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe("CSV validate, preview and local draft workflow", () => {
  it("shows the diff first and revalidates the original CSV before applying a complete local draft", async () => {
    await render(); await upload()
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith({ sessionId: "session", expectedRevision: "saved-rev", csvText: "完整CSV" })
    expect(document.body.textContent).toContain("原双人或未匹配")
    expect(document.body.textContent).toContain("多人M01")
    expect(document.body.textContent).toContain("人工7人组")
    expect(onApplied).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled()
    await click("应用到编辑草稿")
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith({ sessionId: "session", expectedRevision: "saved-rev", csvText: "完整CSV" })
    expect(onApplied).toHaveBeenCalledExactlyOnceWith({ draft: result().preview!.draft, rows: [] })
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("尚未保存或发布"))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it("blocks the entire file on row errors and identifies the affected member and group", async () => {
    mocks.preview.mockResolvedValue({ error: "CSV校验未通过", errors: [{ row: 5, group: "D03", member: "示例甲", message: "双人组需要2人" }] })
    await render(); await upload()
    expect(document.querySelector('[aria-label="CSV校验错误"]')?.textContent).toContain("第5行 · 小组 D03 · 示例甲：双人组需要2人")
    expect(button("应用到编辑草稿").disabled).toBe(true)
    expect(mocks.apply).not.toHaveBeenCalled(); expect(onApplied).not.toHaveBeenCalled()
  })
  it("rejects files over the bound and invalid UTF-8 before any server read", async () => {
    await render()
    const large = csvFile(); Object.defineProperty(large, "size", { value: 1_500_001 })
    await upload(large); expect(document.body.textContent).toContain("超过1.5MB")
    expect(mocks.preview).not.toHaveBeenCalled()
    await click("取消"); await upload(csvFile("错误编码.csv", "", new Uint8Array([255, 254, 1])))
    expect(document.body.textContent).toContain("另存为「CSV UTF-8")
    expect(mocks.preview).not.toHaveBeenCalled()
  })
  it("accepts UTF-8 BOM and retains the selected filename", async () => {
    await render(); await upload(csvFile("十一月方案.CSV", "\uFEFF姓名,目标池\r\n示例,未匹配"))
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ csvText: "姓名,目标池\r\n示例,未匹配" }))
    expect(document.body.textContent).toContain("十一月方案.CSV")
  })
  it("keeps an unchanged CSV as a no-op rather than applying a needless new draft", async () => {
    mocks.preview.mockResolvedValue(result({ unchanged: true, changes: [] }))
    await render(); await upload()
    expect(document.body.textContent).toContain("一致，无需更新")
    expect(button("应用到编辑草稿").disabled).toBe(true)
    expect(onApplied).not.toHaveBeenCalled()
  })
  it("does not apply an old preview after the local board changes", async () => {
    await render(); await upload(); await render({ boardFingerprint: "new-local-edits", disabled: true })
    expect(button("应用到编辑草稿").disabled).toBe(true)
    expect(document.body.textContent).toContain("此CSV预览已过期")
    expect(mocks.apply).not.toHaveBeenCalled(); expect(onApplied).not.toHaveBeenCalled()
  })
  it("rejects stale server revalidation and asks the parent for a read-only refresh", async () => {
    await render(); await upload()
    mocks.apply.mockResolvedValue({ error: "方案已被其他管理员保存，请下载最新模板", stale: true })
    await click("应用到编辑草稿")
    expect(onStale).toHaveBeenCalledWith(expect.stringContaining("其他管理员"))
    expect(onApplied).not.toHaveBeenCalled()
  })
  it("discards an async upload response after cancellation or a changed parent board", async () => {
    let resolve!: (value: BoardCsvPreviewResult) => void
    mocks.preview.mockImplementation(() => new Promise<BoardCsvPreviewResult>((done) => { resolve = done }))
    await render(); await upload(); await click("取消")
    await act(async () => resolve(result()))
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(onApplied).not.toHaveBeenCalled()
  })
  it("disables both entry points when the parent has unsaved, pending, locked or published state", async () => {
    await render({ disabled: true })
    expect(button("下载调整模板CSV").disabled).toBe(true)
    expect(button("上传人工调整CSV").disabled).toBe(true)
    await click("下载调整模板CSV")
    expect(mocks.download).not.toHaveBeenCalled()
  })
  it("downloads the reviewed template and handles stale or ordinary download failures", async () => {
    await render(); await click("下载调整模板CSV")
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith("session", "saved-rev", "saved-signature")
    mocks.download.mockRejectedValueOnce(new MatchingBoardCsvDownloadError("下载版本已过期", true))
    await click("下载调整模板CSV"); expect(onStale).toHaveBeenCalledWith("下载版本已过期")
    mocks.download.mockRejectedValueOnce(new Error("当前没有权限"))
    await click("下载调整模板CSV"); expect(onError).toHaveBeenCalledWith("当前没有权限")
  })
})
