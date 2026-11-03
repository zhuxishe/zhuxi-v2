import { describe, expect, it } from "vitest"
import { exportUnmatchedReason, exportUnmatchedReasons } from "./export-unmatched-reason"

const diagnostic = (code = "not_selected") => ({ reason: code, details: { version: "matching_diagnostic:1", code,
  search_mode: "bounded", cohort_size: 12, shared_time_peer_count: 5, feasible_duo_count: 2, multi_max_shared_peer_count: 4 } })
describe("saved unmatched evidence exported as a dedicated reason", () => {
  it("retains the bounded-search limitation instead of claiming there is no feasible match", () => {
    expect(exportUnmatchedReason(diagnostic())).toContain("不能据此认定无法匹配")
    expect(exportUnmatchedReason(diagnostic())).toContain("限额搜索")
    expect(exportUnmatchedReason(diagnostic())).toContain("原批次共 12 人")
  })
  it("uses validated saved no-common-time diagnostics without recomputing them", () => {
    const row = diagnostic("no_common_time")
    Object.assign(row.details, { shared_time_peer_count: 0, feasible_duo_count: 0, multi_max_shared_peer_count: 0 })
    expect(exportUnmatchedReason(row)).toContain("原批次中，与其他候选人没有共同可用时段")
  })
  it.each(["waiting_duo", "waiting_multi"] as const)("prioritizes current %s placement over an old failed-match diagnosis", (placement) => {
    const text = exportUnmatchedReason(diagnostic("no_common_time"), { placement })
    expect(text).toContain("尚未")
    expect(text).toContain("并非已判定无法匹配")
    expect(text).not.toContain("原批次")
  })
  it("distinguishes an administrator's placement from an algorithmic rejection", () => {
    expect(exportUnmatchedReason({ reason: "unmatched_after_all_stages", details: { stage: "manual_board" } })).toBe("人工调整后暂未安排，未保存具体的算法排除原因")
  })
  it.each([null, undefined, {}, { reason: "unknown", details: {} }, diagnostic("invalid"), diagnostic("no_common_time")])("does not invent causes for missing or inconsistent diagnostic evidence", (row) => {
    expect(exportUnmatchedReason(row)).toBe("未保存具体未匹配原因，无法据此判断")
  })
  it("labels human-readable legacy evidence as historical and suppresses erased diagnostic details", () => {
    const old = { reason: "可用时段较少", details: null }
    expect(exportUnmatchedReason(old)).toContain("已保存的历史原因：可用时段较少")
    expect(exportUnmatchedReason(old)).toContain("不能据此判断当前")
    expect(exportUnmatchedReason(old, { anonymized: true })).toBe("成员已注销，不提供诊断信息")
  })
  it("keeps distinct saved diagnostic records instead of silently selecting the last one", () => {
    const first = diagnostic(), second = { details: { stage: "manual_board" } }
    expect(exportUnmatchedReasons([first, first])).toBe(exportUnmatchedReason(first))
    const text = exportUnmatchedReasons([first, second])
    expect(text).toContain("已保存多条诊断记录")
    expect(text).toContain("不能据此认定无法匹配")
    expect(text).toContain("人工调整后暂未安排")
    expect(exportUnmatchedReasons([first, second], { placement: "waiting_multi" })).not.toContain("多条")
  })
})
