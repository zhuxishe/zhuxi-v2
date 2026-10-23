import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { MatchingRunRecord } from "@/lib/matching/run-lifecycle"
import { MatchingRunRecords } from "./MatchingRunRecords"
import { MatchingWorkbench } from "./MatchingWorkbench"

function record(number: number, changes: Partial<MatchingRunRecord> = {}): MatchingRunRecord {
  return {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`, round_id: "round-a", batch_number: number,
    status: "succeeded", session_id: `session-${number}`, session_name: `方案${number}`,
    created_at: "2026-10-23T01:00:00Z", updated_at: "2026-10-23T01:01:00Z", lease_expires_at: "2026-10-23T01:10:00Z",
    attempt: 1, error_code: null, can_recover: false, session_status: "draft", results_ready: true, publication_version: 0,
    ...changes,
  }
}
function renderRecords(runs: MatchingRunRecord[], auditReason = "核对本轮运行并恢复") {
  return renderToStaticMarkup(createElement(MatchingRunRecords, {
    runs, auditReason, loading: false, onRecover: vi.fn(), onAbandon: vi.fn(), onRefresh: vi.fn(),
  }))
}

describe("round batch records", () => {
  it("shows every batch with its operation identity and keeps old solution links", () => {
    const html = renderRecords(Array.from({ length: 8 }, (_, index) => record(index + 1)))
    expect(html).toContain("本轮运行记录（8）")
    expect(html).toContain("第 8 批")
    expect(html).toContain(record(8).id)
    expect(html).toContain("/admin/matching/session-1")
    expect(html).toContain("/admin/matching/session-8")
  })

  it("does not label an interrupted lease as a confirmed failure and gates recovery by server capability", () => {
    const running = record(1, { status: "running", session_id: null, results_ready: false })
    const busy = renderRecords([running])
    expect(busy).toContain("运行中")
    expect(busy).not.toContain("恢复本批")
    const interrupted = renderRecords([{ ...running, can_recover: true, can_abandon: true, lease_expired: true }])
    expect(interrupted).toContain("状态待确认")
    expect(interrupted).toContain("尚不能据此判断失败")
    expect(interrupted).toContain("恢复本批")
    expect(interrupted).toContain("作废运行")
    expect(interrupted).not.toContain("已失败")
  })

  it("requires an audit reason and supports abandon-only input failures", () => {
    const run = record(1, { status: "failed", session_id: null, can_recover: false, can_abandon: true, error_message: "原输入尚未保存，请作废后新增运行。" })
    const html = renderRecords([run], "")
    expect(html).toContain("原输入尚未保存")
    expect(html).not.toContain("恢复本批")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>作废运行<\/button>/)
  })

  it("keeps an acknowledged deleted solution as history without offering recovery", () => {
    const html = renderRecords([record(1, { session_id: null, session_deleted: true })])
    expect(html).toContain("原方案已被删除")
    expect(html).toContain("使用原运行编号不会重新生成")
    expect(html).not.toContain("恢复本批")
    expect(html).not.toContain("查看方案")
  })

  it("identifies old and new scoring versions while explaining frozen recovery", () => {
    const html = renderRecords([
      record(1, { algorithm_version: "max_coverage_split:2", adapter_version: 1 }),
      record(2, { algorithm_version: "max_coverage_split:3", adapter_version: 2 }),
    ])
    expect(html).toContain("原评分规则")
    expect(html).toContain("100分基础权重与活动互评")
    expect(html).toContain("原批输入和原评分版本")
    expect(html).toContain("不重新读取最新报名、人格权重或互评")
  })

  it("shows captured eligibility on failed runs even when no session exists", () => {
    const html = renderRecords([record(1, { status: "failed", session_id: null,
      error_code: "CANDIDATES_INSUFFICIENT", counts_available: true,
      submitted_count: 23, eligible_count: 0, excluded_count: 23,
      exclusion_summary: [{ reason: "unbound", count: 22 }, { reason: "profile_incomplete", count: 23 }],
    })])
    expect(html).toContain("本批冻结输入：已保存报名 23 人 · 符合资格 0 人 · 未通过 23 人")
    expect(html).toContain("未绑定账号 22 人")
    expect(html).toContain("不能将原因人数相加")
    expect(html).not.toContain("查看方案")
  })

  it("distinguishes uncaptured counts from confirmed zeros and keeps recovery independent", () => {
    const run = record(1, { status: "failed", session_id: null, can_recover: true,
      counts_available: false, submitted_count: 0, eligible_count: 0, excluded_count: 0,
    })
    const html = renderRecords([run])
    expect(html).toContain("本批资格人数未知")
    expect(html).not.toContain("已保存报名 0 人")
    expect(html).toContain("恢复本批")
    const redacted = renderRecords([{ ...run, counts_available: true,
      submitted_count: 5, eligible_count: 4, excluded_count: 1, exclusion_summary: null,
    }])
    expect(redacted).toContain("已保存报名 5 人")
    expect(redacted).toContain("排除原因暂不可读取")
  })
})

describe("matching workbench session history", () => {
  it("lists all current-round solutions with status and excludes other-round results", () => {
    const round = { id: "round-a", round_name: "当前轮次", status: "open", survey_start: "2020-01-01T00:00:00Z", survey_end: "2030-01-01T00:00:00Z", activity_start: "2026-10-23", activity_end: "2026-10-30", purpose: "matching" }
    const sessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`, round_id: "round-a", session_name: `本轮方案${index}`, total_candidates: 13, total_matched: 13,
      created_at: "2026-10-23T01:00:00Z", status: index === 0 ? "confirmed" : "draft", results_ready: true, publication_version: index === 0 ? 1 : 0,
    }))
    sessions.push({ ...sessions[0], id: "other", round_id: "round-b", session_name: "其他轮次方案" })
    const html = renderToStaticMarkup(createElement(MatchingWorkbench, { rounds: [round], sessions }))
    expect(html).toContain("本轮方案7")
    expect(html).toContain("本轮方案0")
    expect(html).toContain("已发布")
    expect(html).toContain("草稿已完成")
    expect(html).not.toContain("其他轮次方案")
    expect(html).toContain("收集中可运行，旧方案保留")
  })
})
