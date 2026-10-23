import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { ImportChoices, ImportReceipt, ImportReview } from "@/lib/matching/round-import-contract"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/admin/matching/rounds/[id]/import-actions", () => ({
  previewRoundExcel: vi.fn(), importRoundExcel: vi.fn(), getRoundImportReceipt: vi.fn(), listRoundImports: vi.fn(), cancelRoundImportRequest: vi.fn(),
}))

import { importValueLabel, RoundImportPreview } from "./RoundImportPreview"
import { RoundImportHistory, RoundImportPanel } from "./RoundImportPanel"

function review(): ImportReview {
  return {
    rows: [{
      rowNumber: 3, name: "同名成员", suggestedMemberId: "formal-id", suggestedLegacyIds: ["legacy-id"], target: "", memberId: null,
      source: null, reusedTemporary: false, cancelled: false, warnings: [], errors: ["请手动确认成员身份"],
      diffs: [
        { field: "game_type_pref", label: "玩法偏好", current: "双人", excel: "多人", choice: "keep", nullable: false, blank: false, different: true },
        { field: "message", label: "备注", current: "线上备注", excel: null, choice: "keep", nullable: true, blank: true, different: true },
      ],
    }],
    memberOptions: [
      { id: "formal-id", member_number: "ZX-42", full_name: "同名成员", nickname: "昵称", temporary: false },
      { id: "temp-id", member_number: "IMP-round-001", full_name: "本轮临时成员", nickname: null, temporary: true },
    ],
    legacyOptions: [{ id: "legacy-id", name: "同名成员", gender: "男", school: "学校", department: "学部" }],
    planToken: null, warnings: [], affectedBatchIds: ["old-batch-id"],
  }
}
function render(choices: ImportChoices = {}, changes: Partial<ImportReview> = {}) {
  return renderToStaticMarkup(createElement(RoundImportPreview, { review: { ...review(), ...changes }, choices, onChange: vi.fn() }))
}
function receipt(changes: Partial<ImportReceipt> = {}): ImportReceipt {
  return {
    id: "import-operation-id", round_id: "round-id", status: "succeeded", created_at: "2026-10-23T01:00:00Z", completed_at: "2026-10-23T01:01:00Z",
    reason: "补录本轮报名成员", error_code: null, error_message: null,
    summary: { totalRows: 3, currentCount: 1, legacyCount: 1, tempCount: 1, warningCount: 0, insertedCount: 1, updatedCount: 1, unchangedCount: 1, affectedBatchIds: ["old-batch-id"] },
    ...changes,
  }
}

describe("Excel import identity and answer review", () => {
  it("shows name matches as suggestions without silently confirming a formal account", () => {
    const html = render()
    expect(html).toContain("同名建议")
    expect(html).toContain("系统不会自动绑定")
    expect(html).toMatch(/<option value="" selected="">请手动选择并确认成员<\/option>/)
    expect(html).not.toMatch(/<option value="formal-id" selected/)
    expect(html).toContain('label="正式成员"')
    expect(html).toContain('label="本轮已有临时成员"')
    expect(html).toContain("ZX-42")
    expect(html).toContain("IMP-round-001")
  })

  it("keeps current answers by default, disables blank Excel overwrite, and offers clear only for nullable fields", () => {
    const html = render({ 3: { target: "member:formal-id" } })
    expect(html).toContain("线上备注")
    expect(html).toContain("已有答案默认保留")
    expect(html.match(/<option value="keep" selected="">保留当前<\/option>/g)).toHaveLength(2)
    expect(html.match(/明确清空/g)).toHaveLength(1)
    expect(html).toMatch(/<option value="excel" disabled="">使用 Excel<\/option>/)
    expect(html).toContain("空白时默认保留已有答案")
  })

  it("shows explicit per-field Excel decisions without applying them to other fields", () => {
    const html = render({ 3: { target: "member:formal-id", fields: { game_type_pref: "excel" } } })
    expect(html).toMatch(/<option value="excel" selected="">使用 Excel<\/option>/)
    expect(html.match(/<option value="keep" selected="">保留当前<\/option>/g)).toHaveLength(1)
  })

  it("shows temporary identity, publishability and old-batch warnings without rewriting old plans", () => {
    const html = render({ 3: { target: "new", gender: "other", temporaryLabel: "同名甲" } })
    expect(html).toContain('value="同名甲"')
    expect(html).toContain("重复导入沿用原标记")
    expect(html).toContain("未绑定有效线上账户时不能发布")
    expect(html).toContain("old-batch-id")
    expect(html).toContain("不改变发布规则")
  })

  it("preserves cancellation and displays precise row errors", () => {
    const input = review()
    input.rows[0].cancelled = true
    input.rows[0].errors = ["第 3 行与第 8 行指向同一成员"]
    const html = render({ 3: { target: "member:formal-id" } }, input)
    expect(html).toContain("本次更新不会恢复已取消的报名")
    expect(html).toContain("第 3 行与第 8 行指向同一成员")
  })

  it("uses readable labels for blank and date-slot values", () => {
    expect(importValueLabel(null)).toBe("空白")
    expect(importValueLabel([])).toBe("空白")
    expect(importValueLabel({ "2026-10-24": ["上午", "晚上"] })).toBe("2026-10-24 上午、晚上")
  })
})

describe("Excel import receipts", () => {
  it("shows durable identity, inserted/updated/unchanged counts and affected batches", () => {
    const html = renderToStaticMarkup(createElement(RoundImportHistory, { receipts: [receipt()] }))
    expect(html).toContain("import-operation-id")
    expect(html).toContain("新增 1 · 更新 1 · 无变化 1")
    expect(html).toContain("old-batch-id")
    expect(html).toContain("旧输入快照和方案仍保留")
  })

  it("labels a failed import as no writes and keeps the original receipt", () => {
    const html = renderToStaticMarkup(createElement(RoundImportHistory, { receipts: [receipt({ status: "failed", error_message: "答案已发生变化，请重新预览" })] }))
    expect(html).toContain("本次未写入")
    expect(html).toContain("答案已发生变化，请重新预览")
    expect(html).not.toContain("导入完成")
    expect(html).toContain("import-operation-id")
  })

  it("explains append semantics and requires a reviewed plan before confirming", () => {
    const html = renderToStaticMarkup(createElement(RoundImportPanel, { roundId: "round-id", roundStatus: "open" }))
    expect(html).toContain("未出现在 Excel 中的人和原有匹配方案会保留")
    expect(html).toContain("文件不超过 2 MB")
    expect(html).toContain("拆分后分别预览并追加导入")
    expect(html).not.toContain("覆盖当前轮次")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>确认导入<\/button>/)
    expect(html).toContain('minLength="4"')
    expect(html).toContain('maxLength="500"')
  })
})
