import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { SubmissionTable } from "./SubmissionTable"

const submission = {
  id: "submission-1",
  member: { member_identity: { full_name: "测试成员", school_name: "测试学校" } },
  game_type_pref: "多人",
  gender_pref: "不限",
  availability: { "2026-10-23": ["下午", "晚上"] },
  message: "仅可展开后查看的答卷留言",
}

describe("submission table controls", () => {
  it("renders separate native expand and edit buttons without nested interactive controls", () => {
    const html = renderToStaticMarkup(createElement(SubmissionTable, {
      submissions: [submission],
      onEdit: vi.fn(),
    }))
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button.match(/<button\b/g)).toHaveLength(1)
      expect(button).toContain('type="button"')
    }
    expect(buttons[0]).toContain('aria-expanded="false"')
    expect(buttons[0]).toContain("测试成员")
    expect(buttons[0]).toContain("1天 2时段")
    expect(buttons[1]).toContain('aria-label="编辑问卷"')
    expect(buttons[1]).not.toContain("测试成员")
    expect(html).not.toContain(submission.message)
  })

  it.each([
    { editable: false, onEdit: vi.fn() },
    { editable: true },
  ])("retains read-only expansion without an edit action: %j", (props) => {
    const html = renderToStaticMarkup(createElement(SubmissionTable, {
      submissions: [submission],
      ...props,
    }))
    expect(html.match(/<button\b/g)).toHaveLength(1)
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('aria-label="编辑问卷"')
  })

  it("exposes no raw answers or edit/expand actions when raw viewing is forbidden", () => {
    const html = renderToStaticMarkup(createElement(SubmissionTable, {
      submissions: [submission],
      onEdit: vi.fn(),
      showRaw: false,
    }))
    expect(html).toContain("原始问卷仅超级管理员可查看")
    expect(html).not.toContain("<button")
    expect(html).not.toContain(submission.message)
    expect(html).not.toContain(submission.game_type_pref)
    expect(html).not.toContain("2026-10-23")
  })
})
