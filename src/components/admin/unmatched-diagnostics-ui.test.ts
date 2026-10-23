import { describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { UnmatchedDiagnostics } from "./UnmatchedDiagnostics"

vi.mock("./PlayerInfoPopover", () => ({ PlayerInfoPopover: ({ children }: { children: string }) => children }))

const details = { version: "matching_diagnostic:1", code: "not_selected", cohort_size: 3,
  shared_time_peer_count: 2, feasible_duo_count: 2, multi_max_shared_peer_count: 0, search_mode: "exhaustive" }
const diagnostic = { id: "diagnostic", member_id: "member", reason: "not_selected", details,
  member: { member_identity: { full_name: "未分配成员" } } }
const prefs = { member: { game_type_pref: "多人", gender_pref: "男", availability: { "2026-10-27": ["晚上"] } } }

describe("saved unmatched diagnostic explanations", () => {
  it("displays frozen full-cohort facts without guessing from the visible unmatched member or current preferences", () => {
    const html = renderToStaticMarkup(createElement(UnmatchedDiagnostics, {
      diagnostics: [diagnostic], submissionPrefs: prefs, canViewRawSubmissions: true,
    }))
    expect(html).toContain("原批次共 3 人")
    expect(html).toContain("满足硬约束的双人候选 2 人")
    expect(html).toContain("不能据此认定无法匹配")
    expect(html).not.toContain("无法组建多人组")
    expect(html).not.toContain("性别偏好")
    expect(html).not.toContain("与其他未匹配者")
  })

  it("makes missing historical details explicit instead of treating generic stored reason text as evidence", () => {
    const html = renderToStaticMarkup(createElement(UnmatchedDiagnostics, {
      diagnostics: [{ ...diagnostic, details: null, reason: "约束组合导致无法匹配" }], canViewRawSubmissions: true,
    }))
    expect(html).toContain("历史记录未保存详细原因")
    expect(html).not.toContain("约束组合导致无法匹配")
  })

  it("never displays detailed cohort facts or untrusted detail payloads to ordinary administrators", () => {
    const html = renderToStaticMarkup(createElement(UnmatchedDiagnostics, {
      diagnostics: [{ ...diagnostic, details: { ...details, private_note: "私有黑名单与评分" } }], canViewRawSubmissions: false,
    }))
    expect(html).toContain("详细诊断已隐藏")
    expect(html).not.toContain("共同时间候选")
    expect(html).not.toContain("私有黑名单与评分")
  })
})
