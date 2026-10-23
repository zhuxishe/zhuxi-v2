// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MatchingEligibilitySummary, MatchingRunRecord } from "@/lib/matching/run-lifecycle"

const mocks = vi.hoisted(() => ({ run: vi.fn(), resume: vi.fn(), abandon: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock("@/lib/matching/use-survey-window", () => ({ useSurveyWindow: () => "open" }))
vi.mock("@/app/admin/matching/rounds/[id]/actions", () => ({ runRoundMatching: mocks.run }))
vi.mock("@/app/admin/matching/rounds/[id]/run-actions", () => ({ resumeRoundMatching: mocks.resume, abandonMatchingRun: mocks.abandon }))
vi.mock("@/app/admin/matching/rounds/[id]/status-actions", () => ({ updateRoundStatus: vi.fn() }))
vi.mock("./RoundStatsPanel", () => ({ RoundStatsPanel: () => null }))
vi.mock("./SubmissionEditDialog", () => ({ SubmissionEditDialog: () => null }))
vi.mock("./RoundImportPanel", () => ({ RoundImportPanel: () => null }))
vi.mock("./RoundOpeningDialog", () => ({ RoundOpeningDialog: () => null }))
vi.mock("./round-content/RoundSubmissionRecords", () => ({ RoundSubmissionRecords: () => null }))
vi.mock("./activity-reviews/RoundActivityReviewSummary", () => ({ RoundActivityReviewSummary: () => null }))
import { RoundDetailClient } from "./RoundDetailClient"

const round = { id: "round-a", round_name: "2026秋季10月匹配（测试）", purpose: "matching", status: "open",
  survey_start: "2026-10-01T00:00:00Z", survey_end: "2026-11-01T00:00:00Z", activity_start: "2026-10-25", activity_end: "2026-10-30" }
const summary: MatchingEligibilitySummary = { round_id: round.id, checked_at: "2026-10-24T01:00:00Z",
  submitted_count: 23, eligible_count: 20, excluded_count: 3, exclusion_summary: [{ reason: "profile_incomplete", count: 3 }] }
const run: MatchingRunRecord = { id: "00000000-0000-4000-8000-000000000001", round_id: round.id, batch_number: 1,
  status: "failed", attempt: 1, session_id: null, session_name: "原批输入", created_at: "2026-10-24T01:00:00Z",
  updated_at: "2026-10-24T01:01:00Z", lease_expires_at: null, error_code: "ENGINE_FAILED", can_recover: true,
  session_status: null, results_ready: null, publication_version: null,
  counts_available: true, submitted_count: 18, eligible_count: 16, excluded_count: 2, exclusion_summary: [] }
let root: Root

function button(name: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === name)!
}
async function render(eligibilitySummary: MatchingEligibilitySummary | null, submissions: Record<string, unknown>[] = []) {
  await act(async () => root.render(createElement(RoundDetailClient, { round, submissions,
    stats: { total: 23, gameTypeDist: { duo: 0, multi: 0, either: 23 }, slotCounts: {} },
    allMembers: [], canManageSubmissions: false, canImportMembers: false,
    initialNow: "2026-10-24T01:00:00Z", eligibilitySummary, initialRuns: [run],
  })))
  const input = document.getElementById("round-matching-reason") as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "核对本轮完整报名并运行")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("round eligibility preview and batch recovery integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    sessionStorage.clear()
    document.body.innerHTML = '<div id="root"></div>'
    root = createRoot(document.getElementById("root")!)
    mocks.run.mockResolvedValue({ sessionId: "new-session" })
    mocks.resume.mockResolvedValue({ sessionId: "recovered-session" })
  })
  afterEach(async () => { await act(async () => root.unmount()); sessionStorage.clear() })

  it("runs from the full-cohort eligibility count even if no submission rows are loaded", async () => {
    await render(summary)
    expect(button("运行匹配").disabled).toBe(false)
    await act(async () => button("运行匹配").click())
    expect(mocks.run).toHaveBeenCalledWith(round.id, `${round.round_name} 匹配`, "核对本轮完整报名并运行", expect.any(String))
    expect(mocks.push).toHaveBeenCalledWith("/admin/matching/new-session")
  })

  it.each([null, { ...summary, eligible_count: 0, excluded_count: 23 }])("blocks new runs for unknown or insufficient current eligibility, but restores frozen batches", async (eligibility) => {
    await render(eligibility, Array.from({ length: 500 }, (_, index) => ({ id: `submission-${index}`, member_id: `member-${index}` })))
    expect(button("运行匹配").disabled).toBe(true)
    expect(button("恢复本批").disabled).toBe(false)
    await act(async () => button("恢复本批").click())
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.resume).toHaveBeenCalledWith(run.id, "核对本轮完整报名并运行")
    expect(mocks.push).toHaveBeenCalledWith("/admin/matching/recovered-session")
  })

  it("both refresh controls reload the current preview and run metadata through the page", async () => {
    await render(null)
    await act(async () => button("刷新资格").click())
    await act(async () => button("刷新状态").click())
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.resume).not.toHaveBeenCalled()
  })
})
