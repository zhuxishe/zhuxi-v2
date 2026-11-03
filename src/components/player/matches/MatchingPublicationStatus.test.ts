import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { MatchingPublication } from "@/lib/matching/publication-display"
import { MatchingPublicationStatus } from "./MatchingPublicationStatus"

const labels = { unmatched: "暂未匹配", waiting: "等待结果", withdrawn: "已撤回", cancelled: "已取消", staffMessage: "工作人员留言" }
const publication = (message?: string | null, status: MatchingPublication["status"] = "unmatched"): MatchingPublication => ({
  round_id: "round", round_name: "本期活动", session_id: "session", session_name: "内部批次名", publication_version: 1,
  published_at: "2026-11-03T00:00:00Z", status, result_id: null, ...(message !== undefined ? { unmatched_message: message } : {}),
})
const render = (item: MatchingPublication, copy = labels) => renderToStaticMarkup(createElement(MatchingPublicationStatus, { publications: [item], labels: copy }))

describe("player's frozen unmatched staff message", () => {
  it.each([undefined, null, "", " \n\t "])("preserves the existing card without a message section for %s", (message) => {
    const html = render(publication(message))
    expect(html).toContain("本期活动")
    expect(html).toContain("暂未匹配")
    expect(html).not.toContain("工作人员留言")
    expect(html).not.toContain("内部批次名")
  })
  it("shows public copy as escaped plain text with preserved line breaks", () => {
    const html = render(publication('  后续继续协调。\n<script>alert("x")</script>  '))
    expect(html).toContain("工作人员留言")
    expect(html).toContain("whitespace-pre-wrap")
    expect(html).toContain("后续继续协调。\n&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("href=")
  })
  it.each(["waiting", "withdrawn", "cancelled", "matched"] as const)("never reuses a message on %s status", (status) => {
    const html = render(publication("不应显示的留言", status))
    expect(html).not.toContain("不应显示的留言")
    expect(html).not.toContain("工作人员留言")
  })
  it("uses the localized title supplied by the participation page", () => {
    expect(render(publication("改めてご案内します。"), { ...labels, staffMessage: "スタッフからのメッセージ" })).toContain("スタッフからのメッセージ")
  })
})
