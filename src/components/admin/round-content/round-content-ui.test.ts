import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { RoundDetailHeader } from "./RoundDetailHeader"
import { RoundSubmissionRecords } from "./RoundSubmissionRecords"
import { RoundQuestionEditor } from "./RoundQuestionEditor"
import { RoundBasicFields } from "./RoundBasicFields"
import { normalizeRoundConfig } from "@/lib/matching/round-config"

const round = { id: "test", round_name: "秋季迎新派对", status: "closed", survey_start: "2026-09-01T00:00:00Z", survey_end: "2026-09-29T00:00:00Z", activity_start: "2026-10-10", activity_end: "2026-10-10" }
const noop = () => {}
const config = normalizeRoundConfig({ questions: [{ id: "q1", type: "text", label: { zh: "备注", ja: "" }, required: false, options: [] }] })

describe("round administration purpose boundaries", () => {
  it("only offers matching controls for matching rounds", () => {
    const render = (purpose: string) => renderToStaticMarkup(createElement(RoundDetailHeader, { round: { ...round, purpose }, windowState: "closed", loading: false, count: 2, matchingReason: "重新运行检查", onOpen: noop, onClose: noop, onMatch: noop }))
    expect(render("matching")).toContain("运行匹配")
    expect(render("registration")).not.toContain("运行匹配")
    expect(render("announcement")).not.toContain("运行匹配")
    expect(render("registration")).toContain("重新开放报名")
    expect(render("announcement")).toContain("重新开放通知")
  })

  it("does not render raw answers or export controls to ordinary administrators", () => {
    const html = renderToStaticMarkup(createElement(RoundSubmissionRecords, { roundName: "test", purpose: "registration", config, submissions: [{ id: "sub1", created_at: "2026-09-29T00:00:00Z", custom_answers: { q1: "PRIVATE ANSWER" } }], editable: false, showRaw: false, onEdit: noop, onCreate: noop }))
    expect(html).not.toContain("PRIVATE ANSWER")
    expect(html).not.toContain("导出 CSV")
    expect(html).toContain("原始回答仅超级管理员可查看")
    expect(html).not.toContain("新增问卷")
  })

  it("has no response collection for announcements", () => {
    const html = renderToStaticMarkup(createElement(RoundSubmissionRecords, { roundName: "test", purpose: "announcement", config, submissions: [], editable: true, showRaw: true, onEdit: noop, onCreate: noop }))
    expect(html).toContain("不收集报名或问卷")
    expect(html).not.toContain("导出 CSV")
  })

  it("locks question structure while preserving wording edits", () => {
    const html = renderToStaticMarkup(createElement(RoundQuestionEditor, { question: config.questions[0], index: 0, count: 1, locale: "zh", locked: true, onChange: noop, onMove: noop, onDelete: noop }))
    expect(html).toMatch(/<select[^>]*disabled/)
    expect(html).toMatch(/type="checkbox"[^>]*disabled/)
    expect(html).toContain('value="备注"')
    expect(html).toMatch(/disabled[^>]*aria-label="删除问题"/)
  })

  it("keeps fixed activity dates editable while purpose and matching dates stay locked", () => {
    const draft = { roundName: "活动", purpose: "registration" as const, surveyStart: "2026-09-01T09:00", surveyEnd: "2026-10-16T09:00", activityStart: "2026-10-10", activityEnd: "2026-10-10", contentConfig: { ...config, eventStart: "2026-10-10T04:00:00Z", eventEnd: "2026-10-10T08:00:00Z" } }
    const registration = renderToStaticMarkup(createElement(RoundBasicFields, { draft, locked: true, onChange: noop }))
    expect(registration).toMatch(/<select[^>]* disabled=""/)
    expect(registration).not.toMatch(/<input[^>]* disabled=""/)
    const matching = renderToStaticMarkup(createElement(RoundBasicFields, { draft: { ...draft, purpose: "matching" }, locked: true, onChange: noop }))
    expect(matching).toMatch(/type="date"[^>]* disabled=""/)
  })
})
