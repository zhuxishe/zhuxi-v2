import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { normalizeRoundConfig } from "@/lib/matching/round-config"
import { RoundAnswerList } from "./RoundAnswerList"
import { RoundSubmissionRecords } from "./RoundSubmissionRecords"

vi.mock("../SubmissionTable", () => ({ SubmissionTable: () => null }))
const cancelled = { id: "cancelled", cancelled_at: "2026-09-29T01:00:00Z", member: { member_identity: { full_name: "Cancelled member" } } }
const active = { id: "active", cancelled_at: null, member: { member_identity: { full_name: "Active member" } } }
const config = normalizeRoundConfig({})

describe("registration cancellation in admin records", () => {
  it("keeps cancelled history while clearly separating valid registration counts", () => {
    const html = renderToStaticMarkup(createElement(RoundSubmissionRecords, {
      roundName: "Event", purpose: "registration", config, submissions: [active, cancelled],
      editable: false, showRaw: true, onEdit: () => {}, onCreate: () => {},
    }))
    expect(html).toContain("有效 1 人 · 已取消 1 人")
    expect(html).toContain("Cancelled member")
    expect(html).toContain("Active member")
    expect(html).toContain("导出文件包含报名状态及取消时间")
  })

  it("does not claim a cancelled zero-question registration is confirmed attendance", () => {
    const html = renderToStaticMarkup(createElement(RoundAnswerList, { submissions: [cancelled], config, showRaw: true, registration: true }))
    expect(html).toContain("已取消")
    expect(html).toContain("2026-09-29 10:00")
    expect(html).toContain("该报名已取消，保留提交记录")
    expect(html).not.toContain("已确认参加")
  })

  it("shows cancellation state without exposing answers to restricted administrators", () => {
    const questions = normalizeRoundConfig({ questions: [{ id: "q", type: "text", label: { zh: "Private question" } }] })
    const html = renderToStaticMarkup(createElement(RoundAnswerList, { submissions: [{ ...cancelled, custom_answers: { q: "private saved answer" } }], config: questions, showRaw: false, registration: true }))
    expect(html).toContain("已取消")
    expect(html).not.toContain("private saved answer")
    expect(html).not.toContain("Private question")
  })
})
